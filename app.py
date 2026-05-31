import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import streamlit as st
import uuid
import time
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(
    page_title="Universal RAG Agent",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── CSS ──────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
/* Global */
body { font-family: 'Inter', sans-serif; }

/* Header */
.rag-header {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    padding: 2rem 2.5rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
    color: white;
}
.rag-header h1 { margin: 0; font-size: 2rem; font-weight: 700; }
.rag-header p { margin: 0.3rem 0 0; opacity: 0.75; font-size: 0.95rem; }

/* Answer card */
.answer-card {
    background: #f8faff;
    border: 1px solid #e0e7ff;
    border-left: 4px solid #4f46e5;
    border-radius: 10px;
    padding: 1.4rem 1.6rem;
    margin-bottom: 1rem;
    line-height: 1.7;
}

/* Confidence badges */
.badge {
    display: inline-block;
    padding: 0.2rem 0.7rem;
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 600;
    margin-right: 0.4rem;
}
.badge-high   { background: #d1fae5; color: #065f46; }
.badge-medium { background: #fef3c7; color: #92400e; }
.badge-low    { background: #fee2e2; color: #991b1b; }
.badge-pass   { background: #d1fae5; color: #065f46; }
.badge-warn   { background: #fef3c7; color: #92400e; }
.badge-fail   { background: #fee2e2; color: #991b1b; }
.badge-pattern{ background: #ede9fe; color: #4c1d95; }
.badge-channel{ background: #e0f2fe; color: #075985; }
.badge-cache  { background: #d1fae5; color: #065f46; }

/* Source chips */
.source-chip {
    display: inline-block;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 0.2rem 0.6rem;
    font-size: 0.78rem;
    margin: 0.2rem;
    color: #334155;
}

/* Follow-up buttons */
.followup-btn {
    background: #ede9fe;
    border: 1px solid #c4b5fd;
    border-radius: 8px;
    padding: 0.5rem 0.9rem;
    font-size: 0.85rem;
    color: #4c1d95;
    cursor: pointer;
    margin: 0.3rem;
    transition: background 0.2s;
}

/* Metrics row */
.metric-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.8rem;
    flex-wrap: wrap;
}
.metric-box {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.6rem 1rem;
    text-align: center;
    min-width: 90px;
}
.metric-box .value { font-size: 1.3rem; font-weight: 700; color: #1e293b; }
.metric-box .label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; }

/* Chat messages */
.chat-user {
    background: #ede9fe;
    border-radius: 12px 12px 4px 12px;
    padding: 0.8rem 1rem;
    margin: 0.5rem 0;
    max-width: 80%;
    margin-left: auto;
    color: #1e1b4b;
}
.chat-assistant {
    background: #f8faff;
    border: 1px solid #e0e7ff;
    border-radius: 12px 12px 12px 4px;
    padding: 0.8rem 1rem;
    margin: 0.5rem 0;
    max-width: 90%;
}

/* Sidebar */
.sidebar-section {
    background: #f8faff;
    border-radius: 8px;
    padding: 0.8rem;
    margin-bottom: 0.8rem;
}

/* Step timeline */
.step-item {
    border-left: 2px solid #818cf8;
    padding-left: 0.8rem;
    margin: 0.4rem 0;
    font-size: 0.85rem;
}
</style>
""", unsafe_allow_html=True)


# ── Session state ─────────────────────────────────────────────────────────────
if "session_id" not in st.session_state:
    st.session_state.session_id = str(uuid.uuid4())[:8]
if "messages" not in st.session_state:
    st.session_state.messages = []
if "last_analysis" not in st.session_state:
    st.session_state.last_analysis = None
if "last_response" not in st.session_state:
    st.session_state.last_response = None
if "pending_query" not in st.session_state:
    st.session_state.pending_query = ""


# ── Header ────────────────────────────────────────────────────────────────────
st.markdown("""
<div class="rag-header">
  <h1>🧠 Universal RAG Agent</h1>
  <p>14 RAG Patterns · Groq Llama 3.3-70b · ChromaDB · Self-Improving Memory</p>
</div>
""", unsafe_allow_html=True)


# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("### ⚙️ Configuration")

    api_key = st.text_input("Groq API Key", value=os.getenv("GROQ_API_KEY", ""), type="password")
    if api_key:
        os.environ["GROQ_API_KEY"] = api_key

    tavily_key = st.text_input("Tavily API Key (optional)", value=os.getenv("TAVILY_API_KEY", ""), type="password")
    if tavily_key:
        os.environ["TAVILY_API_KEY"] = tavily_key

    cohere_key = st.text_input("Cohere API Key (optional)", value=os.getenv("COHERE_API_KEY", ""), type="password")
    if cohere_key:
        os.environ["COHERE_API_KEY"] = cohere_key

    st.markdown("---")
    st.markdown("### 📄 Document Ingestion")

    uploaded = st.file_uploader(
        "Upload documents",
        type=["pdf", "txt", "docx"],
        accept_multiple_files=True,
    )

    if uploaded:
        if st.button("Ingest Documents", type="primary", use_container_width=True):
            from src.retrieval.vector_store import ingest_file
            from src.config import UPLOADS_DIR
            progress = st.progress(0)
            total_chunks = 0
            for i, f in enumerate(uploaded):
                save_path = UPLOADS_DIR / f.name
                save_path.write_bytes(f.read())
                try:
                    n = ingest_file(str(save_path))
                    total_chunks += n
                    st.success(f"✓ {f.name} → {n} chunks")
                except Exception as e:
                    st.error(f"✗ {f.name}: {e}")
                progress.progress((i + 1) / len(uploaded))
            st.info(f"Total: {total_chunks} chunks indexed")

    st.markdown("---")
    st.markdown("### 📚 Paste Text")
    manual_text = st.text_area("Paste text to index", height=100, placeholder="Paste any text here...")
    manual_source = st.text_input("Source label", value="manual_text")
    if st.button("Index Text", use_container_width=True):
        if manual_text.strip():
            from src.retrieval.vector_store import ingest_text
            n = ingest_text(manual_text, source=manual_source)
            st.success(f"Indexed {n} chunks from '{manual_source}'")
        else:
            st.warning("No text provided.")

    st.markdown("---")
    st.markdown("### 📊 Knowledge Base Stats")
    try:
        from src.retrieval.vector_store import collection_count, list_sources
        count = collection_count()
        sources = list_sources()
        st.metric("Total Chunks", count)
        if sources:
            st.markdown("**Sources:**")
            for s in sources[:10]:
                st.markdown(f"- `{s}`")
    except Exception:
        st.info("No documents indexed yet.")

    st.markdown("---")
    st.markdown("### 🔄 Session")
    st.code(f"Session ID: {st.session_state.session_id}", language=None)
    if st.button("New Session", use_container_width=True):
        st.session_state.session_id = str(uuid.uuid4())[:8]
        st.session_state.messages = []
        st.session_state.last_analysis = None
        st.session_state.last_response = None
        st.rerun()

    st.markdown("---")
    st.markdown("### 🧩 RAG Patterns")
    patterns_info = {
        "naive_rag": "Baseline retrieval",
        "hyde": "Short queries → hypothetical doc",
        "query_rewrite": "Ambiguous queries",
        "crag": "Relevance grading + web fallback",
        "self_rag": "Faithfulness verification",
        "rag_fusion": "Multi-angle retrieval + RRF",
        "conv_rag": "Conversation memory",
        "agentic_rag": "Multi-step reasoning",
        "flare": "Long-form with mid-gen retrieval",
        "speculative_rag": "Parallel drafts + judge",
        "graph_rag": "Entity relationships",
        "multimodal_rag": "Images & charts",
    }
    for p, desc in patterns_info.items():
        st.markdown(f"<small>**{p}** — {desc}</small>", unsafe_allow_html=True)


# ── Main chat area ────────────────────────────────────────────────────────────
col_chat, col_panel = st.columns([3, 1])

with col_chat:
    # Chat history
    chat_container = st.container()
    with chat_container:
        for msg in st.session_state.messages:
            if msg["role"] == "user":
                st.markdown(f'<div class="chat-user">💬 {msg["content"]}</div>', unsafe_allow_html=True)
            else:
                with st.container():
                    resp = msg.get("response")
                    if resp:
                        _conf_class = resp.confidence.lower()
                        st.markdown(f"""
<div class="answer-card">
{resp.answer_text}
</div>
""", unsafe_allow_html=True)
                        badges = f"""
<span class='badge badge-{_conf_class}'>{resp.confidence} [{resp.quality_score:.2f}]</span>
<span class='badge badge-{"pass" if resp.faithfulness=="pass" else "warn"}'>Faith: {resp.faithfulness}</span>
<span class='badge badge-channel'>{resp.retrieval_channel}</span>
{"<span class='badge badge-cache'>CACHE HIT</span>" if resp.verified_knowledge_hit else ""}
"""
                        st.markdown(badges, unsafe_allow_html=True)
                    else:
                        st.markdown(f'<div class="chat-assistant">{msg["content"]}</div>', unsafe_allow_html=True)

    # Input
    st.markdown("---")

    # Follow-up suggestions from last response
    if st.session_state.last_response and st.session_state.last_response.suggested_followups:
        st.markdown("**💡 Suggested follow-ups:**")
        cols = st.columns(min(3, len(st.session_state.last_response.suggested_followups)))
        for i, fq in enumerate(st.session_state.last_response.suggested_followups[:3]):
            with cols[i]:
                if st.button(fq, key=f"fq_{i}_{hash(fq)}", use_container_width=True):
                    st.session_state.pending_query = fq
                    st.rerun()

    with st.form("chat_form", clear_on_submit=True):
        default_val = st.session_state.pending_query
        query_input = st.text_area(
            "Ask anything about your documents...",
            value=default_val,
            height=80,
            placeholder="e.g. What are the main findings? Compare X vs Y. Summarize the key points.",
        )
        submitted = st.form_submit_button("Send ➤", type="primary", use_container_width=True)

    if submitted and query_input.strip():
        st.session_state.pending_query = ""

        if not os.getenv("GROQ_API_KEY"):
            st.error("Please enter your Groq API Key in the sidebar.")
            st.stop()

        st.session_state.messages.append({"role": "user", "content": query_input.strip()})

        with st.spinner("Analyzing query and selecting RAG patterns..."):
            try:
                from src.agent import ask
                response, analysis = ask(query_input.strip(), st.session_state.session_id)
                st.session_state.last_response = response
                st.session_state.last_analysis = analysis
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": response.answer_text,
                    "response": response,
                    "analysis": analysis,
                })
            except Exception as e:
                st.error(f"Error: {e}")
                import traceback
                st.code(traceback.format_exc())

        st.rerun()


# ── Right Panel: Last query telemetry ─────────────────────────────────────────
with col_panel:
    st.markdown("### 📡 Query Telemetry")

    if st.session_state.last_analysis and st.session_state.last_response:
        analysis = st.session_state.last_analysis
        resp = st.session_state.last_response

        # Metrics
        st.markdown(f"""
<div class="metric-row">
  <div class="metric-box">
    <div class="value">{resp.latency_ms}ms</div>
    <div class="label">Latency</div>
  </div>
  <div class="metric-box">
    <div class="value">{resp.quality_score:.2f}</div>
    <div class="label">Quality</div>
  </div>
</div>
""", unsafe_allow_html=True)

        st.markdown("**Active Patterns:**")
        for p in resp.patterns_used:
            st.markdown(f"<span class='badge badge-pattern'>{p}</span>", unsafe_allow_html=True)

        st.markdown("---")
        st.markdown("**Query Dimensions:**")
        dims = {
            "Length": analysis.get("length_signal", "—"),
            "Ambiguity": analysis.get("ambiguity", "—"),
            "Complexity": analysis.get("complexity", "—"),
            "Data Type": analysis.get("data_type", "—"),
            "Turn": str(analysis.get("turn", 1)),
            "Class": analysis.get("query_class", "—"),
            "Domain Risk": "Yes" if analysis.get("domain_risk") else "No",
        }
        for k, v in dims.items():
            st.markdown(f"<small>**{k}:** {v}</small>", unsafe_allow_html=True)

        st.markdown("---")
        st.markdown("**Sources Used:**")
        if resp.citation_map:
            sources_seen = set()
            for v in resp.citation_map.values():
                src = v.get("source", "?") if isinstance(v, dict) else "?"
                if src not in sources_seen:
                    sources_seen.add(src)
                    st.markdown(f"<span class='source-chip'>{src}</span>", unsafe_allow_html=True)
        else:
            st.caption("No sources tracked")

        st.markdown("---")
        st.markdown("**Retrieval:**")
        st.markdown(f"Channel: `{resp.retrieval_channel}`")
        if resp.fallback_used:
            st.warning("Web search fallback fired")
        if resp.verified_knowledge_hit:
            st.success("Cache hit — retrieval bypassed")

        st.markdown("---")
        if analysis.get("steps"):
            st.markdown("**Agentic Steps:**")
            for i, step in enumerate(analysis.get("steps", [])):
                st.markdown(f'<div class="step-item">Step {i+1}: {step.get("step","")[:60]}...</div>', unsafe_allow_html=True)

    else:
        st.info("Ask a question to see telemetry.")

    st.markdown("---")
    st.markdown("### 🗄️ Memory Browser")
    if st.button("View History", use_container_width=True):
        try:
            from src.memory.sqlite_store import get_conn
            with get_conn() as conn:
                rows = conn.execute(
                    "SELECT session_id, turn, query, answer FROM conversation_history ORDER BY id DESC LIMIT 10"
                ).fetchall()
            if rows:
                for r in rows:
                    with st.expander(f"[{r['session_id']}] T{r['turn']}: {r['query'][:40]}..."):
                        st.write(r['answer'][:300] + "..." if len(r['answer']) > 300 else r['answer'])
            else:
                st.caption("No history yet.")
        except Exception as e:
            st.caption(f"DB not ready: {e}")

    if st.button("Pattern Performance", use_container_width=True):
        try:
            from src.memory.sqlite_store import get_conn
            with get_conn() as conn:
                rows = conn.execute(
                    "SELECT pattern_combo, AVG(quality_score) as avg_q, AVG(latency_ms) as avg_l, COUNT(*) as n "
                    "FROM pattern_performance GROUP BY pattern_combo ORDER BY avg_q DESC LIMIT 10"
                ).fetchall()
            if rows:
                import pandas as pd
                df = pd.DataFrame([dict(r) for r in rows])
                df.columns = ["Patterns", "Avg Quality", "Avg Latency(ms)", "Runs"]
                df["Avg Quality"] = df["Avg Quality"].round(3)
                df["Avg Latency(ms)"] = df["Avg Latency(ms)"].round(0).astype(int)
                st.dataframe(df, use_container_width=True)
            else:
                st.caption("No performance data yet.")
        except Exception as e:
            st.caption(f"DB not ready: {e}")


# ── Footer ────────────────────────────────────────────────────────────────────
st.markdown("---")
st.markdown(
    "<center><small>Universal RAG Agent · Built with Groq Llama 3.3-70b · ChromaDB · LangChain · "
    "Streamlit | Shan AI — shanmaha.com</small></center>",
    unsafe_allow_html=True,
)
