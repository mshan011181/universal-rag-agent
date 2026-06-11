/**
 * API client — wraps all FastAPI calls.
 * - Access token stored in memory (never localStorage for security)
 * - Refresh token stored in httpOnly cookie via /api/auth/refresh Next.js route
 * - Auto-retries with refreshed token on 401
 */

import type { AuthTokens, QueryRequest, QueryResponse, IngestResponse, AdminStats, IngestHistory } from '@/types'

const BASE = process.env.NEXT_PUBLIC_API_URL || ''

let _accessToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
}

export function getAccessToken() {
  return _accessToken
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (_accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }

  // Only set JSON content-type if caller hasn't already set one (e.g. form-urlencoded for OAuth2)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  // Auto-refresh on 401
  if (res.status === 401 && retry) {
    const refreshed = await refreshToken()
    if (refreshed) {
      return request<T>(path, options, false)
    }
    // Refresh failed — force logout
    setAccessToken(null)
    window.location.href = '/login'
    throw new Error('Session expired')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    // detail can be a string or a FastAPI validation array — always extract a plain string
    let detail = body.detail || 'Request failed'
    if (Array.isArray(detail)) {
      detail = detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join(', ')
    } else if (typeof detail !== 'string') {
      detail = JSON.stringify(detail)
    }
    throw Object.assign(new Error(detail), { status: res.status })
  }

  return res.json() as Promise<T>
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthTokens> {
  const form = new URLSearchParams({ username: email, password })
  // retry=false: login 401s must not trigger auto-refresh (would reload page and wipe error state)
  const data = await request<AuthTokens>('/api/auth/token', {
    method: 'POST',
    body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, false)
  setAccessToken(data.access_token)
  sessionStorage.setItem('refresh_token', data.refresh_token)
  // Decode role from JWT and persist so sidebar/guards survive page reload
  try {
    const payload = JSON.parse(atob(data.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload?.role) sessionStorage.setItem('user_role', payload.role)
  } catch {}
  return data
}

export async function sendOTP(email: string, purpose: 'register' | 'reset'): Promise<{ message: string; dev_otp?: string }> {
  return request('/api/auth/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email, purpose }),
  }, false)
}

export async function verifyOTP(email: string, otp: string, purpose: 'register' | 'reset'): Promise<{ valid: boolean }> {
  return request('/api/auth/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp, purpose }),
  }, false)
}

export async function register(
  email: string,
  password: string,
  otp: string,
  orgAction: 'create' | 'join',
  orgName?: string,
  inviteToken?: string,
): Promise<{ user_id: string; org_id: string; role: string }> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email, password, otp,
      org_action: orgAction,
      org_name: orgName,
      invite_token: inviteToken,
    }),
  }, false)
}

// ── Organisation ──────────────────────────────────────────────────────────────

export async function getOrgInfo(): Promise<{ org_id: string; org_name: string; plan: string; member_count: number }> {
  return request('/api/org/info')
}

export async function updateOrgName(orgName: string): Promise<{ org_name: string }> {
  return request('/api/org/info', { method: 'PUT', body: JSON.stringify({ org_name: orgName }) })
}

export async function listOrgMembers(): Promise<{ user_id: string; email: string; role: string; created_at: string }[]> {
  return request('/api/org/members')
}

export async function inviteMember(email: string): Promise<{ message: string; invite_link: string; email_sent: boolean }> {
  return request('/api/org/invite', { method: 'POST', body: JSON.stringify({ email }) })
}

export async function validateInvite(token: string): Promise<{ valid: boolean; org_id: string; org_name: string; invited_email: string }> {
  return request(`/api/org/invite/${token}`, {}, false)
}

export async function removeMember(userId: string): Promise<{ message: string }> {
  return request(`/api/org/members/${userId}`, { method: 'DELETE' })
}

export async function forgotPassword(email: string): Promise<{ message: string; dev_otp?: string }> {
  return request('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }, false)
}

export async function resetPassword(email: string, otp: string, newPassword: string): Promise<{ message: string }> {
  return request('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, otp, new_password: newPassword }),
  }, false)
}

export async function resetPasswordByToken(token: string, newPassword: string): Promise<{ message: string }> {
  return request('/api/auth/reset-password-by-token', {
    method: 'POST',
    body: JSON.stringify({ token, new_password: newPassword }),
  }, false)
}

