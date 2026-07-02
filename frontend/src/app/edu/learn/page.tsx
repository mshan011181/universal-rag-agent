'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { eduProfileCourses, eduProfileStudy, eduProfileBadges } from '@/lib/api'
import type { EduBadges } from '@/lib/api'
import { BookOpen, FileText, LineChart, CalendarDays, Trophy, NotebookPen, Send, Loader2, ArrowLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import clsx from 'clsx'

interface Prof { id: number; name: string; grade: string }

export default function LearnPage() {
  const router = useRouter()
  const [prof, setProf] = useState<Prof | null>(null)
  const [subjects, setSubjects] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [mode, setMode] = useState<'menu' | 'tutor' | 'badges'>('menu')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)

  // tutor
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ answer: string; figures: string[] } | null>(null)
  // badges
  const [badges, setBadges] = useState<EduBadges | null>(null)

  useEffect(() => {
    let p: Prof | null = null
    try { p = JSON.parse(sessionStorage.getItem('edu_profile') || 'null') } catch {}
    if (!p) { router.replace('/edu/role-selection'); return }
    setProf(p)
    eduProfileCourses(p.id).then(r => setSubjects(r.subjects)).catch(() => {}).finally(() => setLoading(false))
  }, [router])

  async function ask(e: React.FormEvent) {
    e.preventDefault(); if (!prof || !subject || !question.trim()) return
    setAsking(true); setAnswer(null)
    try { setAnswer(await eduProfileStudy(prof.id, { subject, question: question.trim() })) }
    catch (e) { setNote(e instanceof Error ? e.message : 'Could not get an answer.') } finally { setAsking(false) }
  }

  function tool(id: string) {
    if (id === 'tutor') { if (!subject) { setNote('Select a subject first.'); return } setNote(''); setMode('tutor'); setAnswer(null); setQuestion('') }
    else if (id === 'badges') { if (prof) { eduProfileBadges(prof.id).then(setBadges).catch(() => {}); setMode('badges') } }
    else setNote('This feature is coming soon.')
  }

  const TOOLS: [string, string, React.ElementType][] = [
    ['tutor', 'Tutor', BookOpen], ['testpaper', 'Test Paper', FileText], ['tracker', 'Tracker', LineChart],
    ['planner', 'Study Planner', CalendarDays], ['results', 'Test Results', Trophy], ['notebook', 'Notebook', NotebookPen],
  ]

  return (
    <EduShell>
      <div className="max-w-lg mx-auto">
        {mode !== 'menu' && (
          <button onClick={() => { setMode('menu'); setNote('') }} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3"><ArrowLeft className="w-4 h-4" /> Back</button>
        )}

        {mode === 'menu' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-center text-indigo-700">Select Subject</h1>
            {prof && <p className="text-center text-sm text-gray-400 mt-1">{prof.name} · Grade {prof.grade}</p>}
            {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
              : subjects.length === 0 ? <p className="text-center text-gray-400 text-sm py-8">No subjects available yet for this grade.</p>
              : <div className="grid grid-cols-2 gap-3 mt-5">
                  {subjects.map(s => (
                    <button key={s} onClick={() => setSubject(s)} className={clsx('rounded-xl border px-4 py-4 text-sm font-medium transition-all', subject === s ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-gray-200 text-gray-700 hover:border-indigo-300')}>{s}</button>
                  ))}
                </div>}
            <div className="border-t border-gray-100 my-6" />
            <div className="grid grid-cols-2 gap-3">
              {TOOLS.map(([id, label, Icon]) => (
                <button key={id} onClick={() => tool(id)} className="flex items-center justify-center gap-2 rounded-xl bg-gray-50 hover:bg-indigo-50 text-gray-700 hover:text-indigo-700 px-4 py-3 text-sm font-medium"><Icon className="w-4 h-4" /> {label}</button>
              ))}
            </div>
            {note && <p className="text-center text-xs text-amber-600 mt-3">{note}</p>}
            <div className="flex justify-center mt-5">
              <button onClick={() => tool('badges')} className="text-sm text-indigo-600 hover:underline flex items-center gap-1.5"><Trophy className="w-4 h-4" /> My Badges</button>
            </div>
          </div>
        )}

        {mode === 'tutor' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="flex items-center gap-2 text-indigo-700 font-semibold"><BookOpen className="w-5 h-5" /> Tutor — {subject}</p>
            <form onSubmit={ask} className="mt-4 space-y-3">
              <textarea className="input resize-none" rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask anything from this subject…" required />
              <button disabled={asking} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60">{asking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Ask</button>
            </form>
            {note && <p className="text-xs text-amber-600 mt-2">{note}</p>}
            {answer && (
              <div className="mt-5 border-t border-gray-100 pt-4 prose prose-sm max-w-none prose-p:text-gray-800 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:text-gray-800">
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{answer.answer}</ReactMarkdown>
                {answer.figures?.length > 0 && <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">{/* eslint-disable-next-line @next/next/no-img-element */}{answer.figures.map((f, i) => <img key={i} src={f} alt={`Figure ${i + 1}`} className="rounded border border-gray-200" />)}</div>}
              </div>
            )}
          </div>
        )}

        {mode === 'badges' && badges && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-bold text-center text-gray-900">My Badges</h2>
            <div className="flex justify-center gap-8 mt-3 text-center">
              <div><p className="text-xl font-bold text-indigo-600">{badges.study_count}</p><p className="text-xs text-gray-500">Study sessions</p></div>
              <div><p className="text-xl font-bold text-indigo-600">{badges.belt}</p><p className="text-xs text-gray-500">Current belt</p></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              {badges.belts.map(b => (
                <div key={b.name} className={clsx('rounded-2xl border p-4 text-center', b.earned ? 'bg-white border-indigo-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60')}>
                  <div className={clsx('w-10 h-10 rounded-full mx-auto', b.earned ? 'bg-gradient-to-br from-amber-300 to-amber-500' : 'bg-gray-200')} />
                  <p className="text-sm font-semibold text-gray-800 mt-2">{b.name}</p>
                  <p className="text-xs text-gray-400">{b.earned ? 'Earned' : `${b.at} sessions`}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </EduShell>
  )
}
