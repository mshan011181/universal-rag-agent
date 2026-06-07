'use client'

import { useState, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Database, CheckCircle, AlertCircle } from 'lucide-react'
import { resetPassword } from '@/lib/api'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  if (!token) {
    return (
      <div className="card p-6 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-900 mb-1">Invalid reset link</p>
        <p className="text-xs text-gray-500 mb-4">This link is missing a reset token.</p>
        <Link href="/forgot-password" className="btn-primary text-sm">
          Request a new link
        </Link>
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, newPassword)
      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed. The link may be expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card p-6">
      {success ? (
        <div className="text-center">
          <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-900 mb-1">Password updated!</p>
          <p className="text-xs text-gray-500">Redirecting to sign in…</p>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Set new password</h2>
          <p className="text-sm text-gray-500 mb-6">Enter and confirm your new password below.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                className={`input ${error && newPassword ? 'border-red-400' : ''}`}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="label" htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                className={`input ${error && confirmPassword && newPassword !== confirmPassword ? 'border-red-400' : ''}`}
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="btn-primary w-full"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
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

        <Suspense fallback={<div className="card p-6 flex items-center justify-center h-32" />}>
          <ResetPasswordForm />
        </Suspense>

        <div className="text-center mt-4">
          <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
