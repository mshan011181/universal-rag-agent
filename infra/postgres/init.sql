-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role TEXT DEFAULT 'user',       -- 'admin' | 'user' | 'readonly'
    org_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

-- Organizations (multi-tenant)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan TEXT DEFAULT 'free',       -- 'free' | 'pro' | 'enterprise'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD CONSTRAINT fk_org FOREIGN KEY (org_id) REFERENCES organizations(id);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    key_hash TEXT UNIQUE NOT NULL,
    label TEXT,
    last_used TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions / Conversation History
CREATE TABLE IF NOT EXISTS conversation_history (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    org_id UUID REFERENCES organizations(id),
    turn INTEGER NOT NULL,
    query TEXT,
    rewritten_query TEXT,
    answer TEXT,
    quality_score REAL,
    patterns_used TEXT[],
    latency_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_conv_session ON conversation_history(session_id);
CREATE INDEX idx_conv_user ON conversation_history(user_id);

-- Pattern Performance
CREATE TABLE IF NOT EXISTS pattern_performance (
    id BIGSERIAL PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    pattern_combo TEXT NOT NULL,
    query_class TEXT,
    quality_score REAL,
    latency_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 1.0,
    run_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_perf_combo ON pattern_performance(pattern_combo);
CREATE INDEX idx_perf_org ON pattern_performance(org_id);

-- Routing Signals
CREATE TABLE IF NOT EXISTS routing_signals (
    query_fingerprint TEXT PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    detected_class TEXT,
    recommended_combo TEXT,
    confidence_score REAL,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Verified Knowledge Cache
CREATE TABLE IF NOT EXISTS verified_knowledge (
    id BIGSERIAL PRIMARY KEY,
    org_id UUID REFERENCES organizations(id),
    query_fingerprint TEXT NOT NULL,
    answer TEXT,
    quality_score REAL,
    chunk_ids JSONB,
    confirmed_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(org_id, query_fingerprint)
);

-- Document Registry
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    filename TEXT NOT NULL,
    file_type TEXT,
    file_size_bytes BIGINT,
    chunk_count INTEGER,
    ingestion_status TEXT DEFAULT 'pending',  -- 'pending'|'processing'|'done'|'failed'
    error_message TEXT,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    org_id UUID REFERENCES organizations(id),
    action TEXT NOT NULL,           -- 'query'|'ingest'|'delete'|'login'|'api_key_create'
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_org ON audit_log(org_id);
CREATE INDEX idx_audit_action ON audit_log(action);

-- Rate Limiting Buckets (managed by Redis, schema for reference)
-- Stored in Redis as: rate:{user_id}:{window} = count

-- Cost Tracking
CREATE TABLE IF NOT EXISTS usage_metrics (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    org_id UUID REFERENCES organizations(id),
    query_id TEXT,
    model TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    estimated_cost_usd REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
