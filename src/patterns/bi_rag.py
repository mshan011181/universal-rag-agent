"""
BIRag — Pandas Code Generation + Safe Execution

For analytical queries over Excel / CSV files:
  1. Detect BI intent from query keywords
  2. Load schemas (column names + sample rows) of the user's spreadsheet files
  3. LLM generates pandas code to answer the question
  4. Execute in a restricted sandbox with a timeout
  5. Return the computed result as the answer

Falls back silently (returns {}) if:
  - No spreadsheet files are found for the user
  - Code generation or execution fails
"""

import io
import re
import sys
import textwrap
import threading
import traceback
from pathlib import Path

from .base import BasePattern
from src.memory.sqlite_store import get_spreadsheet_files
from src.config import UPLOADS_DIR


# ── BI keyword detection ──────────────────────────────────────────────────────
_BI_KEYWORDS = [
    # Explicit spreadsheet/data-file references
    "both excel", "both spreadsheet", "from both files", "two excel files",
    "across both files", "from the excel", "from the spreadsheet",
    "in the excel", "in the spreadsheet", "excel file", "spreadsheet file",
    # SQL-like operations only meaningful over tabular data
    "group by", "join the", "merge the", "pivot table",
    "year over year", "month over month", "quarter over quarter",
    # Business metrics only meaningful in a data file context
    "total revenue", "total sales", "total profit", "total cost",
    "sum of revenue", "sum of sales", "revenue by", "sales by",
    "profit margin", "cost per", "expense breakdown",
]

_EXEC_TIMEOUT_SEC = 30  # max time for pandas execution


