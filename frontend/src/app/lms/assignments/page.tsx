'use client'

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import {
  lmsMyCourses, lmsCreateAssignment, lmsListAssignments, lmsGetAssignment,
  lmsSubmitAssignment, lmsAssignmentSubmissions, fetchModels,
} from '@/lib/api'
import type { Course, Assignment, ModelOption, SubmissionRow, GradedResult } from '@/lib/api'
import { getUserRole } from '@/lib/auth'
import { ClipboardCheck, Plus, Send, Loader2, AlertCircle, Eye, CheckCircle2, XCircle } from 'lucide-react'
import clsx from 'clsx'

function scoreColor(s: number) { return s >= 80 ? 'text-green-600' : s >= 50 ? 'text-yellow-600' : 'text-red-600' }

export default function AssignmentsPage() {
  const role = getUserRole()
  const isTeacher = role === 'teacher' || role === 'admin' || role === 'owner'
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const refresh = useCallback(() => {
    lmsListAssignments().then(r => setAssignments(r.assignments)).catch(e => setError(e.message))
  }, [])
  useEffect(() => {
    refresh()
    lmsMyCourses().then(r => setCourses(r.courses)).catch(() => {})
    fetchModels().then(setModels).catch(() => {})
  }, [refresh])

  // Teacher: create
  const [form, setForm] = useState({ grade: '', subject: '', title: '', instructions: '', questions: '', rubric: '', model: '' })
  const [creating, setCreating] = useState(false)
  const coursePairs = courses.map(c => `${c.grade}||${c.subject}`).filter((v, i, a) => a.indexOf(v) === i)
  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMsg('')
    const [grade, subject] = form.grade ? form.grade.split('||') : ['', '']
    const questions = form.questions.split('\n').map(q => q.trim()).filter(Boolean)
    if (!grade || !subject || !form.title.trim() || questions.length === 0) { setError('Pick a class, add a title and at least one question (one per line).'); return }
    setCreating(true)
    try {
      await lmsCreateAssignment({ grade, subject, title: form.title.trim(), instructions: form.instructions.trim(), questions, rubric: form.rubric.trim(), model: form.model })
      setMsg('Assignment created.'); setForm({ ...form, title: '', instructions: '', questions: '', rubric: '' }); refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Create failed.') } finally { setCreating(false) }
  }

  // Teacher: view submissions
  const [subsFor, setSubsFor] = useState<{ title: string; rows: SubmissionRow[] } | null>(null)
  async function viewSubs(a: Assignment) {
    try { const r = await lmsAssignmentSubmissions(a.id); setSubsFor({ title: a.title, rows: r.submissions }) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load submissions.') }
  }

  // Student: take
  const [taking, setTaking] = useState<Assignment | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [graded, setGraded] = useState<{ score: number; results: GradedResult[]; gap_analysis: string } | null>(null)
  async function open(a: Assignment) {
    setError(''); setGraded(null)
    try { const full = await lmsGetAssignment(a.id); setTaking(full); setAnswers(new Array(full.questions?.length || 0).fill('')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open assignment.') }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!taking) return; setSubmitting(true); setError('')
    try { setGraded(await lmsSubmitAssignment(taking.id, answers)); refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Submit failed.') } finally { setSubmitting(false) }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-brand-600" /> Assignments
          </h1>
          <p className="text-sm text-gray-500 mt-1">{isTeacher ? 'Create assignments and review auto-graded submissions.' : 'Take your assignments — answers are graded instantly against your syllabus.'}</p>
        </div>

        {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
        {msg && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">{msg}</div>}

        {isTeacher && (
          <form onSubmit={create} className="card p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Plus className="w-4 h-4 text-brand-600" /> New assignment</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Class</label>
                <select className="input" required value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>
                  <option value="">Select grade + subject…</option>
                  {coursePairs.map(p => { const [g, s] = p.split('||'); return <option key={p} value={p}>Grade {g} · {s}</option> })}
                </select>
              </div>
              <div><label className="label">Title</label><input className="input" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            </div>
            <div><label className="label">Questions (one per line)</label>
              <textarea className="input resize-none" rows={4} value={form.questions} onChange={e => setForm({ ...form, questions: e.target.value })} placeholder={'State Newton\'s second law.\nDefine momentum.'} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Rubric (optional)</label><textarea className="input resize-none" rows={2} value={form.rubric} onChange={e => setForm({ ...form, rubric: e.target.value })} placeholder="Criteria + weights (optional)" /></div>
              <div><label className="label">Model</label>
                <select className="input" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}>
                  <option value="">Default (Llama 3.3 70B — Free)</option>
                  {models.map(m => <option key={m.model_id} value={m.model_id}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <button className="btn-primary flex items-center gap-2" disabled={creating}>{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create</button>
          </form>
        )}

        {/* List */}
        <div className="space-y-2">
          {assignments.map(a => (
            <div key={a.id} className="card p-4 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{a.title}</p>
                <p className="text-xs text-gray-500">Grade {a.grade} · {a.subject}{a.num_questions ? ` · ${a.num_questions} questions` : ''}</p>
              </div>
              {isTeacher ? (
                <button onClick={() => viewSubs(a)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600"><Eye className="w-4 h-4" /> Submissions</button>
              ) : a.submission_status === 'graded' ? (
                <span className={clsx('text-sm font-semibold', scoreColor(a.submission_score || 0))}>{a.submission_score}/100</span>
              ) : (
                <button onClick={() => open(a)} className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm hover:bg-brand-700">Take</button>
              )}
            </div>
          ))}
          {assignments.length === 0 && <div className="card p-8 text-center text-gray-400 text-sm">No assignments yet.</div>}
        </div>

        {/* Student: take modal (inline) */}
        {taking && !graded && (
          <form onSubmit={submit} className="card p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-900">{taking.title} — Grade {taking.grade} · {taking.subject}</p>
            {taking.instructions && <p className="text-xs text-gray-500">{taking.instructions}</p>}
            {(taking.questions || []).map((q, i) => (
              <div key={i}>
                <label className="label">Q{i + 1}. {q}</label>
                <textarea className="input resize-none" rows={2} value={answers[i] || ''} onChange={e => { const a = [...answers]; a[i] = e.target.value; setAnswers(a) }} />
              </div>
            ))}
            <div className="flex gap-2">
              <button className="btn-primary flex items-center gap-2" disabled={submitting}>{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Submit</button>
              <button type="button" onClick={() => setTaking(null)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">Cancel</button>
            </div>
          </form>
        )}

        {/* Student: graded result */}
        {graded && (
          <div className="card p-5 space-y-3">
            <p className="text-sm text-gray-500">Your score</p>
            <p className={clsx('text-4xl font-bold', scoreColor(graded.score))}>{graded.score}<span className="text-xl text-gray-400">/100</span></p>
            {graded.results.map((r, i) => (
              <div key={i} className="border-t border-gray-100 pt-3">
                <p className="text-sm font-medium text-gray-900">Q{i + 1}. {r.question}</p>
                <p className={clsx('text-xs font-semibold mt-1 inline-flex items-center gap-1', scoreColor(r.score))}>{r.score >= 80 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{r.score}/100 · {r.verdict}</p>
                {r.feedback && <p className="text-sm text-gray-600 mt-1">{r.feedback}</p>}
              </div>
            ))}
            {graded.gap_analysis && (
              <div className="border-l-4 border-l-amber-400 bg-amber-50/40 p-3 rounded text-sm text-gray-700 whitespace-pre-wrap">{graded.gap_analysis}</div>
            )}
            <button onClick={() => { setTaking(null); setGraded(null) }} className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600">Done</button>
          </div>
        )}

        {/* Teacher: submissions */}
        {subsFor && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">Submissions — {subsFor.title}</p>
              <button onClick={() => setSubsFor(null)} className="text-xs text-gray-500 hover:text-gray-700">Close</button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider"><tr><th className="text-left px-3 py-2">Student</th><th className="text-left px-3 py-2">Score</th><th className="text-left px-3 py-2">Gap summary</th></tr></thead>
              <tbody>
                {subsFor.rows.map(s => (
                  <tr key={s.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-800">{s.student_name || s.student_email}</td>
                    <td className={clsx('px-3 py-2 font-semibold', scoreColor(s.score))}>{s.score}/100</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{(s.gap_analysis || '').slice(0, 140)}</td>
                  </tr>
                ))}
                {subsFor.rows.length === 0 && <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No submissions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
