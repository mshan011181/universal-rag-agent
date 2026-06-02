"""Generate architectural diagrams as PNG files for the README."""

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.patheffects as pe

# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def box(ax, x, y, w, h, label, sublabel="", facecolor="#1e3a5f", textcolor="white",
        fontsize=11, radius=0.03):
    rect = FancyBboxPatch((x - w/2, y - h/2), w, h,
                          boxstyle=f"round,pad={radius}",
                          facecolor=facecolor, edgecolor="white",
                          linewidth=1.5, zorder=3)
    ax.add_patch(rect)
    if sublabel:
        ax.text(x, y + 0.07, label, ha="center", va="center",
                fontsize=fontsize, fontweight="bold", color=textcolor, zorder=4)
        ax.text(x, y - 0.13, sublabel, ha="center", va="center",
                fontsize=fontsize - 2.5, color=textcolor, alpha=0.85, zorder=4)
    else:
        ax.text(x, y, label, ha="center", va="center",
                fontsize=fontsize, fontweight="bold", color=textcolor, zorder=4)

def arrow(ax, x1, y1, x2, y2, color="#61dafb", lw=2):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="-|>", color=color,
                                lw=lw, mutation_scale=18),
                zorder=2)

def label_arrow(ax, x, y, text, fontsize=8, color="#aaaaaa"):
    ax.text(x, y, text, ha="center", va="center",
            fontsize=fontsize, color=color, style="italic", zorder=5)


# ─────────────────────────────────────────────────────────────────────────────
# Diagram 1 — System Architecture
# ─────────────────────────────────────────────────────────────────────────────

