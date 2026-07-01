'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { lmsMyCourses, lmsStudy, fetchModels } from '@/lib/api'
import type { Course, StudyAnswer, ModelOption } from '@/lib/api'
import { GraduationCap, BookOpen, Send, Loader2, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import clsx from 'clsx'

const LANGUAGE_OPTIONS = ['American English', 'British English', 'Indian English', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Marathi', 'Bengali']

export default function StudyPage() {
  const [courses, setCourses] = useState<Course[]>([])
  const [grade, setGrade] = useState('')
  const [selected, setSelected] = useState<Course | null>(null)
  const [question, setQuestion] = useState('')
  const [language, setLanguage] = useState('American English')
  const [models, setModels] = useState<ModelOption[]>([])
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState<StudyAnswer | null>(null)

  useEffect(() => {
    lmsMyCourses().then(r => { setCourses(r.courses); if (r.grade) setGrade(r.grade) }).catch(e => setError(e.message))
    fetchModels().then(setModels).catch(() => {})
  }, [])

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !question.trim()) return
    setError(''); setAnswer(null); setLoading(true)
    try {
      const res = await lmsStudy({ grade: selected.grade, subject: selected.subject, question: question.trim(), language, model })
      setAnswer(res)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not get an answer.') }
    finally { setLoading(false) }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-brand-600" /> My Learning
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {grade ? `Grade ${grade} — ` : ''}pick a subject and ask questions from your syllabus.
          </p>
        </div>

        {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

        {courses.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">
            No subjects available yet. Your admin needs to add course material for your grade.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {courses.map((c, i) => (
                <button key={i} onClick={() => { setSelected(c); setAnswer(null) }}
                  className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                    selected === c ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}>
                  <BookOpen className="w-3.5 h-3.5" /> Grade {c.grade} · {c.subject}
                </button>
              ))}
            </div>

            {selected && (
              <form onSubmit={ask} className="card p-5 space-y-4">
                <div>
                  <label className="label">Your question — {selected.subject} (Grade {selected.grade})</label>
                  <textarea className="input resize-none" rows={3} value={question}
                    onChange={e => setQuestion(e.target.value)} placeholder="Ask anything from this subject…" required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Answer language</label>
                    <select className="input" value={language} onChange={e => setLanguage(e.target.value)}>
                      {LANGUAGE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Model</label>
                    <select className="input" value={model} onChange={e => setModel(e.target.value)}>
                      <option value="">Default (Llama 3.3 70B — Free)</option>
                      {models.map(m => <option key={m.model_id} value={m.model_id}>{m.label}</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn-primary flex items-center gap-2" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {loading ? 'Thinking…' : 'Ask'}
                </button>
              </form>
            )}

            {answer && (
              <div className="card p-5">
                <div className="prose prose-sm max-w-none prose-p:text-gray-800 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:text-gray-800 prose-code:bg-gray-100 prose-code:text-brand-700 prose-code:px-1 prose-code:rounded prose-code:text-xs">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{answer.answer}</ReactMarkdown>
                </div>
                {answer.figures && answer.figures.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                    {answer.figures.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={f} alt={`Figure ${i + 1}`} className="rounded border border-gray-200" />
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-4 border-t border-gray-100 pt-3">Model: {answer.model_used || 'default'}</p>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
