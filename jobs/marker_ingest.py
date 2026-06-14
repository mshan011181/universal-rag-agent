"""Cloud Run Job entrypoint — STEM PDF ingestion via Marker.

Runs as a scale-to-zero Cloud Run Job, triggered by the API when a document
is uploaded with the "Process as STEM (Marker)" option. Marker needs ~16Gi
RAM + 4 CPU, which the always-on API service cannot afford; running it as a
per-execution Job means we only pay while a STEM PDF is actually processing.

Inputs (passed as container env overrides at execution time):
    INGEST_ID    — ingest_history row id to update
    GCS_OBJECT   — object name of the staged upload in MEDIA_BUCKET
    NAMESPACE    — Pinecone namespace (org_id)
    SOURCE_NAME  — original filename (display + vector id prefix)

The image is the same as the API (it already bundles Marker + deps); only the
container command differs. Secrets/env (DATABASE_URL, PINECONE_*, MEDIA_BUCKET,
ENABLE_MARKER, batch-size caps) are configured on the Job at deploy time.
"""
import os
import sys
import tempfile
from pathlib import Path


def _update_status(ingest_id: str, status: str, chunks: int = 0) -> None:
    from src.memory.sqlite_store import get_conn
    with get_conn() as c:
        c.execute(
            "UPDATE ingest_history SET status=?, chunks_created=? WHERE ingest_id=?",
            (status, chunks, ingest_id),
        )
        c.commit()


def main() -> int:
    ingest_id = os.environ["INGEST_ID"]
    gcs_object = os.environ["GCS_OBJECT"]
    namespace = os.environ.get("NAMESPACE", "default")
    source_name = os.environ["SOURCE_NAME"]
    bucket_name = os.environ["MEDIA_BUCKET"]

    print(f"[marker-job] start ingest_id={ingest_id} object={gcs_object} "
          f"namespace={namespace} source={source_name}", flush=True)

    from src.memory.sqlite_store import set_ingest_progress
    from src.retrieval.vector_store import ingest_file
    from google.cloud import storage

    tmp_dir = tempfile.mkdtemp()
    suffix = Path(source_name).suffix or ".pdf"
    local_path = Path(tmp_dir) / f"{ingest_id}{suffix}"

    try:
        set_ingest_progress(ingest_id, 3, "Downloading file")
        blob = storage.Client().bucket(bucket_name).blob(gcs_object)
        blob.download_to_filename(str(local_path))
        print(f"[marker-job] downloaded {local_path.stat().st_size} bytes", flush=True)

        def _on_progress(pct: int, label: str) -> None:
            set_ingest_progress(ingest_id, pct, label)

        n = ingest_file(
            str(local_path),
            namespace=namespace,
            source_name=source_name,
            on_progress=_on_progress,
            force_marker=True,
        )
        set_ingest_progress(ingest_id, 100, "Done")
        _update_status(ingest_id, "done", n)
        print(f"[marker-job] complete chunks={n}", flush=True)

        # Best-effort cleanup of the staged upload
        try:
            blob.delete()
        except Exception:
            pass
        return 0
    except Exception as e:
        print(f"[marker-job] FAILED: {type(e).__name__}: {e}", flush=True)
        try:
            _update_status(ingest_id, "failed", 0)
        except Exception:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
