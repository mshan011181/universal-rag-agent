'use client'

import { useState, FormEvent, Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Database, CheckCircle, ShieldCheck, AlertCircle } from 'lucide-react'
import { login } from '@/lib/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// Microsoft icon SVG
function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  )
}

// Google icon SVG
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === '1'
  const isAdminMode = searchParams.get('admin') === '1'
  const ssoError = searchParams.get('sso_error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ssoProviders, setSsoProviders] = useState<{ azure: boolean; google: boolean }>({ azure: false, google: false })
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  // Load which SSO providers are configured
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/sso/providers`)
      .then(r => r.json())
      .then(d => setSsoProviders({ azure: d.azure ?? false, google: d.google ?? false }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setEmail('')
    setPassword('')
    setEmailError('')
    setPasswordError('')
    const timer = setTimeout(() => {
      if (emailInputRef.current) emailInputRef.current.value = ''
      if (passwordInputRef.current) passwordInputRef.current.value = ''
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await login(email, password)

      // Decode role from token
      let role = 'user'
      try {
        const payload = JSON.parse(atob(data.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        role = payload?.role ?? 'user'
      } catch {}

      sessionStorage.setItem('user_email', email)

      // School roles use the MaximAI Edu experience (separate from the main app).
      if (!isAdminMode && (role === 'student' || role === 'parent')) {
        router.push(role === 'student' ? '/edu/student' : '/edu/role-selection')
      } else if (isAdminMode) {
        if (role !== 'admin') {
          setEmailError('')
          setPasswordError('')
          setEmailError('This account does not have admin privileges')
          setLoading(false)
          return
        }
        router.push('/admin')
      } else {
        // Act on a plan chosen from the public landing page (if any).
        let intended: string | null = null
        try { intended = sessionStorage.getItem('intended_plan'); sessionStorage.removeItem('intended_plan') } catch {}
        const paid = intended && ['monthly', 'quarterly', 'yearly'].includes(intended)
        if (paid) {
          router.push(`/plan?welcome=1&checkout=${intended}`)   // paid → straight to checkout
        } else if (justRegistered || intended === 'free') {
          router.push('/plan?welcome=1')                         // new/free → pricing screen
        } else {
          router.push('/query')                                 // returning user → app
        }
      }
    } catch (err: unknown) {
      let detail = 'Invalid credentials'
      if (err instanceof Error) {
        detail = err.message
      } else if (typeof err === 'object' && err !== null && 'detail' in err) {
        const d = (err as { detail: unknown }).detail
        detail = Array.isArray(d) ? 'Invalid credentials' : String(d)
      }

      setEmailError('')
      setPasswordError('')
      if (detail === 'email_not_found') {
        setEmailError('No account found with this email address')
      } else if (detail === 'wrong_password') {
        setPasswordError('Incorrect password')
      } else {
        setEmailError(detail)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative">
      {/* Admin toggle button — top right */}
      {!isAdminMode ? (
        <Link
          href="/login?admin=1"
          className="absolute top-5 right-5 flex items-center gap-2 px-4 py-2 rounded-lg
                     border border-gray-300 bg-white text-sm font-medium text-gray-600
                     hover:border-brand-500 hover:text-brand-600 transition-colors shadow-sm"
        >
          <ShieldCheck className="w-4 h-4" />
          Admin Login
        </Link>
      ) : (
        <Link
          href="/login"
          className="absolute top-5 right-5 flex items-center gap-2 px-4 py-2 rounded-lg
                     border border-gray-300 bg-white text-sm font-medium text-gray-600
                     hover:border-gray-400 transition-colors shadow-sm"
        >
          ← User Login
        </Link>
      )}

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4
            ${isAdminMode ? 'bg-gray-800' : 'bg-brand-600'}`}>
            {isAdminMode
              ? <ShieldCheck className="w-6 h-6 text-white" />
              : <Database className="w-6 h-6 text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">MaximAI</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdminMode ? 'Administrator Access' : 'your data, distilled into answers'}
          </p>
        </div>

        {ssoError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{decodeURIComponent(ssoError)}</p>
          </div>
        )}

        {justRegistered && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Account created successfully</p>
              <p className="text-xs text-green-700 mt-0.5">Sign in with your email and password below</p>
            </div>
          </div>
        )}

        {isAdminMode && (
          <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 mb-4">
            <ShieldCheck className="w-4 h-4 text-gray-300 shrink-0" />
            <p className="text-sm text-gray-300">Admin credentials required</p>
          </div>
        )}

        {/* Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">
            {isAdminMode ? 'Administrator Sign In' : 'Sign in to your account'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                ref={emailInputRef}
                id="email"
                type="email"
                className={`input ${emailError ? 'border-red-400 focus:ring-red-400' : ''}`}
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="username"
              />
              {emailError && <p className="mt-1 text-xs text-red-600">{emailError}</p>}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label" htmlFor="password">Password</label>
                {!isAdminMode && (
                  <Link href="/forgot-password" className="text-xs text-brand-600 hover:underline">
                    Forgot password?
                  </Link>
                )}
              </div>
              <input
                ref={passwordInputRef}
                id="password"
                type="password"
                className={`input ${passwordError ? 'border-red-400 focus:ring-red-400' : ''}`}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              {passwordError && <p className="mt-1 text-xs text-red-600">{passwordError}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white transition-colors
                ${isAdminMode
                  ? 'bg-gray-800 hover:bg-gray-700 disabled:bg-gray-400'
                  : 'bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300'}`}
            >
              {loading ? 'Signing in…' : isAdminMode ? 'Sign in as Admin' : 'Sign in'}
            </button>
          </form>

          {/* SSO buttons — only shown when not in admin mode and at least one provider configured */}
          {!isAdminMode && (ssoProviders.azure || ssoProviders.google) && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs text-gray-400">
                  <span className="bg-white px-3">or continue with</span>
                </div>
              </div>

              <div className="space-y-2">
                {ssoProviders.azure && (
                  <a
                    href={`${API_BASE}/api/auth/sso/azure/login`}
                    className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-lg
                               border border-gray-300 bg-white text-sm font-medium text-gray-700
                               hover:bg-gray-50 hover:border-gray-400 transition-colors"
                  >
                    <MicrosoftIcon />
                    Sign in with Microsoft
                  </a>
                )}
                {ssoProviders.google && (
                  <a
                    href={`${API_BASE}/api/auth/sso/google/login`}
                    className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-lg
                               border border-gray-300 bg-white text-sm font-medium text-gray-700
                               hover:bg-gray-50 hover:border-gray-400 transition-colors"
                  >
                    <GoogleIcon />
                    Sign in with Google
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {!isAdminMode && (
          <p className="text-center text-sm text-gray-500 mt-4">
            No account?{' '}
            <Link href="/register" className="text-brand-600 hover:underline font-medium">
              Create one
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50" />}>
      <LoginForm />
    </Suspense>
  )
}
