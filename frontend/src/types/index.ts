export interface User {
  id: string
  email: string
  role: 'admin' | 'user'
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface QueryRequest {
  query: string
  namespace?: string
  pattern?: string
  top_k?: number
  language?: string
  source_filters?: string[]
  force_bi?: boolean
  model?: string              // api_model_id — e.g. "claude-sonnet-4-6"
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  llm_calls: number
  estimated_cost_usd: number
}

export interface SourceChunk {
  content: string
  metadata: Record<string, unknown>
  score: number
}

export interface QueryResponse {
  answer: string
  pattern_used: string
  patterns_used: string[]
  sources: SourceChunk[]
  quality_score: number
  follow_up_questions: string[]
  latency_ms: number
  citation_map: Record<string, { source: string; score: number }>
  retrieval_channel: string
  fallback_used: boolean
  verified_knowledge_hit: boolean
  suggested_followups: string[]
  model_used?: string
  token_usage?: TokenUsage
}

export interface IngestResponse {
  ingest_id: string
  status: string
  ingest_type: string
  filename?: string
  url?: string
  size_bytes?: number
  chunks?: number
  message?: string
}

export interface IngestedItem {
  ingest_id: string
  name: string
  url?: string
  size_bytes?: number
  chunks: number
  created_at: string
}

export interface IngestHistory {
  by_type: Record<string, IngestedItem[]>
  total: number
}

export interface AdminStats {
  total_queries: number
  total_users: number
  total_documents: number
  avg_quality_score: number
  pattern_breakdown: Record<string, number>
}

export interface AdminQuery {
  session_id: string
  query: string
  answer: string
  timestamp: string
  email: string | null
}

export interface AdminDocument {
  ingest_id: string
  ingest_type: string
  source_name: string | null
  source_url: string | null
  file_size_bytes: number | null
  chunks_created: number
  created_at: string
  status: string
  email: string | null
}

export interface AdminUser {
  user_id: string
  email: string
  org_id: string
  role: string
  storage_quota_bytes: number   // -1 = unlimited
  created_at: string
  doc_count: number
  storage_used_bytes: number
  total_chunks: number
}

export interface ApiError {
  detail: string
  status: number
}
