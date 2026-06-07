'use client'

import { useState, FormEvent, Suspense, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Database, CheckCircle } from 'lucide-react'
import { login } from '@/lib/api'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justRegistered = searchParams.get('registered') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  // Force-clear form on mount and prevent browser autofill
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
      await login(email, password)
      sessionStorage.setItem('user_email', email)
      router.push('/query')
    } catch (err: unknown) {
      let detail = 'Invalid credentials'
      if (err instanceof Error) {
        detail = err.message
      } else if (typeof err === 'object' && err !== null && 'detail' in err) {
        const d = (err as { detail: unknown }).detail
        detail = Array.isArray(d) ? 'Invalid credentials' : String(d)
      }

      // Clear previous errors only after the API responds, not before
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 mb-4">
            <Database className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Universal RAG</h1>
          <p className="text-sm text-gray-500 mt-1">Enterprise Platform</p>
        </div>

        {/* Registration success banner */}
        {justRegistered && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-800">Account created successfully</p>
              <p className="text-xs text-green-700 mt-0.5">Sign in with your email and password below</p>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign in to your account</h2>

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
              {emailError && (
                <p className="mt-1 text-xs text-red-600">{emailError}</p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
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
              {passwordError && (
                <p className="mt-1 text-xs text-red-600">{passwordError}</p>
              )}
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          No account?{' '}
          <Link href="/register" className="text-brand-600 hover:underline font-medium">
            Create one
          </Link>
        </p>
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
