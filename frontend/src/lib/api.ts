/**
 * API client — wraps all FastAPI calls.
 * - Access token stored in memory (never localStorage for security)
 * - Refresh token stored in httpOnly cookie via /api/auth/refresh Next.js route
 * - Auto-retries with refreshed token on 401
 */

import type { AuthTokens, QueryRequest, QueryResponse, IngestResponse, AdminStats } from '@/types'

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

export async function register(email: string, password: string, otp: string): Promise<{ message: string }> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, otp }),
  }, false)
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