def diagram_system_architecture():
    fig, ax = plt.subplots(figsize=(14, 10))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#0d1117")
    ax.set_xlim(0, 10)
    ax.set_ylim(0, 10)
    ax.axis("off")

    # Title
    ax.text(5, 9.5, "Universal RAG Agent — System Architecture",
            ha="center", va="center", fontsize=15, fontweight="bold",
            color="white")

    # Row 1 — User
    box(ax, 5, 8.7, 2.2, 0.55, "User / Client", facecolor="#21262d")

    # Row 2 — Query Analyzer
    box(ax, 5, 7.6, 3.2, 0.7,
        "Query Analyzer", "5 Dimensions: length · ambiguity · complexity · data_type · conv_state",
        facecolor="#0f4c81", fontsize=10)

    # Row 3 — Pattern Router
    box(ax, 5, 6.4, 2.8, 0.6, "Pattern Router", "Selects & chains RAG patterns",
        facecolor="#1a5276", fontsize=10)

    # Row 4 — 14 patterns (3 representative boxes + ellipsis)
    patterns = [
        (1.4, 5.2, "Naive RAG"),
        (3.1, 5.2, "HyDE"),
        (4.8, 5.2, "CRAG"),
        (6.5, 5.2, "Self-RAG"),
        (8.2, 5.2, "RAG Fusion\n+10 more"),
    ]
    colors = ["#1e6b3c", "#1e6b3c", "#6b1e1e", "#1e6b3c", "#4a4a1e"]
    for (px, py, plabel), pc in zip(patterns, colors):
        box(ax, px, py, 1.4, 0.65, plabel, facecolor=pc, fontsize=9)
        arrow(ax, 5, 6.1, px, 5.55)

    # Row 5 — Retrieval + Reranker + Generation (side by side)
    box(ax, 2.2, 3.9, 2.6, 0.7,
        "Retrieval", "ChromaDB + Web Search (Tavily)",
        facecolor="#1e3a5f", fontsize=10)
    box(ax, 5.0, 3.9, 2.2, 0.7,
        "Reranker", "RRF + Cohere cross-encoder",
        facecolor="#1e3a5f", fontsize=10)
    box(ax, 7.8, 3.9, 2.2, 0.7,
        "Generation", "Groq Llama 3.3-70b\n4 LLM roles",
        facecolor="#1e3a5f", fontsize=10)

    # arrows retrieval → reranker → generation
    arrow(ax, 3.5, 3.9, 3.9, 3.9)
    arrow(ax, 6.1, 3.9, 6.7, 3.9)

    # from pattern router area → retrieval
    arrow(ax, 2.2, 4.9, 2.2, 4.25)
    arrow(ax, 5.0, 4.9, 5.0, 4.25)
    arrow(ax, 7.8, 4.9, 7.8, 4.25)

    # Row 6 — Memory + Security
    box(ax, 2.5, 2.65, 2.8, 0.7,
        "Memory Store", "4 layers: conv · perf · routing · cache",
        facecolor="#3d1a6b", fontsize=10)
    box(ax, 7.5, 2.65, 2.8, 0.7,
        "Security Layer", "Prompt injection · PII detection",
        facecolor="#6b1a1a", fontsize=10)

    arrow(ax, 7.8, 3.55, 7.5, 3.0)
    arrow(ax, 2.2, 3.55, 2.5, 3.0)

    # Row 7 — Response back to user
    box(ax, 5, 1.6, 3.4, 0.7,
        "Response to User",
        "Answer · Confidence · Sources · Pattern Used · Latency",
        facecolor="#21262d", fontsize=10)

    arrow(ax, 7.8, 3.55, 5.8, 1.95)

    # Top arrows
    arrow(ax, 5, 8.42, 5, 7.95)
    arrow(ax, 5, 7.25, 5, 6.7)

    # Response → User feedback arrow
    arrow(ax, 5, 1.25, 5, 0.75)
    ax.text(5, 0.6, "Rendered in Streamlit UI / FastAPI response",
            ha="center", fontsize=8.5, color="#aaaaaa", style="italic")

    plt.tight_layout()
    plt.savefig("docs/architecture_system.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close()
    print("done: docs/architecture_system.png")


# ─────────────────────────────────────────────────────────────────────────────
# Diagram 2 — Docker Services Map
# ─────────────────────────────────────────────────────────────────────────────

def diagram_docker_services():
    fig, ax = plt.subplots(figsize=(14, 9))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#0d1117")
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 9)
    ax.axis("off")

    ax.text(6, 8.55, "Universal RAG Agent — Docker Services Architecture",
            ha="center", va="center", fontsize=15, fontweight="bold", color="white")

    # External user
    box(ax, 6, 7.8, 2.0, 0.55, "User / Browser", facecolor="#21262d", fontsize=10)

    # Streamlit frontend
    box(ax, 3.0, 6.4, 2.4, 0.75,
        "Streamlit UI", ":8501  •  Dockerfile.streamlit",
        facecolor="#c1440e", fontsize=10)

    # FastAPI
    box(ax, 9.0, 6.4, 2.4, 0.75,
        "FastAPI API", ":8000  •  Dockerfile",
        facecolor="#009688", fontsize=10)

    arrow(ax, 5.0, 7.8, 3.6, 6.78)
    arrow(ax, 7.0, 7.8, 8.4, 6.78)

    # Data layer
    box(ax, 2.0, 4.5, 2.2, 0.75,
        "ChromaDB", ":8001\nVector Store",
        facecolor="#1a4a6b", fontsize=10)
    box(ax, 5.0, 4.5, 2.2, 0.75,
        "PostgreSQL", ":5432\nUsers · Audit · Auth",
        facecolor="#336699", fontsize=10)
    box(ax, 8.0, 4.5, 2.2, 0.75,
        "Redis", ":6379\nRate Limit · Cache",
        facecolor="#cc3333", fontsize=10)
    box(ax, 11.0, 4.5, 1.6, 0.75,
        "Uploads\nVolume", "Shared\nfiles",
        facecolor="#3a3a3a", fontsize=9)

    # Arrows from Streamlit
    arrow(ax, 3.0, 6.02, 2.2, 4.88)
    arrow(ax, 3.3, 6.02, 5.0, 4.88)

    # Arrows from FastAPI
    arrow(ax, 8.8, 6.02, 8.0, 4.88)
    arrow(ax, 9.2, 6.02, 5.4, 4.88)
    arrow(ax, 9.5, 6.02, 2.6, 4.88)
    arrow(ax, 9.8, 6.02, 10.4, 4.88)

    # Observability layer
    box(ax, 3.5, 2.6, 2.4, 0.75,
        "Prometheus", ":9090\nMetrics scraper",
        facecolor="#e05c00", fontsize=10)
    box(ax, 8.5, 2.6, 2.4, 0.75,
        "Grafana", ":3001\nDashboards & Alerts",
        facecolor="#f5a623", textcolor="#111111", fontsize=10)

    arrow(ax, 9.0, 6.02, 3.8, 2.98)   # FastAPI → Prometheus (scrape /metrics)
    arrow(ax, 5.7, 2.6, 7.3, 2.6)     # Prometheus → Grafana

    ax.text(6.5, 2.72, "PromQL queries", ha="center", fontsize=8, color="#aaaaaa", style="italic")
    ax.text(3.0, 3.35, "scrapes /metrics\nevery 15s", ha="center", fontsize=7.5,
            color="#aaaaaa", style="italic")

    # Port legend
    legend_items = [
        mpatches.Patch(color="#c1440e", label="Streamlit UI  :8501"),
        mpatches.Patch(color="#009688", label="FastAPI  :8000"),
        mpatches.Patch(color="#1a4a6b", label="ChromaDB  :8001"),
        mpatches.Patch(color="#336699", label="PostgreSQL  :5432"),
        mpatches.Patch(color="#cc3333", label="Redis  :6379"),
        mpatches.Patch(color="#e05c00", label="Prometheus  :9090"),
        mpatches.Patch(color="#f5a623", label="Grafana  :3001"),
    ]
    ax.legend(handles=legend_items, loc="lower left", fontsize=8.5,
              facecolor="#161b22", edgecolor="#444", labelcolor="white",
              framealpha=0.9, ncol=4)

    plt.tight_layout()
    plt.savefig("docs/architecture_docker.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close()
    print("done: docs/architecture_docker.png")


# ─────────────────────────────────────────────────────────────────────────────
# Diagram 3 — RAG Pattern Selection Flow
# ─────────────────────────────────────────────────────────────────────────────

def diagram_rag_patterns():
    fig, ax = plt.subplots(figsize=(16, 11))
    fig.patch.set_facecolor("#0d1117")
    ax.set_facecolor("#0d1117")
    ax.set_xlim(0, 16)
    ax.set_ylim(0, 11)
    ax.axis("off")

    ax.text(8, 10.55, "Universal RAG Agent — Pattern Selection Flow",
            ha="center", fontsize=15, fontweight="bold", color="white")

    # Query in
    box(ax, 8, 9.8, 2.6, 0.55, "Incoming Query", facecolor="#21262d", fontsize=11)

    # 5 dimension boxes
    dims = [
        (1.5,  8.3, "Query Length",   "short / medium / long"),
        (4.5,  8.3, "Ambiguity",      "clear / vague / ambiguous"),
        (8.0,  8.3, "Complexity",     "simple / multi-step / research"),
        (11.5, 8.3, "Data Type",      "factual / analytical / creative"),
        (14.5, 8.3, "Conv State",     "first-turn / follow-up"),
    ]
    for dx, dy, dl, ds in dims:
        box(ax, dx, dy, 2.7, 0.75, dl, ds, facecolor="#0f4c81", fontsize=9)
        arrow(ax, 8, 9.52, dx, 8.68)

    # Pattern Router
    box(ax, 8, 7.1, 3.2, 0.65, "Pattern Router", "Scores & selects best pattern(s)",
        facecolor="#1a5276", fontsize=11)

    for dx, _, _, _ in dims:
        arrow(ax, dx, 7.92, 8, 7.43)

    # 14 patterns in 2 rows of 7
    patterns_row1 = [
        (1.1,  5.8, "1. Naive RAG",       "#1e6b3c", "Simple factual"),
        (3.4,  5.8, "2. HyDE",            "#1e6b3c", "Short/ambiguous"),
        (5.7,  5.8, "3. Query\nRewrite",  "#1e6b3c", "Vague queries"),
        (8.0,  5.8, "4. CRAG",            "#6b1e1e", "High-risk domains"),
        (10.3, 5.8, "5. Self-RAG",        "#6b1e1e", "Multi-step reason"),
        (12.6, 5.8, "6. Adaptive\nRAG",   "#4a4a1e", "Mixed complexity"),
        (14.9, 5.8, "7. FLARE",           "#4a4a1e", "Long-form gen"),
    ]
    patterns_row2 = [
        (1.1,  4.2, "8. Speculative\nRAG","#4a4a1e", "Hypothesis-verify"),
        (3.4,  4.2, "9. Modular\nRAG",   "#4a4a1e", "Config pipelines"),
        (5.7,  4.2, "10. Agentic\nRAG",  "#6b1e1e", "Multi-tool tasks"),
        (8.0,  4.2, "11. GraphRAG",      "#1e6b3c", "Entity relations"),
        (10.3, 4.2, "12. Multi-\nModal", "#1e3a6b", "Image/chart"),
        (12.6, 4.2, "13. Conv RAG",      "#1e6b3c", "Follow-up chats"),
        (14.9, 4.2, "14. RAG\nFusion",   "#4a4a1e", "Broad queries"),
    ]

    for px, py, pl, pc, ps in patterns_row1 + patterns_row2:
        box(ax, px, py, 2.0, 0.85, pl, ps, facecolor=pc, fontsize=8.5)
        arrow(ax, 8, 6.77, px, py + 0.43, color="#61dafb")

    # Legend for pattern colours
    legend_items = [
        mpatches.Patch(color="#1e6b3c", label="Low-risk / simple"),
        mpatches.Patch(color="#6b1e1e", label="High-risk / complex"),
        mpatches.Patch(color="#4a4a1e", label="Multi-step / adaptive"),
        mpatches.Patch(color="#1e3a6b", label="Multi-modal"),
    ]
    ax.legend(handles=legend_items, loc="lower left", fontsize=9,
              facecolor="#161b22", edgecolor="#444", labelcolor="white",
              framealpha=0.9)

    # Bottom — output
    box(ax, 8, 2.9, 4.0, 0.75,
        "Retrieve → Rerank → Generate",
        "ChromaDB  ·  Cohere RRF  ·  Groq Llama 3.3-70b",
        facecolor="#1e3a5f", fontsize=10)

    for px, py, _, _, _ in patterns_row2:
        arrow(ax, px, py - 0.43, 8, 3.28, color="#aaaaaa")

    box(ax, 8, 1.9, 3.6, 0.65,
        "Answer + Confidence + Sources",
        facecolor="#21262d", fontsize=10)
    arrow(ax, 8, 2.52, 8, 2.23)

    plt.tight_layout()
    plt.savefig("docs/architecture_rag_patterns.png", dpi=150, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close()
    print("done: docs/architecture_rag_patterns.png")


if __name__ == "__main__":
    diagram_system_architecture()
    diagram_docker_services()
    diagram_rag_patterns()
    print("All diagrams generated in docs/")
