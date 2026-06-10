'use client'

import { useState, FormEvent, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Database, Mail, KeyRound, Building2, CheckCircle, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { sendOTP, register, validateInvite } from '@/lib/api'

type Step = 'email' | 'otp' | 'org' | 'password'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteParam = searchParams.get('invite') || ''

  const [step, setStep]               = useState<Step>('email')
  const [email, setEmail]             = useState('')
  const [otp, setOtp]                 = useState(['', '', '', '', '', ''])
  const [orgAction, setOrgAction]     = useState<'create' | 'join'>(inviteParam ? 'join' : 'create')
  const [orgName, setOrgName]         = useState('')
  const [inviteToken, setInviteToken] = useState(inviteParam)
  const [inviteOrgName, setInviteOrgName] = useState('')
  const [inviteEmail, setInviteEmail]     = useState('')
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [loading, setLoading]         = useState(false)
  const [resending, setResending]     = useState(false)
  const [error, setError]             = useState('')
  const [devOtp, setDevOtp]           = useState<string | null>(null)
  const [countdown, setCountdown]     = useState(0)

  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  // Pre-validate invite token from URL
  useEffect(() => {
    if (!inviteParam) return
    validateInvite(inviteParam)
      .then(res => {
        setInviteOrgName(res.org_name)
        setInviteEmail(res.invited_email)
        if (res.invited_email) setEmail(res.invited_email)
      })
      .catch(() => setError('This invite link is invalid or expired.'))
  }, [inviteParam])

  async function handleSendOTP(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      const res = await sendOTP(email, 'register')
      if (res.dev_otp) setDevOtp(res.dev_otp)
      setStep('otp'); startCountdown(60)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to send OTP') }
    finally { setLoading(false) }
  }

  function handleOtpChange(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1)
    const next = [...otp]; next[idx] = digit; setOtp(next)
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  function handleOtpKey(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
    if (e.key === 'ArrowLeft'  && idx > 0) otpRefs.current[idx - 1]?.focus()
    if (e.key === 'ArrowRight' && idx < 5) otpRefs.current[idx + 1]?.focus()
  }
  function handleOtpPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) { setOtp(text.split('')); otpRefs.current[5]?.focus(); e.preventDefault() }
  }

  async function handleVerifyOTP(e: FormEvent) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { setError('Enter all 6 digits'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code, purpose: 'register' }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || 'Invalid OTP') }
      setStep('org')
    } catch (err) { setError(err instanceof Error ? err.message : 'Invalid OTP') }
    finally { setLoading(false) }
  }

  function handleOrgNext(e: FormEvent) {
    e.preventDefault(); setError('')
    if (orgAction === 'create' && !orgName.trim()) { setError('Enter your organisation name.'); return }
    if (orgAction === 'join'   && !inviteToken.trim()) { setError('Enter the invite code from your email.'); return }
    setStep('password')
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault(); setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm)  { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      await register(email, password, otp.join(''), orgAction, orgName.trim() || undefined, inviteToken.trim() || undefined)
      router.push('/login?registered=1')
    } catch (err) { setError(err instanceof Error ? err.message : 'Registration failed') }
    finally { setLoading(false) }
  }

  async function handleResend() {
    setResending(true); setError(''); setDevOtp(null)
    try {
      const res = await sendOTP(email, 'register')
      if (res.dev_otp) setDevOtp(res.dev_otp)
      setOtp(['','','','','','']); otpRefs.current[0]?.focus(); startCountdown(60)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to resend') }
    finally { setResending(false) }
  }

  function startCountdown(secs: number) {
    setCountdown(secs)
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0 } return c - 1 })
    }, 1000)
  }

  const steps = [
    { id: 'email',    label: 'Email',    icon: Mail },
    { id: 'otp',      label: 'Verify',   icon: KeyRound },
    { id: 'org',      label: 'Org',      icon: Building2 },
    { id: 'password', label: 'Password', icon: CheckCircle },
  ] as const

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 mb-4">
            <Database className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Universal RAG</h1>
          <p className="text-sm text-gray-500 mt-1">Enterprise Platform</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1 mb-6">
          {steps.map((s, i) => {
            const done   = steps.findIndex(x => x.id === step) > i
            const active = s.id === step
            return (
              <div key={s.id} className="flex items-center gap-1">
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  active ? 'bg-brand-600 text-white' :
                  done   ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}>
                  <s.icon className="w-3 h-3" />{s.label}
                </div>
                {i < steps.length - 1 && <div className={`w-3 h-px ${done ? 'bg-green-400' : 'bg-gray-200'}`} />}
              </div>
            )
          })}
        </div>

        <div className="card p-6">

          {/* Step 1 — Email */}
          {step === 'email' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Create an account</h2>
              <p className="text-sm text-gray-500 mb-6">Enter your email — we'll send a verification code.</p>
              {inviteOrgName && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm text-blue-700">
                  You've been invited to join <strong>{inviteOrgName}</strong>.
                </div>
              )}
              <form onSubmit={handleSendOTP} className="space-y-4">
                <div>
                  <label className="label" htmlFor="email">Work Email</label>
                  <input id="email" type="email" className="input" placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    readOnly={!!inviteEmail} required autoFocus />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading || !email.trim()} className="btn-primary w-full">
                  {loading ? 'Sending code…' : 'Send verification code'}
                </button>
              </form>
            </>
          )}

          {/* Step 2 — OTP */}
          {step === 'otp' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Check your email</h2>
              <p className="text-sm text-gray-500 mb-1">
                We sent a 6-digit code to <span className="font-medium text-gray-700">{email}</span>.
              </p>
              <p className="text-xs text-gray-400 mb-5">Valid for 10 minutes.</p>
              {devOtp && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  Dev mode — OTP: <span className="font-mono font-bold">{devOtp}</span>
                </div>
              )}
              <form onSubmit={handleVerifyOTP} className="space-y-5">
                <div onPaste={handleOtpPaste} className="flex gap-2 justify-center">
                  {otp.map((d, i) => (
                    <input key={i} ref={el => { otpRefs.current[i] = el }}
                      type="text" inputMode="numeric" maxLength={1} value={d}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKey(i, e)}
                      className="w-11 h-12 text-center text-xl font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                      autoFocus={i === 0} />
                  ))}
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading || otp.join('').length < 6} className="btn-primary w-full">
                  {loading ? 'Verifying…' : 'Verify code'}
                </button>
              </form>
              <div className="mt-4 text-center text-sm text-gray-500">
                Didn't receive it?{' '}
                {countdown > 0 ? <span className="text-gray-400">Resend in {countdown}s</span> : (
                  <button onClick={handleResend} disabled={resending}
                    className="text-brand-600 hover:underline font-medium inline-flex items-center gap-1">
                    <RefreshCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />Resend code
                  </button>
                )}
              </div>
              <button onClick={() => { setStep('email'); setOtp(['','','','','','']); setError('') }}
                className="mt-2 w-full text-center text-xs text-gray-400 hover:text-gray-600">
                ← Change email
              </button>
            </>
          )}

          {/* Step 3 — Org */}
          {step === 'org' && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-green-700">Email verified!</p>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Set up your workspace</h2>
              <p className="text-sm text-gray-500 mb-5">Create a new organisation or join an existing one.</p>

              {!inviteParam && (
                <div className="flex gap-2 mb-5">
                  {(['create', 'join'] as const).map(action => (
                    <button key={action} onClick={() => setOrgAction(action)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        orgAction === action
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                      }`}>
                      {action === 'create' ? 'Create org' : 'Join org'}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleOrgNext} className="space-y-4">
                {orgAction === 'create' ? (
                  <div>
                    <label className="label" htmlFor="org-name">Organisation name</label>
                    <input id="org-name" type="text" className="input"
                      placeholder="e.g. Acme Corp, My Team"
                      value={orgName} onChange={e => setOrgName(e.target.value)} required autoFocus />
                    <p className="text-xs text-gray-400 mt-1">You'll be the admin. Invite teammates from the Team page after signing in.</p>
                  </div>
                ) : (
                  <div>
                    <label className="label">Joining organisation</label>
                    {inviteOrgName ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-sm text-blue-700">
                        <Building2 className="w-4 h-4 inline mr-1.5" />
                        <strong>{inviteOrgName}</strong>
                      </div>
                    ) : (
                      <input type="text" className="input" placeholder="Paste invite code from your email"
                        value={inviteToken} onChange={e => setInviteToken(e.target.value)} required autoFocus />
                    )}
                  </div>
                )}
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full">Continue</button>
              </form>
            </>
          )}

          {/* Step 4 — Password */}
          {step === 'password' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Set your password</h2>
              <p className="text-sm text-gray-500 mb-5">Choose a strong password for your account.</p>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <div className="relative">
                    <input id="password" type={showPw ? 'text' : 'password'} className="input pr-10"
                      placeholder="Min 8 characters"
                      value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="confirm">Confirm Password</label>
                  <input id="confirm" type="password" className="input" placeholder="Repeat password"
                    value={confirm} onChange={e => setConfirm(e.target.value)} required />
                </div>
                <div className="flex gap-1">
                  {[8, 12, 20].map(n => (
                    <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${password.length >= n ? 'bg-brand-500' : 'bg-gray-200'}`} />
                  ))}
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                <button type="submit" disabled={loading || !password || !confirm} className="btn-primary w-full">
                  {loading ? 'Creating account…' : 'Create account'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-600 hover:underline font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50" />}>
      <RegisterForm />
    </Suspense>
  )
}
