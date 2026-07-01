'use client'

import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { generateQuiz, generateTeaching, fetchModels, getIngestHistory } from '@/lib/api'
import type { ModelOption, GenerateResponse } from '@/lib/api'
import type { IngestedItem } from '@/types'
import { GraduationCap, FileQuestion, BookOpen, Loader2, Sparkles, Filter, ChevronDown, ChevronUp, X, Copy, Check, AlertCircle } from 'lucide-react'
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

const TEACH_KINDS = [
  { id: 'lesson_plan', label: 'Lesson Plan' },
  { id: 'rubric', label: 'Grading Rubric' },
  { id: 'syllabus', label: 'Syllabus Outline' },
]

export default function TeacherToolsPage() {
  const [mode, setMode] = useState<'quiz' | 'teaching'>('quiz')
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [language, setLanguage] = useState('American English')
  const [topic, setTopic] = useState('')

  // Quiz options
  const [numQuestions, setNumQuestions] = useState(5)
  const [questionType, setQuestionType] = useState('mixed')
  const [difficulty, setDifficulty] = useState('medium')
  // Teaching option
  const [teachKind, setTeachKind] = useState('lesson_plan')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [copied, setCopied] = useState(false)

  // Source filter
  const [showSourceFilter, setShowSourceFilter] = useState(false)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [allFiles, setAllFiles] = useState<{ type: string; name: string; chunks: number }[]>([])

  useEffect(() => { fetchModels().then(setModels).catch(() => {}) }, [])
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

  const toggleSource = (name: string) =>
    setSelectedSources(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name])

  async function handleGenerate() {
    setError(''); setResult(null); setLoading(true); setCopied(false)
    try {
      const res = mode === 'quiz'
        ? await generateQuiz({ sourceFilters: selectedSources, numQuestions, questionType, difficulty, topic, language, model: selectedModel })
        : await generateTeaching({ sourceFilters: selectedSources, kind: teachKind, topic, language, model: selectedModel })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function copyOut() {
    if (!result) return
    try { await navigator.clipboard.writeText(result.content); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-brand-600" /> Teacher Tools
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate quizzes and teaching materials grounded only in your ingested course content.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('quiz')}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              mode === 'quiz' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
          >
            <FileQuestion className="w-4 h-4" /> Quiz Generator
          </button>
          <button
            onClick={() => setMode('teaching')}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
              mode === 'teaching' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')}
          >
            <BookOpen className="w-4 h-4" /> Teaching Materials
          </button>
        </div>

        <div className="card p-5 space-y-4">
          {/* Topic */}
          <div>
            <label className="label">Topic (optional)</label>
            <input
              className="input"
              placeholder="e.g. Coulomb's Law and electrostatics — leave blank to cover all selected material"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
          </div>

          {/* Mode-specific controls */}
          {mode === 'quiz' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Number of questions</label>
                <input type="number" min={1} max={25} className="input"
                  value={numQuestions} onChange={(e) => setNumQuestions(Math.max(1, Math.min(25, Number(e.target.value) || 1)))} />
              </div>
              <div>
                <label className="label">Question type</label>
                <select className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
                  <option value="mixed">Mixed</option>
                  <option value="mcq">Multiple choice</option>
                  <option value="short">Short answer</option>
                  <option value="long">Long / descriptive</option>
                </select>
              </div>
              <div>
                <label className="label">Difficulty</label>
                <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="label">Material type</label>
              <select className="input sm:w-1/2" value={teachKind} onChange={(e) => setTeachKind(e.target.value)}>
                {TEACH_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Language</label>
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

          {/* Source filter */}
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
                    Select files — the material will be generated <strong>only</strong> from the selected documents.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                    {allFiles.map(f => (
                      <label key={f.name} className="flex items-center gap-2.5 cursor-pointer group min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedSources.includes(f.name)}
                          onChange={() => toggleSource(f.name)}
                          className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 shrink-0"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-brand-700 truncate" title={f.name}>{f.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{f.chunks}</span>
                      </label>
                    ))}
                  </div>
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

          <button onClick={handleGenerate} disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating…' : mode === 'quiz' ? 'Generate Quiz' : 'Generate Material'}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
          </div>
        )}

        {result && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">Generated output</p>
              <button onClick={copyOut} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="prose prose-sm max-w-none
              prose-p:text-gray-800 prose-strong:text-gray-900 prose-headings:text-gray-900 prose-li:text-gray-800
              prose-code:bg-gray-100 prose-code:text-brand-700 prose-code:px-1 prose-code:rounded prose-code:text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{result.content}</ReactMarkdown>
            </div>
            {result.token_usage && (
              <p className="text-xs text-gray-400 mt-4 border-t border-gray-100 pt-3">
                Model: {result.model_used || 'default'} · {result.token_usage.total_tokens.toLocaleString()} tokens · est. ${result.token_usage.estimated_cost_usd.toFixed(4)}
              </p>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