export async function refreshToken(): Promise<boolean> {
  const rt = sessionStorage.getItem('refresh_token')
  if (!rt) return false
  try {
    const data = await request<AuthTokens>('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: `Bearer ${rt}` },
    }, false)
    setAccessToken(data.access_token)
    sessionStorage.setItem('refresh_token', data.refresh_token)
    return true
  } catch {
    return false
  }
}

export function logout() {
  setAccessToken(null)
  sessionStorage.removeItem('refresh_token')
  sessionStorage.removeItem('user_role')
  sessionStorage.removeItem('user_email')
}

// ── Query ─────────────────────────────────────────────────────────────────────

export async function submitQuery(payload: QueryRequest): Promise<QueryResponse> {
  return request('/api/query/', { method: 'POST', body: JSON.stringify(payload) })
}

export interface ModelOption {
  label: string
  model_id: string
  provider: string
  context_k: number
  input_usd_per_mtok: number
  output_usd_per_mtok: number
  free: boolean
}

export async function fetchModels(): Promise<ModelOption[]> {
  const data = await request<{ models: ModelOption[] }>('/api/query/models')
  return data.models
}

export interface TokenStats {
  query_count: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  total_cost_usd: number
}

export async function fetchTokenStats(): Promise<TokenStats> {
  return request<TokenStats>('/api/query/token-stats')
}

export interface ImageQueryItem {
  question: string
  answer: string
  quality_score: number
  confidence: string
  patterns_used: string[]
  latency_ms: number
  citation_map: Record<string, { source: string; score: number }>
  suggested_followups: string[]
}

export interface ImageQueryResponse {
  questions_found: number
  results: ImageQueryItem[]
  extraction_note: string
}

export async function submitQueryFromImage(
  file: File,
  language = 'American English',
  sessionId = 'default',
): Promise<ImageQueryResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('language', language)
  form.append('session_id', sessionId)
  return request('/api/query/from-image', { method: 'POST', body: form })
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export async function ingestFile(file: File, namespace = 'default'): Promise<IngestResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('namespace', namespace)
  return request('/api/ingest/file', { method: 'POST', body: form })
}

export async function ingestText(text: string, source: string, namespace = 'default'): Promise<IngestResponse> {
  return request('/api/ingest/text', {
    method: 'POST',
    body: JSON.stringify({ text, source, namespace }),
  })
}

