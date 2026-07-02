'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { lmsDashboard } from '@/lib/api'
import type { LmsDashboard } from '@/lib/api'
import { ArrowLeft, Loader2 } from 'lucide-react'
import clsx from 'clsx'

// Belt tiers unlocked by number of completed assignments (simple, data-driven).
const BELTS = [
  { name: 'White Belt', at: 0 }, { name: 'Yellow Belt', at: 3 }, { name: 'Orange Belt', at: 6 },
  { name: 'Green Belt', at: 10 }, { name: 'Blue Belt', at: 15 }, { name: 'Purple Belt', at: 20 },
  { name: 'Brown Belt', at: 30 }, { name: 'Black Belt', at: 50 },
]

export default function BadgesPage() {
  const router = useRouter()
  const [d, setD] = useState<LmsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { lmsDashboard().then(setD).catch(() => {}).finally(() => setLoading(false)) }, [])

  const completed = Number(d?.summary?.completed ?? 0)
  const avg = d?.summary?.avg_score
  const earned = BELTS.filter(b => completed >= b.at)

  return (
    <EduShell>
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push('/edu/student')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>
        <h1 className="text-2xl font-bold text-center text-gray-900">My Badges</h1>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div> : (
          <>
            <div className="flex justify-center gap-8 mt-3 text-center">
              <div><p className="text-xl font-bold text-indigo-600">{earned.length}</p><p className="text-xs text-gray-500">Belts earned</p></div>
              <div><p className="text-xl font-bold text-indigo-600">{completed}</p><p className="text-xs text-gray-500">Assignments done</p></div>
              <div><p className="text-xl font-bold text-indigo-600">{avg ?? '—'}</p><p className="text-xs text-gray-500">Average score</p></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              {BELTS.map(b => {
                const has = completed >= b.at
                return (
                  <div key={b.name} className={clsx('rounded-2xl border p-4 text-center', has ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60')}>
                    <div className={clsx('w-10 h-10 rounded-full mx-auto', has ? 'bg-gradient-to-br from-amber-300 to-amber-500' : 'bg-gray-200')} />
                    <p className="text-sm font-semibold text-gray-800 mt-2">{b.name}</p>
                    <p className="text-xs text-gray-400">{has ? 'Earned' : `${b.at} assignments`}</p>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </EduShell>
  )
}
