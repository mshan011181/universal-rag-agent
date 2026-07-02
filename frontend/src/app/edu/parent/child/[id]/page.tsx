'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { lmsChildResults } from '@/lib/api'
import type { ResultRow } from '@/lib/api'
import { ArrowLeft, Loader2, BarChart2 } from 'lucide-react'
import clsx from 'clsx'

function sc(s: number) { return s >= 80 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-600' }

export default function ChildResultsPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [rows, setRows] = useState<ResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { lmsChildResults(id).then(r => setRows(r.results)).catch(e => setError(e.message)).finally(() => setLoading(false)) }, [id])

  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length) : null

  return (
    <EduShell>
      <div className="max-w-3xl mx-auto">
        <button onClick={() => router.push('/edu/parent/students')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart2 className="w-6 h-6 text-indigo-600" /> Results &amp; Progress</h1>
        {avg != null && <p className="text-sm text-gray-500 mt-1">Average score: <span className={clsx('font-bold', sc(avg))}>{avg}/100</span> across {rows.length} assignment(s)</p>}
        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          : rows.length === 0 ? <p className="text-gray-400 text-sm mt-6">No graded work yet.</p>
          : <div className="mt-5 space-y-3">
              {rows.map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-center justify-between">
                    <div><p className="font-semibold text-gray-900">{r.title}</p><p className="text-xs text-gray-500">{r.subject} · Grade {r.grade}</p></div>
                    <span className={clsx('text-2xl font-bold', sc(r.score))}>{r.score}<span className="text-sm text-gray-400">/100</span></span>
                  </div>
                  {r.gap_analysis && <div className="mt-3 border-l-4 border-l-amber-400 bg-amber-50/40 p-3 rounded text-sm text-gray-700 whitespace-pre-wrap">{r.gap_analysis}</div>}
                </div>
              ))}
            </div>}
      </div>
    </EduShell>
  )
}