export async function ingestYouTube(url: string): Promise<IngestResponse> {
  return request('/api/ingest/youtube', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function ingestWebLink(url: string): Promise<IngestResponse> {
  return request('/api/ingest/weblink', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export async function ingestMedia(url: string, type: 'audio' | 'video'): Promise<IngestResponse> {
  return request('/api/ingest/media', {
    method: 'POST',
    body: JSON.stringify({ url, type }),
  })
}

export async function getIngestHistory(): Promise<IngestHistory> {
  return request('/api/ingest/list', { method: 'GET' })
}

export async function deleteIngest(ingestId: string): Promise<{ status: string; ingest_id: string }> {
  return request(`/api/ingest/${ingestId}`, { method: 'DELETE' })
}

export async function retryIngest(ingestId: string): Promise<{ status: string; ingest_id: string }> {
  return request(`/api/ingest/${ingestId}/retry`, { method: 'POST' })
}

export async function ingestAudioFile(file: File): Promise<IngestResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('media_type', 'audio')
  return request('/api/ingest/media-file', { method: 'POST', body: form })
}

export async function ingestVideoFile(file: File): Promise<IngestResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('media_type', 'video')
  return request('/api/ingest/media-file', { method: 'POST', body: form })
}

export async function ingestImage(file: File): Promise<IngestResponse> {
  const form = new FormData()
  form.append('file', file)
  return request('/api/ingest/image', { method: 'POST', body: form })
}

// ── Admin ─────────────────────────────────────────────────────────────────────

export interface UserQueryItem {
  id: number
  session_id: string
  query: string
  answer: string
  timestamp: string
  archived: boolean
  archived_at?: string
}

export async function fetchUserQueries(params?: {
  limit?: number
  offset?: number
  search?: string
  archived?: boolean
}): Promise<{ total: number; queries: UserQueryItem[] }> {
  const qs = new URLSearchParams()
  if (params?.limit !== undefined)    qs.set('limit',    String(params.limit))
  if (params?.offset !== undefined)   qs.set('offset',   String(params.offset))
  if (params?.search)                 qs.set('search',   params.search)
  if (params?.archived !== undefined) qs.set('archived', String(params.archived))
  return request(`/api/user/queries?${qs}`)
}

export async function emailQuery(queryId: number): Promise<{ sent: boolean; to: string }> {
  return request(`/api/user/queries/${queryId}/email`, { method: 'POST' })
}

export async function fetchArchiveStats(beforeDays: number): Promise<{
  eligible: number; already_archived: number; before_days: number; cutoff: string
}> {
  return request(`/api/user/queries/archive-stats?before_days=${beforeDays}`)
}

export async function archiveQueries(beforeDays: number): Promise<{ archived: number }> {
  return request('/api/user/queries/archive', { method: 'POST', body: JSON.stringify({ before_days: beforeDays }) })
}

export async function unarchiveQueries(): Promise<{ restored: number }> {
  return request('/api/user/queries/unarchive', { method: 'POST' })
}

export async function fetchUserStats(): Promise<{
  total_queries: number
  total_documents: number
  avg_quality_score: number
  storage_used_bytes: number
  storage_quota_bytes: number
}> {
  return request('/api/user/stats')
}

export async function fetchAdminStats(): Promise<AdminStats> {
  return request('/api/admin/stats')
}

export async function fetchAdminUsers(): Promise<import('@/types').AdminUser[]> {
  return request('/api/admin/users')
}

export async function fetchAdminQueries(): Promise<import('@/types').AdminQuery[]> {
  return request('/api/admin/queries')
}

export async function fetchAdminDocuments(): Promise<import('@/types').AdminDocument[]> {
  return request('/api/admin/documents')
}

export async function createAdminUser(email: string, password: string, role: string) {
  return request('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  })
}

export async function deleteAdminUser(userId: string) {
  return request(`/api/admin/users/${userId}`, { method: 'DELETE' })
}

export async function updateUserQuota(userId: string, quotaBytes: number | null, unlimited: boolean) {
  return request(`/api/admin/users/${userId}/quota`, {
    method: 'PATCH',
    body: JSON.stringify({ quota_bytes: quotaBytes, unlimited }),
  })
}

export async function fetchHealth(): Promise<{ status: string; version: string }> {
  return request('/api/health')
}

// ── Audit Log ─────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number
  event_type: string
  user_id: string | null
  email: string | null
  org_id: string | null
  detail: string | null   // JSON string
  ip_address: string | null
  status: string
  created_at: string
}

export async function getAuditLogs(params?: {
  event_type?: string
  since?: string
  limit?: number
  offset?: number
}): Promise<{ logs: AuditEntry[]; count: number }> {
  const qs = new URLSearchParams()
  if (params?.event_type) qs.set('event_type', params.event_type)
  if (params?.since)      qs.set('since', params.since)
  if (params?.limit)      qs.set('limit', String(params.limit))
  if (params?.offset)     qs.set('offset', String(params.offset))
  return request(`/api/audit/logs?${qs}`)
}

export async function getAuditSummary(): Promise<{ event_type: string; total: number; failures: number; last_seen: string }[]> {
  return request('/api/audit/summary')
}

export async function exportAuditLogs(params?: { event_type?: string; since?: string }): Promise<void> {
  const qs = new URLSearchParams()
  if (params?.event_type) qs.set('event_type', params.event_type)
  if (params?.since)      qs.set('since', params.since)
  const headers: Record<string, string> = {}
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`
  const res = await fetch(`${BASE}/api/audit/export?${qs}`, { headers })
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit_log_${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function getRetentionPolicy(): Promise<{ audit_log_days: number; conversation_days: number; updated_at: string | null }> {
  return request('/api/audit/retention')
}

export async function setRetentionPolicy(audit_log_days: number, conversation_days: number): Promise<{ message: string }> {
  return request('/api/audit/retention', { method: 'PUT', body: JSON.stringify({ audit_log_days, conversation_days }) })
}

export async function purgeAuditLogs(): Promise<{ message: string; deleted_rows: number; retention_days: number }> {
  return request('/api/audit/purge', { method: 'POST' })
}

export async function eraseUserData(targetUserId: string): Promise<{ message: string; erased_email: string; rows_deleted: Record<string, number> }> {
  return request(`/api/audit/users/${targetUserId}/erase`, { method: 'DELETE' })
}
