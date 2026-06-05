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
}

export interface SourceChunk {
  content: string
  metadata: Record<string, unknown>
  score: number
}

export interface QueryResponse {
  answer: string
  pattern_used: string
  sources: SourceChunk[]
  quality_score: number
  follow_up_questions: string[]
  latency_ms: number
}

export interface IngestResponse {
  status: string
  chunks_indexed: number
  document_id: string
}

export interface AdminStats {
  total_queries: number
  total_users: number
  total_documents: number
  avg_quality_score: number
  pattern_breakdown: Record<string, number>
}

export interface ApiError {
  detail: string
  status: number
}