class BIRag(BasePattern):
    name = "bi_rag"

    # ── Public interface ──────────────────────────────────────────────────────

    def run(self, query: str, analysis: dict, **kwargs) -> dict:
        # Skip keyword check when the caller (BI page or force_bi flag) already
        # confirmed this is a BI query via analysis["is_bi_query"].
        if not analysis.get("is_bi_query", False) and not self._is_bi_query(query):
            return {}

        user_id = analysis.get("user_id", "")
        if not user_id:
            return {}

        files = get_spreadsheet_files(user_id)
        if not files:
            return {}

        # Build schema info and variable mapping
        schema_lines: list[str] = []
        var_map: dict[str, str] = {}   # varname → absolute file path
        ext_map: dict[str, str] = {}   # varname → extension

        for i, f in enumerate(files[:6]):
            file_path = self._resolve_path(f)
            if not file_path:
                continue
            var = f"df{i + 1}" if len(files) > 1 else "df"
            var_map[var] = str(file_path)
            ext_map[var] = file_path.suffix.lower()
            schema_lines.append(self._get_schema(var, f["source_name"], file_path))

        if not var_map:
            return {}

        schema_text = "\n".join(schema_lines)

        # Build load statements shown to the LLM (so it knows DataFrames exist)
        load_stmts = self._build_load_stmts(var_map, ext_map)

        # Generate pandas code via LLM
        code = self._generate_code(query, schema_text, load_stmts, var_map)
        if not code:
            return {}

        # Execute: prepend real load statements (with actual paths)
        real_load = self._build_real_load(var_map, ext_map)
        full_code = real_load + "\n\n" + code

        result = self._safe_exec(full_code)

        if result.startswith("ERROR:"):
            # Try one more time with error hint
            code2 = self._generate_code(
                query, schema_text, load_stmts, var_map,
                error_hint=result
            )
            if code2:
                full_code2 = real_load + "\n\n" + code2
                result = self._safe_exec(full_code2)

        if result.startswith("ERROR:") or not result.strip():
            return {}

        answer = (
            f"**BI Analysis Result**\n\n{result.strip()}"
            if len(result) <= 3000
            else f"**BI Analysis Result** *(truncated)*\n\n{result[:3000]}…"
        )

        return {
            "answer": answer,
            "channel": "bi_computation",
            "chunks": [],   # no vector chunks used
        }

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _is_bi_query(query: str) -> bool:
        q = query.lower()
        return any(kw in q for kw in _BI_KEYWORDS)

    @staticmethod
    def _resolve_path(file_record: dict) -> Path | None:
        """Return Path from source_url (saved file path) stored at ingest time."""
        raw = file_record.get("source_url") or ""
        if raw:
            p = Path(raw)
            if p.exists():
                return p
        # Fallback: scan uploads dir for user_id + extension match
        user_id = file_record.get("user_id", "")
        ext = Path(file_record.get("source_name", "")).suffix.lower()
        if user_id and ext:
            matches = list(UPLOADS_DIR.glob(f"{user_id}_*{ext}"))
            if matches:
                return matches[0]
        return None

    @staticmethod
    def _get_schema(var: str, source_name: str, file_path: Path) -> str:
        try:
            import pandas as pd
            if file_path.suffix.lower() == ".csv":
                df = pd.read_csv(str(file_path), nrows=5)
            else:
                df = pd.read_excel(str(file_path), nrows=5)
            lines = [
                f"### {var} = '{source_name}'",
                f"Columns ({len(df.columns)}): {list(df.columns)}",
                f"Total rows (approx): use {var}.shape[0] to get exact count",
                f"Data types: {df.dtypes.to_dict()}",
                "Sample (first 5 rows):",
                df.to_string(index=False),
            ]
            return "\n".join(str(l) for l in lines)
        except Exception as e:
            return f"### {var} = '{source_name}'\n(Schema unavailable: {e})"

    @staticmethod
    def _build_load_stmts(var_map: dict, ext_map: dict) -> str:
        """Placeholder load statements shown to LLM (paths hidden)."""
        lines = []
        for var, _ in var_map.items():
            ext = ext_map[var]
            fn = "read_csv" if ext == ".csv" else "read_excel"
            lines.append(f"{var} = pd.{fn}('<path_to_{var}_file>')")
        return "\n".join(lines)

    @staticmethod
    def _build_real_load(var_map: dict, ext_map: dict) -> str:
        """Actual load statements injected before LLM code at execution time."""
        lines = ["import pandas as pd", "import numpy as np"]
        for var, path in var_map.items():
            ext = ext_map[var]
            fn = "read_csv" if ext == ".csv" else "read_excel"
            path.replace("\\", "\\\\")
            lines.append(f'{var} = pd.{fn}(r"{path}")')
        return "\n".join(lines)

    def _generate_code(
        self,
        query: str,
        schema_text: str,
        load_stmts: str,
        var_map: dict,
        error_hint: str = "",
    ) -> str:
        var_list = ", ".join(var_map.keys())
        error_section = (
            f"\nPrevious attempt failed with: {error_hint}\nPlease fix the issue.\n"
            if error_hint else ""
        )
        system = textwrap.dedent(f"""
            You are a senior pandas data analyst. Given spreadsheet schemas and a
            business question, write clean Python/pandas code to answer it.

            Rules:
            - DataFrames already loaded as: {var_list}
            - pandas (pd) and numpy (np) already imported — do NOT re-import
            - Use print() for ALL output — the result must be printed
            - Round numeric results to 2 decimal places
            - Format currency with $ prefix if column name suggests money
            - If joining two DataFrames, infer the join key from column names
            - Output should be human-readable, not raw DataFrame repr
            - Write ONLY the analysis code — no load statements, no markdown prose
            - Wrap code in ```python ... ``` fences
        """).strip()

        human = textwrap.dedent(f"""
            Available DataFrames:
            {schema_text}

            Load statements (already executed — DO NOT repeat):
            {load_stmts}
            {error_section}
            Business question: {query}

            Write pandas code to answer this question.
        """).strip()

        try:
            raw = self._llm_call(system, human, temperature=0.0)
            # Extract code block
            m = re.search(r"```(?:python)?\n(.*?)```", raw, re.DOTALL)
            if m:
                return m.group(1).strip()
            # No fences — return whole response if it looks like code
            if "print(" in raw or "df" in raw:
                return raw.strip()
        except Exception:
            pass
        return ""

    @staticmethod
    def _safe_exec(code: str) -> str:
        """Execute code with stdout capture and wall-clock timeout."""
        buf = io.StringIO()
        result_holder: list[str] = []
        error_holder: list[str] = []

        def _run():
            old_stdout = sys.stdout
            sys.stdout = buf
            try:
                exec(code, {  # noqa: S102
                    "__builtins__": {
                        "print": print, "len": len, "range": range,
                        "enumerate": enumerate, "zip": zip, "list": list,
                        "dict": dict, "str": str, "int": int, "float": float,
                        "bool": bool, "round": round, "sum": sum,
                        "max": max, "min": min, "abs": abs,
                        "sorted": sorted, "type": type,
                        "isinstance": isinstance, "hasattr": hasattr,
                        "getattr": getattr, "tuple": tuple, "set": set,
                        "any": any, "all": all, "map": map, "filter": filter,
                        "True": True, "False": False, "None": None,
                    },
                    "pd": __import__("pandas"),
                    "np": __import__("numpy"),
                })
                result_holder.append(buf.getvalue())
            except Exception as exc:
                error_holder.append(
                    f"ERROR: {exc}\n{traceback.format_exc()[-800:]}"
                )
            finally:
                sys.stdout = old_stdout

        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=_EXEC_TIMEOUT_SEC)

        if t.is_alive():
            return "ERROR: Execution timed out (>30s)."
        if error_holder:
            return error_holder[0]
        return result_holder[0] if result_holder else ""
