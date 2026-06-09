'use client'

import { useState, FormEvent, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Database, ArrowLeft, CheckCircle, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { forgotPassword, resetPassword } from '@/lib/api'

type Step = 'email' | 'otp' | 'password' | 'done'

export default function ForgotPasswordPage() {
  const router = useRouter()

  const [step, setStep]           = useState<Step>('email')
  const [email, setEmail]         = useState('')
  const [otp, setOtp]             = useState(['', '', '', '', '', ''])
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [resending, setResending] = useState(false)
  const [error, setError]         = useState('')
  const [devOtp, setDevOtp]       = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)

  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Step 1: request OTP ────────────────────────────────────────────────────
  async function handleSendOTP(e: FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await forgotPassword(email)
      if (res.dev_otp) setDevOtp(res.dev_otp)
      setStep('otp')
      startCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  // ── OTP helpers ────────────────────────────────────────────────────────────
  function handleOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]; next[idx] = digit; setOtp(next)
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  function handleOtpKey(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }
  function handleOtpPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) { setOtp(text.split('')); otpRefs.current[5]?.focus(); e.preventDefault() }
  }

  // ── Step 2: verify OTP ─────────────────────────────────────────────────────
  async function handleVerifyOTP(e: FormEvent) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setError('Enter all 6 digits'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, purpose: 'reset' }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Invalid OTP') }
      setStep('password')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: set new password ───────────────────────────────────────────────
  async function handleReset(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return }
    if (password !== confirm)  { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await resetPassword(email, otp.join(''), password)
      setStep('done')
      setTimeout(() => router.push('/login'), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed. OTP may have expired.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true); setError(''); setDevOtp(null)
    try {
      const res = await forgotPassword(email)
      if (res.dev_otp) setDevOtp(res.dev_otp)
      setOtp(['', '', '', '', '', ''])
      otpRefs.current[0]?.focus()
      startCountdown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend')
    } finally {
      setResending(false)
    }
  }

  function startCountdown(secs: number) {
    setCountdown(secs)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-brand-600">
            <Database className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Universal RAG</h1>
          <p className="text-sm text-gray-500 mt-1">Password Reset</p>
        </div>

        <div className="card p-6">

          {/* ── Step 1: Email ── */}
          {step === 'email' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Forgot your password?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your email and we'll send a 6-digit reset code.
              </p>
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div>
                  <label className="label" htmlFor="email">Email address</label>
                  <input
                    id="email" type="email" className="input"
                    placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus
                  />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading || !email.trim()} className="btn-primary w-full">
                  {loading ? 'Sending code…' : 'Send reset code'}
                </button>
              </form>
            </>
          )}

          {/* ── Step 2: OTP ── */}
          {step === 'otp' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Enter reset code</h2>
              <p className="text-sm text-gray-500 mb-1">
                We sent a 6-digit code to <span className="font-medium text-gray-700">{email}</span>.
              </p>
              <p className="text-xs text-gray-400 mb-5">Valid for 15 minutes.</p>

              {devOtp && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  Dev mode — OTP: <span className="font-mono font-bold">{devOtp}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOTP} className="space-y-5">
                <div onPaste={handleOtpPaste} className="flex gap-2 justify-center">
                  {otp.map((d, i) => (
                    <input
                      key={i}
                      ref={el => { otpRefs.current[i] = el }}
                      type="text" inputMode="numeric" maxLength={1}
                      value={d}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKey(i, e)}
                      className="w-11 h-12 text-center text-xl font-bold border border-gray-300 rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      autoFocus={i === 0}
                    />
                  ))}
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading || otp.join('').length < 6} className="btn-primary w-full">
                  {loading ? 'Verifying…' : 'Verify code'}
                </button>
              </form>

              <div className="mt-4 text-center text-sm text-gray-500">
                Didn't receive it?{' '}
                {countdown > 0 ? (
                  <span className="text-gray-400">Resend in {countdown}s</span>
                ) : (
                  <button onClick={handleResend} disabled={resending}
                    className="text-brand-600 hover:underline font-medium inline-flex items-center gap-1">
                    <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                    Resend
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Step 3: New password ── */}
          {step === 'password' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-green-700">Code verified!</p>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Set new password</h2>
              <p className="text-sm text-gray-500 mb-5">Choose a strong password for your account.</p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="label" htmlFor="new-pw">New password</label>
                  <div className="relative">
                    <input
                      id="new-pw" type={showPw ? 'text' : 'password'} className="input pr-10"
                      placeholder="At least 6 characters"
                      value={password} onChange={e => setPassword(e.target.value)}
                      required autoFocus
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="confirm-pw">Confirm password</label>
                  <input
                    id="confirm-pw" type="password" className="input"
                    placeholder="Repeat password"
                    value={confirm} onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading || !password || !confirm} className="btn-primary w-full">
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}

          {/* ── Step 4: Done ── */}
          {step === 'done' && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-900 mb-1">Password updated!</p>
              <p className="text-sm text-gray-500">Redirecting to sign in…</p>
            </div>
          )}
        </div>

        <div className="text-center mt-4">
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
