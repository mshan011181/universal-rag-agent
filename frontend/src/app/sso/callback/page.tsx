'use client'

/**
 * /sso/callback — SSO token receiver page.
 *
 * After the backend completes OIDC exchange it redirects here with:
 *   ?token=<access_jwt>&refresh=<refresh_jwt>&email=<email>&role=<role>
 *
 * This page picks those up, stores them in sessionStorage (same as
 * normal login), then navigates to /query. Tokens never touch localStorage.
 */

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Database, AlertCircle } from 'lucide-react'
import { setAccessToken } from '@/lib/api'

function SSOCallbackInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const token   = params.get('token')
    const refresh = params.get('refresh')
    const email   = params.get('email')
    const role    = params.get('role')
    const ssoErr  = params.get('sso_error')

    if (ssoErr) {
      setError(decodeURIComponent(ssoErr))
      return
    }

    if (!token || !refresh) {
      setError('SSO sign-in failed: missing tokens. Please try again.')
      return
    }

    // Store tokens — same pattern as normal login
    setAccessToken(token)
    sessionStorage.setItem('refresh_token', refresh)
    if (email) sessionStorage.setItem('user_email', email)
    if (role)  sessionStorage.setItem('user_role', role)

    router.replace('/query')
  }, [params, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-100 mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">SSO Sign-in Failed</h1>
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
            {error}
          </p>
          <a href="/login"
            className="inline-block px-5 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700">
            Back to login
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 mb-4">
          <Database className="w-6 h-6 text-white animate-pulse" />
        </div>
        <p className="text-sm text-gray-500">Completing sign-in…</p>
      </div>
    </div>
  )
}

export default function SSOCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    }>
      <SSOCallbackInner />
    </Suspense>
  )
}
