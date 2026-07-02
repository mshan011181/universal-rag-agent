'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { lmsMyCourses } from '@/lib/api'
import type { Course } from '@/lib/api'
import { BookOpen, FileText, LineChart, CalendarDays, Trophy, NotebookPen, HelpCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'

export default function StudentDashboard() {
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>([])
  const [grade, setGrade] = useState('')
  const [subject, setSubject] = useState('')
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')

  useEffect(() => {
    lmsMyCourses().then(r => { setCourses(r.courses); if (r.grade) setGrade(r.grade) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  const subjects = Array.from(new Set(courses.map(c => c.subject)))
  const gradeFor = (s: string) => courses.find(c => c.subject === s)?.grade || grade

  function tool(action: string) {
    if (!subject) { setNote('Please select a subject first.'); return }
    setNote('')
    const g = gradeFor(subject)
    if (action === 'tutor') router.push(`/edu/study?grade=${encodeURIComponent(g)}&subject=${encodeURIComponent(subject)}`)
    else if (action === 'results') router.push('/edu/student/results')
    else setNote('This feature is coming soon.')
  }

  const TOOLS: [string, string, React.ElementType][] = [
    ['tutor', 'Tutor', BookOpen],
    ['testpaper', 'Test Paper', FileText],
    ['tracker', 'Tracker', LineChart],
    ['planner', 'Study Planner', CalendarDays],
    ['results', 'Test Results', Trophy],
    ['notebook', 'Notebook', NotebookPen],
  ]

  return (
    <EduShell>
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-center text-indigo-700">Select Subject</h1>
        {grade && <p className="text-center text-sm text-gray-400 mt-1">Grade {grade}</p>}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
        ) : subjects.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No subjects available yet. Ask your admin to add course material for your grade.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 mt-5">
            {subjects.map(s => (
              <button key={s} onClick={() => setSubject(s)}
                className={clsx('rounded-xl border px-4 py-4 text-sm font-medium transition-all',
                  subject === s ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 text-gray-700 hover:border-indigo-300')}>
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-gray-100 my-6" />

        <div className="grid grid-cols-2 gap-3">
          {TOOLS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => tool(id)}
              className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 px-4 py-3 text-sm font-medium transition-colors">
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {note && <p className="text-center text-xs text-amber-600 mt-3">{note}</p>}

        <div className="flex flex-col items-center gap-3 mt-6">
          <button onClick={() => router.push('/edu/student/badges')} className="text-sm text-indigo-600 hover:underline flex items-center gap-1.5">
            <Trophy className="w-4 h-4" /> My Badges
          </button>
          <button onClick={() => router.push('/edu/help')} className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 text-indigo-600 px-4 py-2 text-sm">
            <HelpCircle className="w-4 h-4" /> Help
          </button>
        </div>
      </div>
    </EduShell>
  )
}
