#!/usr/bin/env bash
set -e

echo "=== Universal RAG Agent Setup ==="

# Create virtual environment
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash

echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Copy env template
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env — add your GROQ_API_KEY"
fi

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Edit .env and add your GROQ_API_KEY"
echo "  2. Run: source .venv/Scripts/activate"
echo "  3. Run: streamlit run app.py"
