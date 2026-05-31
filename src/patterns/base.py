from abc import ABC, abstractmethod
from src.retrieval.vector_store import retrieve
from src.generation.llm import get_llm, safe_invoke
from langchain_core.messages import SystemMessage, HumanMessage


class BasePattern(ABC):
    name: str = "base"

    @abstractmethod
    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        """Returns dict with keys: query, chunks, answer (optional), channel"""
        pass

    def _retrieve(self, query: str, k: int = 5) -> list[dict]:
        return retrieve(query, k=k)

    def _llm_call(self, system: str, human: str, temperature: float = 0.1) -> str:
        llm = get_llm(temperature=temperature)
        return safe_invoke(llm, [SystemMessage(content=system), HumanMessage(content=human)])
