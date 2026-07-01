'use client'

import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { evaluateAnswers, getIngestHistory, downloadEvalPdf, fetchModels } from '@/lib/api'
import { evalStore } from '@/lib/querySession'
import type { EvalResponse, ModelOption } from '@/lib/api'
import type { IngestedItem } from '@/types'
import { ClipboardCheck, FileText, Send, Loader2, AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp, Filter, X, Download } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import clsx from 'clsx'

const LANGUAGE_OPTIONS = [
  { group: 'English Variants', options: ['American English', 'British English', 'Australian English', 'Indian English'] },
  { group: 'European', options: ['French', 'Spanish', 'German', 'Italian', 'Portuguese'] },
  { group: 'South Asian', options: ['Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Marathi', 'Bengali'] },
  { group: 'East Asian', options: ['Japanese', 'Chinese', 'Korean'] },
]

const ACCEPT = '.pdf,.docx,.doc,.txt,.md,.csv,image/*'

const TYPE_ICON: Record<string, string> = {
  document: '📄', documents: '📄', image: '🖼', images: '🖼',
  video: '🎬', audio: '🎵', youtube: '▶', text: '📝', weblink: '🌐', weblinks: '🌐',
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-700 bg-green-50 border-green-200'
  if (score >= 50) return 'text-yellow-700 bg-yellow-50 border-yellow-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function FilePicker({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <label className={clsx(
        'flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
        file ? 'border-brand-400 bg-brand-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100',
      )}>
        <div className="flex flex-col items-center gap-1.5 text-gray-400">
          <FileText className={clsx('w-7 h-7', file && 'text-brand-600')} />
          {file ? (
            <span className="text-sm font-medium text-brand-600 max-w-xs truncate" title={file.name}>{file.name}</span>
          ) : (
            <>
              <span className="text-sm">Click to upload or drag &amp; drop</span>
              <span className="text-xs">PDF, DOCX, TXT, CSV, image — up to 10 MB</span>
            </>
          )}
        </div>
        <input type="file" accept={ACCEPT} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
      </label>
    </div>
  )
}

