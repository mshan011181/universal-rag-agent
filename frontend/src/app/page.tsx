'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { Database, Check, X, Sparkles } from 'lucide-react'

const PLANS = [
  {
    id: 'free', name: 'Free', price: '$0', period: 'forever', badge: 'Limit: 10 questions', cta: 'Start free',
    features: [['10 free questions', true], ['Free Llama 3.3 70B model', true], ['Documents & text', true], ['Claude, media, evaluation', false]] as [string, boolean][],
    highlight: false,
  },
  {
    id: 'monthly', name: 'Monthly', price: '$4.99', period: '/month', badge: '', cta: 'Get Monthly',
    features: [['Unlimited questions', true], ['All models incl. Claude', true], ['Media, podcast, evaluation', true]] as [string, boolean][],
    highlight: false,
  },
  {
    id: 'quarterly', name: 'Quarterly', price: '$12.99', period: '/3 months', badge: 'Save ~13%', cta: 'Get Quarterly',
    features: [['Everything in Monthly', true], ['Lower effective rate', true]] as [string, boolean][],
    highlight: false,
  },
  {
    id: 'yearly', name: 'Yearly', price: '$39.99', period: '/year', badge: 'Save ~33%', cta: 'Get Yearly',
    features: [['Everything in Monthly', true], ['2+ months free', true], ['Priority processing', true]] as [string, boolean][],
    highlight: true,
  },
]

export default function Landing() {
  const router = useRouter()

  useEffect(() => {
    // Already logged in → go straight into the app.
    if (isAuthenticated()) router.replace('/query')
  }, [router])

  function choosePlan(id: string) {
    // Remember the chosen plan; after login/signup we act on it (free → app,
    // paid → checkout).
    try { sessionStorage.setItem('intended_plan', id) } catch {}
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand-600 mb-4">
            <Database className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">MaximAI</h1>
          <p className="text-gray-500 mt-1">your data, distilled into answers</p>
          <p className="text-sm text-gray-500 mt-4 max-w-xl mx-auto">
            Ask anything across your documents, audio, video, YouTube and images — RAG with
            auto-selected patterns. Choose a plan to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-xl border bg-white p-5 flex flex-col ${plan.highlight ? 'border-2 border-brand-500' : 'border-gray-200'}`}
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
                <span className={`self-start my-2 px-2 py-0.5 rounded text-xs font-medium ${plan.id === 'free' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>{plan.badge}</span>
              )}
              <ul className="space-y-1 mt-2 mb-4 flex-1">
                {plan.features.map(([label, ok], i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                    {ok ? <Check className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" /> : <X className="w-3.5 h-3.5 text-gray-300 mt-0.5 shrink-0" />}
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => choosePlan(plan.id)}
                className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  plan.id === 'free'
                    ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Already have an account?{' '}
          <button onClick={() => router.push('/login')} className="text-brand-600 hover:underline font-medium">Sign in</button>
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          Paid plans: you&apos;ll create your account, then complete payment to activate. Secure checkout via Razorpay.
        </p>
      </div>
    </div>
  )
}
