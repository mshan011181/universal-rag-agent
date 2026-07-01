'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { lmsDashboard } from '@/lib/api'
import type { LmsDashboard } from '@/lib/api'
import { BarChart2, Users, BookOpen, ClipboardCheck, GraduationCap, AlertCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

function Stat({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ElementType }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider"><Icon className="w-4 h-4 text-brand-600" />{label}</div>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}
function scoreColor(s: number | null | undefined) { return s == null ? 'text-gray-400' : s >= 80 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-600' }

export default function LmsDashboardPage() {
  const [d, setD] = useState<LmsDashboard | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { lmsDashboard().then(setD).catch(e => setError(e.message)) }, [])

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart2 className="w-6 h-6 text-brand-600" /> Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Your overview and progress.</p>
        </div>
        {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
        {!d && !error && <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}

        {d?.role === 'admin' && d.summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Students" value={d.summary.students ?? 0} icon={GraduationCap} />
            <Stat label="Teachers" value={d.summary.teachers ?? 0} icon={Users} />
            <Stat label="Parents" value={d.summary.parents ?? 0} icon={Users} />
            <Stat label="Materials" value={d.summary.materials ?? 0} icon={BookOpen} />
            <Stat label="Assignments" value={d.summary.assignments ?? 0} icon={ClipboardCheck} />
            <Stat label="Submissions" value={d.summary.submissions ?? 0} icon={ClipboardCheck} />
          </div>
        )}

        {d?.role === 'teacher' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label="Assignments" value={d.summary?.assignments ?? 0} icon={ClipboardCheck} />
              <Stat label="Class average" value={<span className={scoreColor(d.summary?.class_avg as number | null)}>{d.summary?.class_avg ?? '—'}</span>} icon={BarChart2} />
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-4 py-2">Assignment</th><th className="text-left px-4 py-2">Class</th><th className="text-left px-4 py-2">Submissions</th><th className="text-left px-4 py-2">Avg score</th></tr></thead>
                <tbody>
                  {(d.assignments || []).map(a => (
                    <tr key={a.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">{a.title}</td>
                      <td className="px-4 py-2 text-gray-600">Grade {a.grade} · {a.subject}</td>
                      <td className="px-4 py-2 text-gray-600">{a.submissions}</td>
                      <td className={clsx('px-4 py-2 font-semibold', scoreColor(a.avg_score))}>{a.avg_score ?? '—'}</td>
                    </tr>
                  ))}
                  {(d.assignments || []).length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No assignments yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {d?.role === 'student' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Grade" value={d.summary?.grade ?? '—'} icon={GraduationCap} />
              <Stat label="Completed" value={d.summary?.completed ?? 0} icon={ClipboardCheck} />
              <Stat label="Pending" value={d.summary?.pending ?? 0} icon={ClipboardCheck} />
              <Stat label="Average" value={<span className={scoreColor(d.summary?.avg_score as number | null)}>{d.summary?.avg_score ?? '—'}</span>} icon={BarChart2} />
            </div>
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-4 py-2">Assignment</th><th className="text-left px-4 py-2">Subject</th><th className="text-left px-4 py-2">Score</th></tr></thead>
                <tbody>
                  {(d.recent || []).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">{r.title}</td>
                      <td className="px-4 py-2 text-gray-600">{r.subject}</td>
                      <td className={clsx('px-4 py-2 font-semibold', scoreColor(r.score))}>{r.score}/100</td>
                    </tr>
                  ))}
                  {(d.recent || []).length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400">No graded work yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {d?.role === 'parent' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(d.children || []).map(c => (
              <div key={c.student_id} className="card p-5">
                <p className="text-sm font-semibold text-gray-900">{c.name} <span className="text-gray-400 font-normal">· Grade {c.grade}</span></p>
                <div className="flex gap-6 mt-3">
                  <div><p className="text-xs text-gray-500 uppercase tracking-wider">Completed</p><p className="text-xl font-bold text-gray-900">{c.completed}</p></div>
                  <div><p className="text-xs text-gray-500 uppercase tracking-wider">Average</p><p className={clsx('text-xl font-bold', scoreColor(c.avg_score))}>{c.avg_score ?? '—'}</p></div>
                </div>
              </div>
            ))}
            {(d.children || []).length === 0 && <div className="card p-8 text-center text-gray-400 text-sm">No children linked yet.</div>}
          </div>
        )}
      </div>
    </AppShell>
  )
}
