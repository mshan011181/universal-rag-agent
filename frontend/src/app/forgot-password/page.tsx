'use client'

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { Database, ArrowLeft, Copy, CheckCircle } from 'lucide-react'
import { forgotPassword } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const resetLink = resetToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password?token=${resetToken}`
    : ''

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await forgotPassword(email)
      setResetToken(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(resetLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 bg-brand-600">
            <Database className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Universal RAG</h1>
          <p className="text-sm text-gray-500 mt-1">Password Reset</p>
        </div>

        <div className="card p-6">
          {!resetToken ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Forgot your password?</h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter your email address and we will generate a reset link for you.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label" htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    className="input"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="btn-primary w-full"
                >
                  {loading ? 'Generating link…' : 'Generate reset link'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Reset link generated</p>
                  <p className="text-xs text-gray-500">Valid for 1 hour</p>
                </div>
              </div>

              <p className="text-xs text-gray-600 mb-3">
                Copy the link below and open it in your browser to set a new password:
              </p>

              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4">
                <span className="text-xs text-gray-700 break-all flex-1 font-mono">{resetLink}</span>
                <button
                  onClick={copyLink}
                  className="shrink-0 p-1 text-gray-500 hover:text-brand-600 transition-colors"
                  title="Copy link"
                >
                  {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <Link
                href={resetLink}
                className="btn-primary w-full text-center block text-sm"
              >
                Open reset link
              </Link>
            </>
          )}
        </div>

        <div className="text-center mt-4">
          <Link href="/login" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
