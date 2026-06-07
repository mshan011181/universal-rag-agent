'use client'

import { useState, FormEvent, Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Database, CheckCircle, ShieldCheck } from 'lucide-react'
import { login } from '@/lib/api'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === '1'
  const isAdminMode = searchParams.get('admin') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

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

      if (isAdminMode) {
        if (role !== 'admin') {
          setEmailError('')
          setPasswordError('')
          setEmailError('This account does not have admin privileges')
          setLoading(false)
          return
        }
        router.push('/admin')
      } else {
        router.push('/query')
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
          <h1 className="text-2xl font-bold text-gray-900">Universal RAG</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdminMode ? 'Administrator Access' : 'Enterprise Platform'}
          </p>
        </div>

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
