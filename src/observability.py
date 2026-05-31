"""Structured logging + custom Prometheus metrics for the RAG pipeline."""
import structlog
import logging
from prometheus_client import Counter, Histogram, Gauge

# ── Structured logging setup ─────────────────────────────────────────────────
def setup_logging(env: str = "development"):
    processors = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if env == "production":
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=logging.INFO)


# ── Prometheus custom metrics ─────────────────────────────────────────────────
query_counter = Counter(
    "rag_queries_total",
    "Total queries processed",
    ["pattern", "confidence", "channel"],
)

query_latency = Histogram(
    "rag_query_latency_ms",
    "Query latency in milliseconds",
    ["pattern_combo"],
    buckets=[100, 250, 500, 1000, 2000, 4000, 8000, 15000],
)

quality_score = Histogram(
    "rag_quality_score",
    "Quality scores distribution",
    ["pattern_combo"],
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
)

fallback_counter = Counter(
    "rag_web_fallback_total",
    "Times CRAG fired web search fallback",
)

cache_hit_counter = Counter(
    "rag_cache_hits_total",
    "Verified knowledge cache hits",
)

chunk_count_gauge = Gauge(
    "rag_vector_store_chunks",
    "Total chunks in vector store",
)

ingestion_counter = Counter(
    "rag_documents_ingested_total",
    "Total documents ingested",
    ["file_type"],
)


def record_query_metrics(response, patterns: list):
    combo = "+".join(patterns[:3])
    for p in patterns:
        query_counter.labels(
            pattern=p,
            confidence=response.confidence,
            channel=response.retrieval_channel,
        ).inc()
    query_latency.labels(pattern_combo=combo).observe(response.latency_ms)
    quality_score.labels(pattern_combo=combo).observe(response.quality_score)
    if response.fallback_used:
        fallback_counter.inc()
    if response.verified_knowledge_hit:
        cache_hit_counter.inc()