export default function EvaluatePage() {
  const [questionsFile, setQuestionsFile] = useState<File | null>(null)
  const [answersFile, setAnswersFile] = useState<File | null>(null)
  const [language, setLanguage] = useState('American English')
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [rubric, setRubric] = useState('')
  const [showRubric, setShowRubric] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<EvalResponse | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // Persistent session: mirror the store so an in-progress evaluation (or its
  // result) survives navigating away and back.
  const esess = evalStore.useSession()
  useEffect(() => {
    setLoading(esess.loading)
    setResult(esess.result)
    if (esess.error) setError(esess.error)
  }, [esess])

  // Source filter (scope the reference answers to specific ingested files)
  const [showSourceFilter, setShowSourceFilter] = useState(false)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [allFiles, setAllFiles] = useState<{ type: string; name: string; chunks: number }[]>([])

  useEffect(() => {
    getIngestHistory().then(hist => {
      const files: { type: string; name: string; chunks: number }[] = []
      Object.entries(hist.by_type || {}).forEach(([type, items]) => {
        ;(items as IngestedItem[]).forEach(item => {
          if (item.chunks > 0) files.push({ type, name: item.name, chunks: item.chunks })
        })
      })
      setAllFiles(files)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetchModels().then(setModels).catch(() => {})
  }, [])

  const toggleSource = (name: string) =>
    setSelectedSources(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name])

  async function handleEvaluate(e: React.FormEvent) {
    e.preventDefault()
    if (!questionsFile || !answersFile) return
    setError(''); setExpanded(new Set())
    // Run via the persistent store so the evaluation + result survive navigation.
    await evalStore.run(
      questionsFile.name,
      () => evaluateAnswers(questionsFile, answersFile, language, selectedSources, 'default', selectedModel, rubric),
    )
  }

  const [pdfLoading, setPdfLoading] = useState(false)
  async function downloadPdf() {
    if (!result) return
    setPdfLoading(true)
    try {
      const blob = await downloadEvalPdf(result)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `maximai-evaluation-${Date.now()}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not generate the PDF. Please try again.')
    } finally {
      setPdfLoading(false)
    }
  }

  function toggle(i: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-brand-600" /> Answer Evaluation
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a questions file and an answers file. Each answer is graded against a reference
            answer generated from your ingested documents, scored out of 100, with mistakes and corrections.
          </p>
        </div>

        {/* Upload form */}
        <form onSubmit={handleEvaluate} className="card p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FilePicker label="1 · Upload Questions" file={questionsFile} onPick={setQuestionsFile} />
            <FilePicker label="2 · Upload Answers" file={answersFile} onPick={setAnswersFile} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Answer Language</label>
              <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGE_OPTIONS.map(({ group, options }) => (
                  <optgroup key={group} label={group}>
                    {options.map((l) => <option key={l} value={l}>{l}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Model</label>
              <select className="input" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                <option value="">Default (Llama 3.3 70B — Free)</option>
                {models.map((m) => (
                  <option key={m.model_id} value={m.model_id}>
                    {m.label} · {m.context_k}K ctx · {m.free ? 'Free' : `$${m.input_usd_per_mtok}/$${m.output_usd_per_mtok} per M tok`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Optional grading rubric — overrides the default point split */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRubric(v => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-brand-600" />
                <span>Grading rubric (optional)</span>
                {rubric.trim() && (
                  <span className="px-2 py-0.5 rounded-full bg-brand-600 text-white text-xs font-semibold">set</span>
                )}
              </div>
              {showRubric ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showRubric && (
              <div className="px-4 py-3 bg-white">
                <p className="text-xs text-gray-500 mb-2">
                  Paste your criteria and weights — grading will follow them instead of the default. Leave blank to use the default rubric.
                </p>
                <textarea
                  className="input resize-none text-sm"
                  rows={4}
                  placeholder={"e.g.\nCorrect concept — 40\nFormula & derivation — 30\nWorked example — 20\nUnits & notation — 10"}
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Source filter — scope evaluation to specific ingested files */}
          {allFiles.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSourceFilter(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-medium text-gray-700"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-brand-600" />
                  <span>Filter by source</span>
                  {selectedSources.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-brand-600 text-white text-xs font-semibold">
                      {selectedSources.length} selected
                    </span>
                  )}
                </div>
                {showSourceFilter ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {showSourceFilter && (
                <div className="px-4 py-3 bg-white">
                  <p className="text-xs text-gray-500 mb-3">
                    Select one or more files — the reference answers will be generated <strong>only</strong> from
                    the selected documents, narrowing the evaluation to the relevant source.
                  </p>
                  {Object.entries(
                    allFiles.reduce((acc, f) => { (acc[f.type] = acc[f.type] || []).push(f); return acc },
                      {} as Record<string, typeof allFiles>)
                  ).map(([type, files]) => (
                    <div key={type} className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 capitalize">
                        {TYPE_ICON[type] || '📁'} {type === 'weblinks' ? 'Web Links' : type === 'documents' ? 'Documents' : type}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                        {files.map(f => (
                          <label key={f.name} className="flex items-center gap-2.5 cursor-pointer group min-w-0">
                            <input
                              type="checkbox"
                              checked={selectedSources.includes(f.name)}
                              onChange={() => toggleSource(f.name)}
                              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 shrink-0"
                            />
                            <span className="text-sm text-gray-700 group-hover:text-brand-700 truncate" title={f.name}>{f.name}</span>
                            <span className="text-xs text-gray-400 shrink-0">{f.chunks} chunks</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  {selectedSources.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedSources([])}
                      className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                    >
                      <X className="w-3 h-3" /> Clear selection (use all sources)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <button type="submit" disabled={loading || !questionsFile || !answersFile}
            className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Evaluating…' : 'Evaluate'}
          </button>
        </form>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Overall score */}
            <div className="card p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Overall Score</p>
                <p className={clsx('text-4xl font-bold', result.overall_score >= 80 ? 'text-green-600'
                  : result.overall_score >= 50 ? 'text-yellow-600' : 'text-red-600')}>
                  {result.overall_score}<span className="text-xl text-gray-400">/100</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">{result.total_questions} question(s)</p>
                <p className="text-xs text-gray-400 mt-1">{result.note}</p>
                <button
                  onClick={downloadPdf}
                  disabled={pdfLoading}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors disabled:opacity-60"
                >
                  {pdfLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {pdfLoading ? 'Preparing…' : 'Download PDF'}
                </button>
              </div>
            </div>

            {/* Evaluation summary: accuracy, model, token usage */}
            <div className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Evaluation accuracy</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {result.evaluation_confidence ?? 0}<span className="text-base text-gray-400">%</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Grounding of the reference answers in your documents.</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Model</p>
                <p className="text-sm font-medium text-gray-800 mt-1 break-all">{result.model_used || 'default'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Token usage</p>
                {result.token_usage ? (
                  <div className="text-sm text-gray-700 mt-1 space-y-0.5">
                    <p>{result.token_usage.total_tokens.toLocaleString()} total
                      <span className="text-gray-400"> ({result.token_usage.input_tokens.toLocaleString()} in / {result.token_usage.output_tokens.toLocaleString()} out)</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {result.token_usage.llm_calls} LLM call(s) · est. ${result.token_usage.estimated_cost_usd.toFixed(4)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-1">—</p>
                )}
              </div>
            </div>

            {/* Learning-gap analysis */}
            {result.gap_analysis && (
              <div className="card p-5 border-l-4 border-l-amber-400">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" /> Learning-Gap Analysis
                </p>
                {result.weak_questions && result.weak_questions.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Weakest questions: {result.weak_questions.map(n => `Q${n}`).join(', ')}
                  </p>
                )}
                <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">
                  {result.gap_analysis}
                </div>
              </div>
            )}

            {/* Per-question report */}
            {result.results.map((r, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="flex items-start justify-between gap-3 px-5 py-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{r.question}</p>
                      <span className={clsx('inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-xs font-medium border', scoreColor(r.score))}>
                        {r.score >= 80 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {r.score}/100 · {r.verdict}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Student answer</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.student_answer || <span className="italic text-gray-400">(no answer provided)</span>}</p>
                  </div>

                  {r.mistakes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-1">Mistakes</p>
                      <ul className="space-y-1">
                        {r.mistakes.map((m, j) => (
                          <li key={j} className="text-sm text-red-700 flex items-start gap-1.5">
                            <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.corrections.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">Corrections</p>
                      <ul className="space-y-1">
                        {r.corrections.map((c, j) => (
                          <li key={j} className="text-sm text-green-700 flex items-start gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {r.feedback && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Feedback</p>
                      <p className="text-sm text-gray-700">{r.feedback}</p>
                    </div>
                  )}

                  <button onClick={() => toggle(i)} className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    {expanded.has(i) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {expanded.has(i) ? 'Hide' : 'Show'} reference answer
                  </button>
                  {expanded.has(i) && (
                    <div className="prose prose-sm max-w-none border-t border-gray-100 pt-3
                      prose-p:text-gray-800 prose-strong:text-gray-900 prose-headings:text-gray-900
                      prose-code:bg-gray-100 prose-code:text-brand-700 prose-code:px-1 prose-code:rounded prose-code:text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{r.reference_answer}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
