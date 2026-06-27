'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { fetchUsage, createOrder, verifyPayment, deleteAccount, logout } from '@/lib/api'
import type { UsageInfo } from '@/lib/api'
import { CreditCard, Check, X, Crown, Sparkles, Loader2, Trash2 } from 'lucide-react'
import clsx from 'clsx'

declare global {
  interface Window { Razorpay?: new (options: Record<string, unknown>) => { open: () => void } }
}

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => resolve(true)
    s.onerror = () => resolve(false)
    document.body.appendChild(s)
  })
}

const PLANS = [
  {
    id: 'free', name: 'Free', price: '₹0', period: 'forever', badge: 'Limit: 5 questions',
    features: [['Free Llama 3.3 70B model', true], ['Documents & text', true], ['Claude, media, evaluation', false]] as [string, boolean][],
    highlight: false,
  },
  {
    id: 'monthly', name: 'Monthly', price: '$4.99', period: '/month', badge: '',
    features: [['Unlimited questions', true], ['All models incl. Claude', true], ['Media, podcast, evaluation', true]] as [string, boolean][],
    highlight: false,
  },
  {
    id: 'quarterly', name: 'Quarterly', price: '$12.99', period: '/3 months', badge: 'Save ~13%',
    features: [['Everything in Monthly', true], ['Lower effective rate', true]] as [string, boolean][],
    highlight: false,
  },
  {
    id: 'yearly', name: 'Yearly', price: '$39.99', period: '/year', badge: 'Save ~33%',
    features: [['Everything in Monthly', true], ['2+ months free', true], ['Priority processing', true]] as [string, boolean][],
    highlight: true,
  },
]

export default function PlanPage() {
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [welcome, setWelcome] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const autoTriggered = useRef(false)

  function refresh() {
    fetchUsage().then(setUsage).catch(() => {})
  }
  useEffect(() => {
    fetchUsage().then(setUsage).catch(() => {}).finally(() => setLoading(false))
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('welcome') === '1') setWelcome(true)
    // Auto-open checkout for a paid plan chosen on the landing page.
    const co = params.get('checkout')
    if (co && ['monthly', 'quarterly', 'yearly'].includes(co) && !autoTriggered.current) {
      autoTriggered.current = true
      handleUpgrade(co)
    }
  }, [])

  async function deleteMyAccount() {
    if (!confirm('This permanently deletes your account and all your data (documents, history, answers). This cannot be undone. Continue?')) return
    setDeleting(true)
    try {
      await deleteAccount()
      logout()
      router.push('/login')
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Could not delete account.' })
      setDeleting(false)
    }
  }

  async function handleUpgrade(plan: string) {
    setMessage(null)
    setUpgrading(plan)
    try {
      const order = await createOrder(plan)
      const ok = await loadRazorpay()
      if (!ok || !window.Razorpay) throw new Error('Could not load the payment window.')
      const rzp = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: 'MaximAI',
        description: `${plan} plan`,
        handler: async (resp: Record<string, string>) => {
          try {
            await verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              plan,
            })
            setMessage({ kind: 'ok', text: `Upgraded to ${plan}. Enjoy unlimited access!` })
            refresh()
          } catch {
            setMessage({ kind: 'err', text: 'Payment succeeded but verification failed. Contact support.' })
          } finally {
            setUpgrading(null)
          }
        },
        modal: { ondismiss: () => setUpgrading(null) },
        theme: { color: '#4f46e5' },
      })
      rzp.open()
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Could not start checkout.' })
      setUpgrading(null)
    }
  }

  const isOwner = usage?.plan === 'owner'
  const pct = usage && usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-brand-600" /> Plan &amp; Usage
          </h1>
          <p className="text-sm text-gray-500 mt-1">Your current plan, usage, and upgrade options.</p>
        </div>

        {welcome && (
          <div className="flex items-start gap-2 bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 text-sm text-brand-700">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Welcome to MaximAI! You&apos;re on the <strong>Free</strong> plan — <strong>5 free questions</strong> to try it out.
              Continue free, or upgrade below anytime for unlimited access.
            </span>
          </div>
        )}

        {/* Current plan / usage */}
        <div className="card p-5">
          {loading ? (
            <p className="text-sm text-gray-400">Loading usage…</p>
          ) : isOwner ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Owner — Unlimited access</p>
                <p className="text-xs text-gray-500">No limits on questions or features.</p>
              </div>
            </div>
          ) : usage?.unlimited ? (
            <div>
              <p className="text-sm font-semibold text-gray-900 capitalize">{usage.plan} plan — Unlimited</p>
              <p className="text-xs text-gray-500 mt-1">{usage.used} questions asked.</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-900">Free plan</p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{usage?.used ?? 0}</span> / {usage?.limit ?? 5} questions used
                </p>
              </div>
              <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all', pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-500')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {(usage?.remaining ?? 0) > 0
                  ? `${usage?.remaining} free question${usage?.remaining === 1 ? '' : 's'} remaining.`
                  : 'You have used all your free questions. Upgrade to continue.'}
              </p>
            </div>
          )}
        </div>

        {/* Pricing cards */}
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Upgrade options</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PLANS.map((plan) => {
              const isCurrent = (usage?.plan === plan.id) || (plan.id === 'free' && usage?.plan === 'free')
              return (
                <div
                  key={plan.id}
                  className={clsx('rounded-xl border p-4 bg-white flex flex-col',
                    plan.highlight ? 'border-2 border-brand-500' : 'border-gray-200')}
                >
                  {plan.highlight && (
                    <span className="self-start mb-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 text-brand-700 text-xs font-medium">
                      <Sparkles className="w-3 h-3" /> Best value
                    </span>
                  )}
                  <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
                  <p className="mt-0.5">
                    <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-xs text-gray-500"> {plan.period}</span>
                  </p>
                  {plan.badge && (
                    <span className="self-start my-2 px-2 py-0.5 rounded bg-green-50 text-green-700 text-xs font-medium">{plan.badge}</span>
                  )}
                  <ul className="space-y-1 mt-2 mb-4 flex-1">
                    {plan.features.map(([label, ok], i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                        {ok ? <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" /> : <X className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />}
                        <span>{label}</span>
                      </li>
                    ))}
                  </ul>
                  {isOwner ? (
                    <button disabled className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 cursor-not-allowed">
                      Owner — unlimited
                    </button>
                  ) : isCurrent ? (
                    <button disabled className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-500 cursor-not-allowed">
                      Current plan
                    </button>
                  ) : plan.id === 'free' ? (
                    <button disabled className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 cursor-not-allowed">
                      Free
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={upgrading !== null}
                      className="w-full px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {upgrading === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      {upgrading === plan.id ? 'Opening…' : 'Upgrade'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {message && (
            <p className={clsx('text-sm mt-3', message.kind === 'ok' ? 'text-green-700' : 'text-red-600')}>
              {message.text}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Secure payment via Razorpay. Prices in USD. Test mode — use a Razorpay test card.
          </p>
        </div>

        {/* Danger zone — delete account */}
        <div className="card p-5 border-red-200">
          <p className="text-sm font-semibold text-red-700">Danger zone</p>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Permanently delete your account and all your data — documents, history, answers, and
            saved figures. This cannot be undone.
          </p>
          <button
            onClick={deleteMyAccount}
            disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}
