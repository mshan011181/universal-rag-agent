-- Universal RAG Enterprise — PostgreSQL schema
-- Matches the application code's SQLite schema exactly (TEXT PKs, not UUIDs).
-- Run via Cloud SQL init or: psql $DATABASE_URL -f infra/postgres/init.sql

CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    org_id TEXT NOT NULL DEFAULT '',
    role TEXT DEFAULT 'user',
    storage_quota_bytes BIGINT DEFAULT 524288000,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisations (
    org_id TEXT PRIMARY KEY,
    org_name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    plan TEXT DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_invites (
    id BIGSERIAL PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    org_id TEXT NOT NULL,
    invited_email TEXT NOT NULL,
    invited_by TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_otps (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    otp TEXT NOT NULL,
    purpose TEXT NOT NULL,
    token TEXT,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS conversation_history (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn INTEGER NOT NULL,
    query TEXT,
    rewritten_query TEXT,
    answer TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    archived INTEGER DEFAULT 0,
    archived_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_conv_session ON conversation_history(session_id);

CREATE TABLE IF NOT EXISTS pattern_performance (
    id BIGSERIAL PRIMARY KEY,
    pattern_combo TEXT,
    query_class TEXT,
    quality_score REAL,
    latency_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 1.0,
    run_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routing_signals (
    query_fingerprint TEXT PRIMARY KEY,
    detected_class TEXT,
    recommended_combo TEXT,
    confidence_score REAL,
    last_updated TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verified_knowledge (
    id BIGSERIAL PRIMARY KEY,
    query_fingerprint TEXT,
    answer TEXT,
    quality_score REAL,
    chunk_ids TEXT,
    confirmed_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingest_history (
    ingest_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ingest_type TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_url TEXT,
    file_size_bytes BIGINT,
    chunks_created INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    status TEXT DEFAULT 'done',
    progress INTEGER DEFAULT 0,
    progress_label TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    user_id TEXT,
    email TEXT,
    org_id TEXT,
    detail TEXT,
    ip_address TEXT,
    status TEXT DEFAULT 'success',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_org   ON audit_log(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_user  ON audit_log(user_id);

CREATE TABLE IF NOT EXISTS retention_policy (
    org_id TEXT PRIMARY KEY,
    audit_log_days INTEGER DEFAULT 90,
    conversation_days INTEGER DEFAULT 90,
    updated_at TIMESTAMP DEFAULT NOW()
);
