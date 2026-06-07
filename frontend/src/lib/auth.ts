'use client'

import { getAccessToken, refreshToken, setAccessToken } from './api'

/** Call on app mount — restores session from refresh token if access token is gone */
export async function restoreSession(): Promise<boolean> {
  if (getAccessToken()) return true
  const rt = sessionStorage.getItem('refresh_token')
  if (!rt) return false
  return refreshToken()
}

export function isAuthenticated(): boolean {
  return !!getAccessToken() || !!sessionStorage.getItem('refresh_token')
}

/** Decode JWT payload (no verification — server validates) */
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

export function getUserRole(): 'admin' | 'user' | null {
  const token = getAccessToken()
  if (token) {
    const payload = decodeToken(token)
    return (payload?.role as 'admin' | 'user') ?? 'user'
  }
  // Fallback to sessionStorage (persists across page reload)
  if (typeof window !== 'undefined') {
    const r = sessionStorage.getItem('user_role')
    if (r === 'admin' || r === 'user') return r
  }
  return null
}

export function clearSession() {
  setAccessToken(null)
  sessionStorage.removeItem('refresh_token')
}
