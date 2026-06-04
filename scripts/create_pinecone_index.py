"""
Creates the Pinecone index required by the Universal RAG Agent.

Run once before starting the application:
    python scripts/create_pinecone_index.py

Reads PINECONE_API_KEY and PINECONE_INDEX_NAME from the environment / .env file.
Dimension 384 matches the all-MiniLM-L6-v2 embedding model used throughout the app.
"""

import os
import sys
import time
from pathlib import Path

# Allow running from repo root without installing the package
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from pinecone import Pinecone, ServerlessSpec

DIMENSION = 384        # all-MiniLM-L6-v2 output dimension
METRIC = "cosine"
CLOUD = "aws"
REGION = "us-east-1"   # cheapest free-tier region; change if your account uses another


def main() -> None:
    api_key = os.getenv("PINECONE_API_KEY", "")
    index_name = os.getenv("PINECONE_INDEX_NAME", "universal-rag")

    if not api_key:
        sys.exit(
            "ERROR: PINECONE_API_KEY is not set.\n"
            "Add it to your .env file or export it before running this script."
        )

    pc = Pinecone(api_key=api_key)
    existing = [idx.name for idx in pc.list_indexes()]

    if index_name in existing:
        idx = pc.Index(index_name)
        stats = idx.describe_index_stats()
        print(
            f"Index '{index_name}' already exists — "
            f"{stats.get('total_vector_count', 0)} vectors, "
            f"dimension={stats.get('dimension', '?')}."
        )
        print("Nothing to do.")
        return

    print(f"Creating Pinecone index '{index_name}' ...")
    print(f"  dimension : {DIMENSION}")
    print(f"  metric    : {METRIC}")
    print(f"  cloud     : {CLOUD} / {REGION}")

    pc.create_index(
        name=index_name,
        dimension=DIMENSION,
        metric=METRIC,
        spec=ServerlessSpec(cloud=CLOUD, region=REGION),
    )

    # Wait until the index is ready to accept writes
    print("Waiting for index to become ready", end="", flush=True)
    for _ in range(60):
        desc = pc.describe_index(index_name)
        if desc.status.get("ready", False):
            break
        print(".", end="", flush=True)
        time.sleep(2)
    else:
        print(
            "\nWARNING: Index did not become ready within 2 minutes. "
            "Check your Pinecone console."
        )
        return

    print(f"\nIndex '{index_name}' is ready.")


if __name__ == "__main__":
    main()
