from dataclasses import dataclass, field
from typing import Optional


@dataclass
class RAGAgentResponse:
    # Core answer
    answer_text: str
    citation_map: dict = field(default_factory=dict)

    # Quality signals
    quality_score: float = 0.0
    faithfulness: str = "pass"   # 'pass' | 'warn' | 'fail'
    confidence: str = "LOW"      # 'HIGH' | 'MEDIUM' | 'LOW'
    retry_count: int = 0

    # Pattern telemetry
    patterns_used: list = field(default_factory=list)
    latency_ms: int = 0
    retrieval_channel: str = "vector"  # 'vector' | 'graph' | 'web' | 'mixed'
    fallback_used: bool = False

    # Memory signals
    verified_knowledge_hit: bool = False
    memory_write: dict = field(default_factory=dict)

    # Continuation
    suggested_followups: list = field(default_factory=list)

    # Token usage for this query (input, output, cost)
    token_usage: dict = field(default_factory=dict)

    def __post_init__(self):
        if self.quality_score >= HIGH_CONFIDENCE:
            self.confidence = "HIGH"
        elif self.quality_score >= 0.65:
            self.confidence = "MEDIUM"
        else:
            self.confidence = "LOW"


HIGH_CONFIDENCE = 0.85
