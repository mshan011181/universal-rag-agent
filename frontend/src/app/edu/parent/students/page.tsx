'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { lmsDashboard } from '@/lib/api'
import type { LmsDashboard } from '@/lib/api'
import { ArrowLeft, Users, Loader2, BarChart2 } from 'lucide-react'
import clsx from 'clsx'

function sc(s: number | null | undefined) { return s == null ? 'text-gray-400' : s >= 80 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-600' }

export default function StudentProfilesPage() {
  const router = useRouter()
  const [data, setData] = useState<LmsDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { lmsDashboard().then(setData).catch(() => {}).finally(() => setLoading(false)) }, [])
  const children = data?.children || []

  return (
    <EduShell>
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push('/edu/parent')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back to Dashboard</button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-6 h-6 text-violet-600" /> Student Profiles</h1>
        <p className="text-sm text-gray-400 mt-1">Student accounts are provisioned by your school admin.</p>

        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          : children.length === 0 ? <p className="text-gray-400 text-sm mt-6">No students linked yet.</p>
          : <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {children.map(c => (
                <div key={c.student_id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">{(c.name||'?').slice(0,1).toUpperCase()}</div>
                    <div><p className="font-semibold text-gray-900">{c.name}</p><p className="text-xs text-gray-500">Grade {c.grade}</p></div>
                  </div>
                  <div className="flex gap-6 mt-4">
                    <div><p className="text-xs text-gray-500 uppercase tracking-wider">Completed</p><p className="text-xl font-bold text-gray-900">{c.completed}</p></div>
                    <div><p className="text-xs text-gray-500 uppercase tracking-wider">Average</p><p className={clsx('text-xl font-bold', sc(c.avg_score))}>{c.avg_score ?? '—'}</p></div>
                  </div>
                  <button onClick={() => router.push(`/edu/parent/child/${c.student_id}`)} className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2 text-sm font-semibold">
                    <BarChart2 className="w-4 h-4" /> View results
                  </button>
                </div>
              ))}
            </div>}
      </div>
    </EduShell>
  )
}
