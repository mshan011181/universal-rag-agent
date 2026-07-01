'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { lmsMyCourses, lmsStudy, lmsChildResults } from '@/lib/api'
import type { Course, StudyAnswer, ResultRow } from '@/lib/api'
import { Users, BookOpen, Send, Loader2, AlertCircle, BarChart2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import clsx from 'clsx'

interface Child { student_id: string; student_name: string; grade: string; subjects: string[] }

export default function ChildrenPage() {
  const [children, setChildren] = useState<Child[]>([])
  const [error, setError] = useState('')
  const [sel, setSel] = useState<{ child: Child; subject: string } | null>(null)
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<StudyAnswer | null>(null)
  const [results, setResults] = useState<Record<string, ResultRow[]>>({})

  async function loadResults(studentId: string) {
    try { const r = await lmsChildResults(studentId); setResults(prev => ({ ...prev, [studentId]: r.results })) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load results.') }
  }

  useEffect(() => {
    lmsMyCourses().then(r => {
      const byChild: Record<string, Child> = {}
      ;(r.courses as Course[]).forEach(c => {
        const id = c.student_id || ''
        if (!byChild[id]) byChild[id] = { student_id: id, student_name: c.student_name || 'Child', grade: c.grade, subjects: [] }
        if (!byChild[id].subjects.includes(c.subject)) byChild[id].subjects.push(c.subject)
      })
      setChildren(Object.values(byChild))
    }).catch(e => setError(e.message))
  }, [])

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    if (!sel || !question.trim()) return
    setError(''); setAnswer(null); setLoading(true)
    try {
      setAnswer(await lmsStudy({ grade: sel.child.grade, subject: sel.subject, question: question.trim() }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not get an answer.') }
    finally { setLoading(false) }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" /> My Children
          </h1>
          <p className="text-sm text-gray-500 mt-1">Help with your child&apos;s syllabus. Progress and results appear here as teachers assign work.</p>
        </div>

        {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

        {children.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">No children linked yet, or no course material available for their grade.</div>
        ) : children.map(child => (
          <div key={child.student_id} className="card p-5">
            <p className="text-sm font-semibold text-gray-900">{child.student_name} <span className="text-gray-400 font-normal">· Grade {child.grade}</span></p>
            <div className="flex flex-wrap gap-2 mt-3">
              {child.subjects.map(sub => (
                <button key={sub} onClick={() => { setSel({ child, subject: sub }); setAnswer(null); setQuestion('') }}
                  className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                    sel && sel.child.student_id === child.student_id && sel.subject === sub ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                  <BookOpen className="w-3.5 h-3.5" /> {sub}
                </button>
              ))}
            </div>
            <button onClick={() => loadResults(child.student_id)} className="mt-3 flex items-center gap-1.5 text-xs text-brand-600 hover:underline">
              <BarChart2 className="w-3.5 h-3.5" /> View results & progress
            </button>
            {results[child.student_id] && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                {results[child.student_id].length === 0 ? (
                  <p className="text-xs text-gray-400">No graded assignments yet.</p>
                ) : results[child.student_id].map(r => (
                  <div key={r.id} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-gray-700">{r.title} <span className="text-gray-400">· {r.subject}</span></span>
                    <span className={clsx('font-semibold', r.score >= 80 ? 'text-green-600' : r.score >= 50 ? 'text-yellow-600' : 'text-red-600')}>{r.score}/100</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {sel && (
          <form onSubmit={ask} className="card p-5 space-y-4">
            <label className="label">Ask about {sel.subject} (Grade {sel.child.grade}) — {sel.child.student_name}</label>
            <textarea className="input resize-none" rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a question from this subject…" required />
            <button className="btn-primary flex items-center gap-2" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{loading ? 'Thinking…' : 'Ask'}
            </button>
          </form>
        )}

        {answer && (
          <div className="card p-5">
            <div className="prose prose-sm max-w-none prose-p:text-gray-800 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:text-gray-800">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{answer.answer}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
