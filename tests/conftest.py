import os
import pytest

# Set test environment before any imports
os.environ.setdefault("GROQ_API_KEY", "test-key")
os.environ.setdefault("JWT_SECRET", "test-secret-for-ci")
os.environ.setdefault("ENVIRONMENT", "test")
