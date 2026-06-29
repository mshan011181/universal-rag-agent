"""
pgvector_store.py — vector storage on PostgreSQL (pgvector), the free, same-DB
alternative to Pinecone. Used when VECTOR_BACKEND=pgvector.

Schema: one table `doc_chunks(id, namespace, source, content, embedding, metadata)`
with an HNSW cosine index on `embedding`. Connection reuses DATABASE_URL
(the same Cloud SQL Postgres the rest of the app uses).
"""

import json
import os
import threading

import numpy as np
import psycopg2
import psycopg2.extras
from pgvector.psycopg2 import register_vector

from src.config import EMBEDDING_DIM


def _vec(embedding) -> np.ndarray:
    """pgvector's psycopg2 adapter handles numpy arrays — coerce lists to one."""
    return np.asarray(embedding, dtype=np.float32)

_conn = None
_lock = threading.Lock()
_schema_ready = False


def _connect():
    global _conn
    dsn = os.getenv("DATABASE_URL", "")
    if not dsn:
        raise RuntimeError("DATABASE_URL not set — pgvector backend requires PostgreSQL.")
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
    register_vector(conn)
    return conn


def _get_conn():
    global _conn
    with _lock:
        if _conn is None or _conn.closed:
            _conn = _connect()
        return _conn


def ensure_schema() -> None:
    global _schema_ready
    if _schema_ready:
        return
    conn = _get_conn()
    with conn.cursor() as cur:
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS doc_chunks (
                id        TEXT PRIMARY KEY,
                namespace TEXT NOT NULL,
                source    TEXT,
                content   TEXT,
                embedding vector({EMBEDDING_DIM}),
                metadata  JSONB
            )
        """)  # nosec B608 — EMBEDDING_DIM is an int constant, not user input
        cur.execute("CREATE INDEX IF NOT EXISTS doc_chunks_ns_idx ON doc_chunks(namespace)")
        cur.execute("CREATE INDEX IF NOT EXISTS doc_chunks_src_idx ON doc_chunks(namespace, source)")
        cur.execute("CREATE INDEX IF NOT EXISTS doc_chunks_embed_idx "
                    "ON doc_chunks USING hnsw (embedding vector_cosine_ops)")
    _schema_ready = True


def upsert(rows: list[dict], namespace: str) -> int:
    """rows: [{id, embedding(list[float]), metadata(dict incl. 'source','content')}]."""
    if not rows:
        return 0
    ensure_schema()
    conn = _get_conn()
    payload = []
    for r in rows:
        meta = dict(r.get("metadata", {}))
        content = meta.get("content", "")
        source = meta.get("source", "")
        payload.append((r["id"], namespace, source, content, _vec(r["embedding"]), json.dumps(meta)))
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(
            cur,
            """INSERT INTO doc_chunks (id, namespace, source, content, embedding, metadata)
               VALUES %s
               ON CONFLICT (id) DO UPDATE SET
                 namespace=EXCLUDED.namespace, source=EXCLUDED.source,
                 content=EXCLUDED.content, embedding=EXCLUDED.embedding,
                 metadata=EXCLUDED.metadata""",
            payload,
            template="(%s,%s,%s,%s,%s,%s::jsonb)",
        )
    return len(payload)


def query(embedding: list[float], k: int, namespace: str,
          source_filters: list[str] | None = None) -> list[dict]:
    """Return [{content, metadata, score}] by cosine similarity (score = 1 - distance)."""
    ensure_schema()
    conn = _get_conn()
    where = "namespace = %s"
    # Param order must match the %s placeholders left-to-right:
    #   SELECT (embedding) , WHERE (namespace [, source_filters]) , ORDER BY (embedding) , LIMIT (k)
    vec = _vec(embedding)
    args: list = [vec, namespace]
    if source_filters:
        where += " AND source = ANY(%s)"
        args.append(list(source_filters))
    args += [vec, k]
    sql = (f"SELECT content, metadata, 1 - (embedding <=> %s) AS score "  # nosec B608 — {where} is constant; values are parameterized
           f"FROM doc_chunks WHERE {where} "
           f"ORDER BY embedding <=> %s LIMIT %s")
    with conn.cursor() as cur:
        cur.execute(sql, args)
        out = []
        for content, meta, score in cur.fetchall():
            meta = meta or {}
            meta.pop("content", None)
            out.append({"content": content or "", "metadata": meta, "score": round(float(score), 4)})
    return out


def delete_by_source(source_name: str, namespace: str) -> int:
    """Delete all chunks for a source (and its modality-prefixed variants)."""
    ensure_schema()
    conn = _get_conn()
    base = source_name.strip()
    variants = [base, f"image:{base}", f"video:{base}", f"audio:{base}", f"weblink:{base}"]
    with conn.cursor() as cur:
        cur.execute("DELETE FROM doc_chunks WHERE namespace=%s AND source = ANY(%s)",
                    (namespace, variants))
        return cur.rowcount or 0


def count(namespace: str | None = None) -> int:
    ensure_schema()
    conn = _get_conn()
    with conn.cursor() as cur:
        if namespace:
            cur.execute("SELECT COUNT(*) FROM doc_chunks WHERE namespace=%s", (namespace,))
        else:
            cur.execute("SELECT COUNT(*) FROM doc_chunks")
        return int(cur.fetchone()[0])


def migrate_from_pinecone() -> dict:
    """One-time copy of all vectors+metadata from Pinecone into pgvector.

    Runs inside Cloud Run (has both the Pinecone key and DATABASE_URL). Safe to
    re-run: upserts by id. Returns per-namespace counts.
    """
    from pinecone import Pinecone
    from src.config import PINECONE_API_KEY, PINECONE_INDEX_NAME
    ensure_schema()
    pc = Pinecone(api_key=PINECONE_API_KEY)
    index = pc.Index(PINECONE_INDEX_NAME)
    stats = index.describe_index_stats()
    result: dict = {}
    for ns in list(stats.get("namespaces", {}).keys()):
        ids: list[str] = []
        for page in index.list(namespace=ns):
            for item in page:
                ids.append(item if isinstance(item, str) else getattr(item, "id", str(item)))
        migrated = 0
        for i in range(0, len(ids), 100):
            batch = ids[i:i + 100]
            fetched = index.fetch(ids=batch, namespace=ns)
            vectors = getattr(fetched, "vectors", None) or fetched.get("vectors", {})
            rows = []
            for vid, vec in vectors.items():
                values = getattr(vec, "values", None) or vec.get("values")
                meta = getattr(vec, "metadata", None) or vec.get("metadata") or {}
                rows.append({"id": vid, "embedding": list(values), "metadata": dict(meta)})
            if rows:
                migrated += upsert(rows, namespace=ns)
        result[ns] = migrated
    return result
