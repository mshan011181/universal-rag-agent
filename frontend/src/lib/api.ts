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
  const data = await request<AuthTokens>('/api/auth/token', {
    method: 'POST',
    body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  setAccessToken(data.access_token)
  // Store refresh token in sessionStorage (httpOnly cookie requires a server)
  sessionStorage.setItem('refresh_token', data.refresh_token)
  return data
}

export async function register(email: string, password: string): Promise<{ message: string }> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
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

// ── Admin ─────────────────────────────────────────────────────────────────────

export async function fetchAdminStats(): Promise<AdminStats> {
  return request('/api/admin/stats')
}

export async function fetchHealth(): Promise<{ status: string; version: string }> {
  return request('/api/health')
}
