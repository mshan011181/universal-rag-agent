'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { lmsStudy } from '@/lib/api'
import type { StudyAnswer } from '@/lib/api'
import { ArrowLeft, Send, Loader2, AlertCircle, BookOpen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

function StudyInner() {
  const params = useSearchParams()
  const router = useRouter()
  const grade = params.get('grade') || ''
  const subject = params.get('subject') || ''
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState<StudyAnswer | null>(null)

  async function ask(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    setError(''); setAnswer(null); setLoading(true)
    try {
      setAnswer(await lmsStudy({ grade, subject, question: question.trim() }))
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not get an answer.') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <p className="flex items-center gap-2 text-indigo-700 font-semibold"><BookOpen className="w-5 h-5" /> Tutor — {subject || 'Study'} {grade && <span className="text-gray-400 font-normal">· Grade {grade}</span>}</p>
        {!subject && <p className="text-sm text-amber-600 mt-2">No subject selected — go back and pick a subject.</p>}
        <form onSubmit={ask} className="mt-4 space-y-3">
          <textarea className="input resize-none" rows={3} value={question} onChange={e => setQuestion(e.target.value)}
            placeholder="Ask anything from this subject…" required />
          <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-5 py-2.5 text-sm font-semibold disabled:opacity-60" disabled={loading || !subject}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Ask
          </button>
        </form>
      </div>

      {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mt-4"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

      {answer && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mt-4">
          <div className="prose prose-sm max-w-none prose-p:text-gray-800 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-li:text-gray-800">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{answer.answer}</ReactMarkdown>
          </div>
          {answer.figures?.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {answer.figures.map((f, i) => <img key={i} src={f} alt={`Figure ${i + 1}`} className="rounded border border-gray-200" />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function EduStudyPage() {
  return (
    <EduShell>
      <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>}>
        <StudyInner />
      </Suspense>
    </EduShell>
  )
}
