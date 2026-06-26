'use client'

import { useState, useEffect, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { submitQuery, getIngestHistory, submitQueryFromImage, fetchModels, fetchAnswerAudio } from '@/lib/api'
import { queryStore } from '@/lib/querySession'
import type { ImageQueryItem, ImageQueryResponse, ModelOption } from '@/lib/api'
import type { QueryResponse, IngestedItem } from '@/types'
import { Send, ChevronDown, ChevronUp, Zap, BookOpen, AlertCircle, Gauge, BarChart3, ChevronRight, FileText, Volume2, VolumeX, Pause, Play, Square, Filter, X, Mic, MicOff, Copy, Download, Check, Sparkles, Keyboard, Loader2, Music, Video, Globe, Youtube, Image as ImageIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { latexToReadable, answerToClipboard } from '@/lib/latex'
import clsx from 'clsx'
import { useTextToSpeech } from '@/hooks/useTextToSpeech'
import { useVoiceInput } from '@/hooks/useVoiceInput'

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2]

// Data types MaximAI can answer from — shown as chips under the page heading
const DATA_TYPES = [
  { label: 'Documents', icon: FileText },
  { label: 'Text', icon: FileText },
  { label: 'Audio', icon: Music },
  { label: 'Video', icon: Video },
  { label: 'Web Links', icon: Globe },
  { label: 'YouTube', icon: Youtube },
  { label: 'Images', icon: ImageIcon },
]

// All supported answer languages grouped by region
const LANGUAGE_OPTIONS = [
  { group: 'English Variants', options: [
    'American English', 'British English', 'Australian English', 'Indian English',
  ]},
  { group: 'European', options: [
    'French', 'Spanish', 'German', 'Italian', 'Dutch', 'Portuguese',
    'Polish', 'Norwegian', 'Russian', 'Greek', 'Irish',
  ]},
  { group: 'South Asian', options: [
    'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Kannada', 'Marathi', 'Bengali',
  ]},
  { group: 'East & Southeast Asian', options: [
    'Japanese', 'Chinese', 'Korean', 'Indonesian', 'Malay',
  ]},
  { group: 'Middle East & African', options: [
    'Arabic',
  ]},
  { group: 'Other', options: [
    'Singaporean English', 'Mexican Spanish',
  ]},
]

const ALL_LANGUAGES = LANGUAGE_OPTIONS.flatMap(g => g.options)

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const PATTERNS = [
  'auto', 'naive_rag', 'hyde', 'query_rewriting', 'crag',
  'self_rag', 'adaptive_rag', 'flare', 'speculative_rag',
  'modular_rag', 'agentic_rag', 'graph_rag', 'conversational_rag', 'rag_fusion',
]

function QualityBadge({ score }: { score: number }) {
  const color = score >= 0.8 ? 'bg-green-100 text-green-800'
              : score >= 0.6 ? 'bg-yellow-100 text-yellow-800'
              : score >= 0.3 ? 'bg-orange-100 text-orange-800'
              : 'bg-red-100 text-red-800 ring-1 ring-red-400'
  const label = score < 0.3 ? 'Poor match — rephrase query'
              : `Quality ${(score * 100).toFixed(0)}%`
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', color)}>
      {score < 0.3 && <AlertCircle className="w-3 h-3" />}
      {label}
    </span>
  )
}

interface QueryHistory {
  query: string
  answer: string
  pattern: string
  latency: number
  quality: number
}

export default function QueryPage() {
  const [query, setQuery] = useState('')
  const [pattern, setPattern] = useState('auto')
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSources, setShowSources] = useState(false)
  const [forceFresh, setForceFresh] = useState(false)  // bypass cache for this query
  const [history, setHistory] = useState<QueryHistory[]>([])

  // Persistent session: mirror the module-level store into local state so an
  // in-progress answer (or completed result) survives navigating away and back.
  const qsess = queryStore.useSession()
  const lastAppended = useRef<QueryResponse | null>(null)
  const seeded = useRef(false)
  useEffect(() => {
    setLoading(qsess.loading)
    setResult(qsess.result)
    if (qsess.error) setError(qsess.error)
    // Restore the question text only when the box is empty (e.g. after remount)
    if (qsess.label && (qsess.loading || qsess.result)) setQuery(prev => prev || qsess.label)
    // Seed on first run so a result that already existed at mount isn't re-added
    if (!seeded.current) {
      seeded.current = true
      lastAppended.current = qsess.result
      return
    }
    // Append a freshly-completed result to the in-session history once
    if (qsess.result && qsess.result !== lastAppended.current) {
      lastAppended.current = qsess.result
      const res = qsess.result
      setHistory(prev => [{
        query: qsess.label,
        answer: res.answer,
        pattern: (res.patterns_used && res.patterns_used.length > 0) ? res.patterns_used.join(' → ') : (res.pattern_used || 'auto'),
        latency: res.latency_ms || 0,
        quality: res.quality_score ?? 0.5,
      }, ...prev.slice(0, 9)])
    }
  }, [qsess])
  const [memoryTab, setMemoryTab] = useState<'history' | 'patterns'>('history')
  const [copied, setCopied] = useState(false)

  // Model selector
  const [models, setModels] = useState<ModelOption[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  useEffect(() => {
    fetchModels().then(setModels).catch(() => {})
  }, [])

  // Image query mode
  const [inputMode, setInputMode] = useState<'text' | 'image'>('text')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageResult, setImageResult] = useState<ImageQueryResponse | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [expandedAnswers, setExpandedAnswers] = useState<Set<number>>(new Set())
  const [expandedEnv, setExpandedEnv] = useState<string | null>(null)
  const tts = useTextToSpeech()

  // Voice input (speech-to-text)
  const voice = useVoiceInput({
    onResult: (transcript) => setQuery(prev => (prev ? prev + ' ' : '') + transcript),
  })

  // Source filter state
  const [showSourceFilter, setShowSourceFilter] = useState(false)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [allFiles, setAllFiles] = useState<{ type: string; name: string; chunks: number }[]>([])

  useEffect(() => {
    getIngestHistory().then(hist => {
      const files: { type: string; name: string; chunks: number }[] = []
      Object.entries(hist.by_type || {}).forEach(([type, items]) => {
        ;(items as IngestedItem[]).forEach(item => {
          if (item.chunks > 0) {
            files.push({ type, name: item.name, chunks: item.chunks })
          }
        })
      })
      setAllFiles(files)
    }).catch(() => {})
  }, [])

  const toggleSource = (name: string) => {
    setSelectedSources(prev =>
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    )
  }

  const TYPE_ICON: Record<string, string> = {
    document: '📄', documents: '📄',
    image: '🖼', images: '🖼',
    video: '🎬',
    audio: '🎵',
    youtube: '▶',
    text: '📝',
    weblink: '🌐', weblinks: '🌐',
  }

  const [language, setLanguage] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rag_answer_language') || 'American English'
    }
    return 'American English'
  })

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    if (typeof window !== 'undefined') {
      localStorage.setItem('rag_answer_language', lang)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setError('')
    setShowSources(false)
    tts.stop()
    const q = query.trim()
    // Run via the persistent store so the request + result survive navigation.
    // Loading/result/error and history are mirrored back by the effect above.
    await queryStore.run(q, (signal) => submitQuery({
      query: q,
      pattern: pattern === 'auto' ? undefined : pattern,
      language,
      source_filters: selectedSources.length > 0 ? selectedSources : undefined,
      model: selectedModel || undefined,
      no_cache: forceFresh,
    }, signal))
  }

  // Cancel an in-progress query.
  function cancelQuery() {
    queryStore.cancel()
    tts.stop()
  }

  // Download the Q&A as an MP3 (podcast) via server-side TTS.
  const [podcastLoading, setPodcastLoading] = useState(false)
  async function downloadPodcast() {
    if (!result) return
    setPodcastLoading(true)
    try {
      const text = `Question: ${qsess.label || query}\n\nAnswer: ${latexToReadable(result.answer)}`
      const blob = await fetchAnswerAudio(text, language)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `maximai-answer-${Date.now()}.mp3`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not generate the audio file. Please try again.')
    } finally {
      setPodcastLoading(false)
    }
  }

  // Start a fresh, blank session for the next query.
  function newSession() {
    queryStore.reset()
    setQuery('')
    setResult(null)
    setError('')
    setShowSources(false)
    tts.stop()
  }

  // Calculate pattern performance from history
  const patternPerf = history.reduce((acc, h) => {
    if (!acc[h.pattern]) acc[h.pattern] = { count: 0, totalQuality: 0 }
    acc[h.pattern].count += 1
    acc[h.pattern].totalQuality += h.quality
    return acc
  }, {} as Record<string, { count: number; totalQuality: number }>)

  const patternStats = Object.entries(patternPerf)
    .map(([pattern, { count, totalQuality }]) => ({
      pattern,
      avgQuality: totalQuality / count,
      usageCount: count,
    }))
    .sort((a, b) => b.avgQuality - a.avgQuality)

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    setImageResult(null)
    setImageError('')
    setExpandedAnswers(new Set())
    // Only image files get a visual preview; other types show a filename chip.
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => setImagePreview(ev.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setImagePreview(null)
    }
  }

  async function handleImageSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!imageFile) return
    setImageError('')
    setImageResult(null)
    setImageLoading(true)
    try {
      const res = await submitQueryFromImage(imageFile, language)
      setImageResult(res)
      // Expand all answers by default
      setExpandedAnswers(new Set(res.results.map((_, i) => i)))
    } catch (err: unknown) {
      setImageError(err instanceof Error ? err.message : 'Image query failed')
    } finally {
      setImageLoading(false)
    }
  }

  function toggleAnswer(i: number) {
    setExpandedAnswers(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function copyImageQA() {
    if (!imageResult) return
    const parts = imageResult.results.map((r, i) =>
      answerToClipboard(`Q${i + 1}: ${r.question}`, r.answer))
    const plain = parts.map((p) => p.plain).join('\n\n---\n\n')
    const html = parts.map((p) => p.html).join('\n<hr/>\n')
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(plain)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadImageQA() {
    if (!imageResult) return
    const text = imageResult.results
      .map((r, i) => `Q${i + 1}: ${r.question}\n\nA${i + 1}: ${latexToReadable(r.answer)}`)
      .join('\n\n---\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `answers-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyQA() {
    if (!result) return
    const { plain, html } = answerToClipboard(query, result.answer)
    try {
      // Rich copy: Word uses the HTML (formatted + Unicode math), text editors
      // use the plain Unicode version. Falls back to plain text if unsupported.
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(plain)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadQA() {
    if (!result) return
    const text = `Q: ${query}\n\nA: ${latexToReadable(result.answer)}`
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `answer-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Main content — full width */}
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">💬 Ask Your Data</h1>
            <p className="text-sm text-gray-500 mt-1">
              Ask anything across your indexed data. The system auto-selects the optimal RAG pattern.
            </p>
            {/* Supported data types — informational (not clickable filters) */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Supported:</span>
              {DATA_TYPES.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium"
                >
                  <Icon className="w-3.5 h-3.5 text-brand-600" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Query form */}
          <div className="card p-5 mb-6">
            {/* Input mode tabs */}
            <div className="flex gap-1 mb-4 border-b border-gray-200">
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`flex items-center gap-1.5 text-sm font-medium pb-2.5 px-3 border-b-2 transition-colors ${
                  inputMode === 'text'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Keyboard className="w-4 h-4" />
                Type / Voice
              </button>
              <button
                type="button"
                onClick={() => setInputMode('image')}
                className={`flex items-center gap-1.5 text-sm font-medium pb-2.5 px-3 border-b-2 transition-colors ${
                  inputMode === 'image'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                Upload File
              </button>
            </div>

            {/* Image query form */}
            {inputMode === 'image' && (
              <form onSubmit={handleImageSubmit} className="space-y-4">
                <div>
                  <label className="label">Upload a file with one or more questions</label>
                  <label className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    imageFile ? 'border-brand-400 bg-brand-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                  }`}>
                    {imagePreview ? (
                      <img src={imagePreview} alt="preview" className="h-full w-full object-contain rounded-lg p-1" />
                    ) : imageFile ? (
                      <div className="flex flex-col items-center gap-2 text-brand-600">
                        <FileText className="w-8 h-8" />
                        <span className="text-sm font-medium max-w-xs truncate" title={imageFile.name}>{imageFile.name}</span>
                        <span className="text-xs text-gray-500">Click to choose a different file</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <FileText className="w-8 h-8" />
                        <span className="text-sm">Click to upload or drag & drop</span>
                        <span className="text-xs">Any file — PDF, DOCX, TXT, CSV, image — up to 10 MB</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt,.md,.csv,image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                    />
                  </label>
                  {imageFile && (
                    <p className="text-xs text-gray-500 mt-1">{imageFile.name} · {(imageFile.size / 1024).toFixed(1)} KB</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Answer Language</label>
                    <select className="input" value={language} onChange={(e) => handleLanguageChange(e.target.value)}>
                      {LANGUAGE_OPTIONS.map(({ group, options }) => (
                        <optgroup key={group} label={group}>
                          {options.map((lang) => <option key={lang} value={lang}>{lang}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <button type="submit" disabled={imageLoading || !imageFile} className="btn-primary flex items-center gap-2">
                  {imageLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {imageLoading ? 'Extracting & answering…' : 'Extract questions & answer all'}
                </button>
              </form>
            )}

            {/* Text / voice form */}
            {inputMode === 'text' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Question</label>
                <div className="relative">
                  <textarea
                    className={`input resize-none pr-36 ${voice.listening ? 'border-red-300 ring-1 ring-red-200' : ''}`}
                    rows={3}
                    placeholder={voice.listening ? '🎤 Listening… speak your question…' : 'What would you like to know?'}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    required
                  />
                  {/* Mic button — pinned inside textarea top-right */}
                  <button
                    type="button"
                    onClick={voice.supported ? (voice.listening ? voice.stopListening : voice.startListening) : undefined}
                    disabled={!voice.supported}
                    title={!voice.supported ? 'No microphone detected' : voice.listening ? 'Stop recording' : 'Ask by voice'}
                    className={`absolute top-2 right-2 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      !voice.supported
                        ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60'
                        : voice.listening
                          ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                          : 'bg-white border-gray-300 text-gray-500 hover:border-brand-400 hover:text-brand-600'
                    }`}
                  >
                    {voice.listening
                      ? <><MicOff className="w-3.5 h-3.5" /> Stop</>
                      : <><Mic className="w-3.5 h-3.5" /> Ask by voice</>}
                  </button>
                  {voice.listening && (
                    <span className="absolute right-3 bottom-3 flex items-center gap-1 text-xs text-red-500">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
                      Recording
                    </span>
                  )}
                </div>
                {voice.error && voice.supported && (
                  <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{voice.error}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">RAG Pattern</label>
                  <select
                    className="input"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                  >
                    {PATTERNS.map((p) => (
                      <option key={p} value={p}>
                        {p === 'auto' ? 'Auto (recommended)' : p.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label flex items-center gap-1.5">
                    LLM Model
                    {selectedModel && (() => {
                      const m = models.find(m => m.model_id === selectedModel)
                      return m ? (
                        <>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${m.provider === 'anthropic' ? 'bg-violet-100 text-violet-700' : 'bg-orange-100 text-orange-700'}`}>
                            {m.provider === 'anthropic' ? 'Claude' : 'Groq'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                            {m.context_k}K ctx
                          </span>
                          {m.free ? (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Free</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                              ${m.input_usd_per_mtok}/M in · ${m.output_usd_per_mtok}/M out
                            </span>
                          )}
                        </>
                      ) : null
                    })()}
                  </label>
                  <select
                    className="input"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    <option value="">Default (Llama 3.3 70B — Free)</option>
                    {models.map((m) => (
                      <option key={m.model_id} value={m.model_id}>
                        {m.label} · {m.context_k}K ctx · {m.free ? 'Free' : `$${m.input_usd_per_mtok}/$${m.output_usd_per_mtok} per M tok`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label flex items-center gap-1.5">
                    Answer Language
                    {language !== 'American English' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-brand-100 text-brand-700">
                        {language}
                      </span>
                    )}
                  </label>
                  <select
                    className="input"
                    value={language}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                  >
                    {LANGUAGE_OPTIONS.map(({ group, options }) => (
                      <optgroup key={group} label={group}>
                        {options.map((lang) => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              {/* Source Filter Panel */}
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
                        Select one or more files — RAG will query <strong>only</strong> the selected sources, reducing hallucination from unrelated documents.
                      </p>
                      {/* Group by type */}
                      {Object.entries(
                        allFiles.reduce((acc, f) => {
                          ;(acc[f.type] = acc[f.type] || []).push(f)
                          return acc
                        }, {} as Record<string, typeof allFiles>)
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
                                <span className="text-sm text-gray-700 group-hover:text-brand-700 truncate" title={f.name}>
                                  {f.name}
                                </span>
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
                          <X className="w-3 h-3" /> Clear selection (search all sources)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={loading || !query.trim()} className="btn-primary flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  {loading ? 'Thinking…' : 'Submit'}
                </button>
                {loading && (
                  <button
                    type="button"
                    onClick={cancelQuery}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5" /> Cancel
                  </button>
                )}
                {!loading && (result || error) && (
                  <button
                    type="button"
                    onClick={newSession}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" /> New query
                  </button>
                )}
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ml-auto" title="Re-run from scratch instead of returning a cached answer for the same question">
                  <input
                    type="checkbox"
                    checked={forceFresh}
                    onChange={(e) => setForceFresh(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Force fresh answer (ignore cache)
                </label>
              </div>
            </form>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Image extraction error */}
          {imageError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {imageError}
            </div>
          )}

          {/* Image batch results */}
          {imageResult && imageResult.results.length > 0 && (
            <div className="space-y-4 mb-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-600" />
                  <h2 className="text-base font-semibold text-gray-900">
                    {imageResult.questions_found} question{imageResult.questions_found !== 1 ? 's' : ''} answered
                  </h2>
                  <span className="text-xs text-gray-400">{imageResult.extraction_note}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyImageQA}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy all'}
                  </button>
                  <button
                    onClick={downloadImageQA}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>
                </div>
              </div>

              {/* Per-question answer cards */}
              {imageResult.results.map((item, i) => (
                <div key={i} className="card overflow-hidden">
                  {/* Question header — always visible */}
                  <button
                    onClick={() => toggleAnswer(i)}
                    className="w-full flex items-start justify-between px-5 py-4 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm font-medium text-gray-900 leading-snug">{item.question}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <QualityBadge score={item.quality_score} />
                      {expandedAnswers.has(i)
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>

                  {/* Answer — expanded */}
                  {expandedAnswers.has(i) && (
                    <div className="border-t border-gray-100 px-5 py-4">
                      <div className="prose prose-sm max-w-none
                        prose-p:text-gray-800 prose-p:leading-relaxed
                        prose-strong:text-gray-900
                        prose-headings:text-gray-900 prose-headings:font-semibold
                        prose-ul:text-gray-800 prose-ol:text-gray-800
                        prose-code:bg-gray-100 prose-code:text-brand-700 prose-code:px-1 prose-code:rounded prose-code:text-xs
                      ">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{item.answer}</ReactMarkdown>
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                        <span>{item.latency_ms}ms</span>
                        <span className="capitalize">{item.patterns_used.join(' → ') || 'auto'}</span>
                      </div>
                      {item.suggested_followups.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.suggested_followups.map((q, j) => (
                            <button
                              key={j}
                              onClick={() => { setInputMode('text'); setQuery(q); setImageResult(null) }}
                              className="px-2.5 py-1 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 transition-colors"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* No questions found notice */}
          {imageResult && imageResult.results.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {imageResult.extraction_note || 'No questions were detected in the uploaded file.'}
            </div>
          )}

          {/* Model fallback notice — selected model differed from the one used */}
          {result && selectedModel && result.model_used && result.model_used !== selectedModel && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 mb-4">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                You selected <strong>{selectedModel}</strong>, but the answer was generated with{' '}
                <strong>{result.model_used}</strong>. The selected model was unavailable — usually a
                billing/quota issue on that provider (e.g. no Anthropic credit). Add credit to use it.
              </span>
            </div>
          )}

          {/* Low-quality warning — shown when quality < 30% */}
          {result && (result.quality_score ?? 1) < 0.3 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 mb-4">
              <div className="flex items-start gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm font-semibold text-amber-800">Low quality response — the system could not find a good match</p>
              </div>
              <p className="text-xs text-amber-700 mb-2 ml-6">
                This usually happens when you query by <strong>filename or label</strong> instead of by <strong>content</strong>.
                Try rephrasing your question:
              </p>
              <ul className="ml-6 space-y-1">
                {[
                  { bad: 'Talk about invoice2.jpg', good: 'What is the total amount in the invoice?' },
                  { bad: 'Tell me about the image', good: 'List all line items and their prices' },
                  { bad: 'What is in the YouTube video?', good: 'Explain how Machine Learning differs from Deep Learning' },
                  { bad: 'Summarise my document', good: 'What are the key findings in the report?' },
                ].map((tip, i) => (
                  <li key={i} className="text-xs text-amber-700 flex items-start gap-1.5">
                    <span className="text-red-500 font-mono shrink-0">✗</span>
                    <span className="line-through text-gray-400">{tip.bad}</span>
                    <span className="text-amber-500 mx-1">→</span>
                    <button
                      onClick={() => { setQuery(tip.good); setResult(null) }}
                      className="text-brand-600 hover:underline font-medium text-left"
                    >
                      {tip.good}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-4">
              {/* Answer */}
              <div className="card p-5">
                {/* Header row: pattern + quality */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-brand-600" />
                    <span className="text-sm font-medium text-gray-700">
                      Pattern:{' '}
                      {(result.patterns_used && result.patterns_used.length > 0
                        ? result.patterns_used
                        : ['auto']
                      ).map((p, i) => (
                        <span key={p}>
                          {i > 0 && <span className="text-gray-400 mx-1">→</span>}
                          <span className="text-brand-600 capitalize">{p.replace(/_/g, ' ')}</span>
                        </span>
                      ))}
                      {result.retrieval_channel && result.retrieval_channel !== 'vector' && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                          via {result.retrieval_channel}
                        </span>
                      )}
                      {result.verified_knowledge_hit && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">cached</span>
                      )}
                      {selectedSources.length > 0 && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                          🎯 {selectedSources.length === 1
                            ? selectedSources[0].length > 30 ? selectedSources[0].slice(0, 30) + '…' : selectedSources[0]
                            : `${selectedSources.length} files`}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <QualityBadge score={result.quality_score ?? 0.5} />
                    {language !== 'American English' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">{language}</span>
                    )}
                    <span className="text-xs text-gray-400">{result.latency_ms ?? 0}ms</span>
                    {result.model_used && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">
                        {result.model_used.startsWith('claude') ? 'Claude' : 'Groq'} · {result.model_used}
                      </span>
                    )}
                    <button
                      onClick={copyQA}
                      title="Copy question & answer"
                      className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-xs"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={downloadQA}
                      title="Download question & answer"
                      className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-xs"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Save
                    </button>
                  </div>
                </div>

                {/* Answer text */}
                <div className="prose prose-sm max-w-none mb-4
                  prose-p:text-gray-800 prose-p:leading-relaxed
                  prose-strong:text-gray-900
                  prose-headings:text-gray-900 prose-headings:font-semibold
                  prose-ul:text-gray-800 prose-ol:text-gray-800
                  prose-li:my-0.5
                  prose-code:bg-gray-100 prose-code:text-brand-700 prose-code:px-1 prose-code:rounded prose-code:text-xs
                  prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-lg prose-pre:text-xs
                  prose-table:w-full prose-table:text-sm
                  prose-thead:bg-gray-50
                  prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-gray-700 prose-th:border prose-th:border-gray-200
                  prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200 prose-td:text-gray-700
                  prose-tr:even:bg-gray-50
                ">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {result.answer}
                  </ReactMarkdown>
                </div>

                {/* Figures extracted from the source documents (STEM/Marker) */}
                {(result.figures ?? []).length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-600 mb-2">
                      Figures from source ({result.figures!.length})
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {result.figures!.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                           className="block border border-gray-200 rounded-lg overflow-hidden hover:border-brand-400 transition-colors">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Figure ${i + 1}`} className="w-full h-auto object-contain bg-white" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Token usage bar */}
                {result.token_usage && result.token_usage.total_tokens > 0 && (
                  <div className="flex flex-wrap items-center gap-3 py-2.5 px-3 mb-3 rounded-lg bg-gray-50 border border-gray-100 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Token Usage</span>
                    <span title="Tokens sent to the model">&#8594; {result.token_usage.input_tokens.toLocaleString()} in</span>
                    <span title="Tokens generated by the model">&#8592; {result.token_usage.output_tokens.toLocaleString()} out</span>
                    <span className="font-medium text-gray-700">{result.token_usage.total_tokens.toLocaleString()} total</span>
                    <span className="text-gray-400">|</span>
                    <span>{result.token_usage.llm_calls} LLM call{result.token_usage.llm_calls !== 1 ? 's' : ''}</span>
                    {result.token_usage.estimated_cost_usd > 0 ? (
                      <span className="ml-auto font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                        ~${result.token_usage.estimated_cost_usd.toFixed(4)}
                      </span>
                    ) : (
                      <span className="ml-auto font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded">Free</span>
                    )}
                  </div>
                )}

                {/* TTS player */}
                {tts.supported && (
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <Volume2 className="w-4 h-4 text-gray-400 shrink-0" />

                    {/* Download podcast (MP3) */}
                    <button
                      onClick={downloadPodcast}
                      disabled={podcastLoading}
                      title="Download this Q&A as an audio file (podcast)"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:border-brand-400 hover:text-brand-600 transition-colors disabled:opacity-60"
                    >
                      {podcastLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      {podcastLoading ? 'Generating…' : 'Download podcast'}
                    </button>

                    {/* Play / Pause / Resume */}
                    {tts.state === 'idle' && (
                      <button
                        onClick={() => tts.play(result.answer)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Listen
                      </button>
                    )}
                    {tts.state === 'playing' && (
                      <button
                        onClick={tts.pause}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500 text-white text-xs font-medium hover:bg-yellow-600 transition-colors"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    )}
                    {tts.state === 'paused' && (
                      <button
                        onClick={tts.resume}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    )}

                    {/* Stop — only when active */}
                    {tts.state !== 'idle' && (
                      <button
                        onClick={tts.stop}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-100 transition-colors"
                      >
                        <Square className="w-3 h-3" />
                        Stop
                      </button>
                    )}

                    {/* Speed selector */}
                    <div className="ml-auto flex items-center gap-1">
                      <span className="text-xs text-gray-400">Speed:</span>
                      <select
                        value={tts.speed}
                        onChange={(e) => tts.setSpeed(Number(e.target.value))}
                        className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
                      >
                        {SPEED_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}×</option>
                        ))}
                      </select>
                    </div>

                    {/* Playing indicator */}
                    {tts.state === 'playing' && (
                      <span className="flex items-center gap-1 text-xs text-brand-600 font-medium">
                        <span className="inline-flex gap-0.5">
                          <span className="w-0.5 h-3 bg-brand-600 rounded animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-0.5 h-3 bg-brand-600 rounded animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-0.5 h-3 bg-brand-600 rounded animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                        Speaking
                      </span>
                    )}
                  </div>
                )}

                {!tts.supported && (
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <VolumeX className="w-4 h-4 text-gray-400" />
                    <span className="text-xs text-gray-400">Audio not supported in this browser</span>
                  </div>
                )}

                {/* Source documents panel */}
                {result.citation_map && Object.keys(result.citation_map).length > 0 && (() => {
                  // Deduplicate sources by name, keep highest score
                  const seen = new Map<string, number>()
                  Object.values(result.citation_map).forEach(({ source, score }) => {
                    if (!source) return  // guard against undefined source
                    // Strip type prefix (image:, video:, etc.)
                    // Also strip UUID+hash upload prefix: {uuid}_{16hexchars}.ext → [EXT document]
                    const name = source
                      .replace(/^(image|video|audio|youtube):/, '')
                      .replace(/^[0-9a-f-]{36}_[0-9a-f]{16}\.(\w+)$/, (_, ext) =>
                        `[${ext.toUpperCase()} document]`
                      )
                    const prev = seen.get(name) ?? 0
                    if (score > prev) seen.set(name, score)
                  })
                  const sources = Array.from(seen.entries()).sort((a, b) => b[1] - a[1])
                  return (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Sources retrieved
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {sources.map(([name, score]) => {
                          const isWeb = name.startsWith('http')
                          const isPpt = name.toLowerCase().endsWith('.pptx') || name.toLowerCase().endsWith('.ppt')
                          const isPdf = name.toLowerCase().endsWith('.pdf')
                          const isDocx = name.toLowerCase().endsWith('.docx') || name.toLowerCase().endsWith('.doc')
                          const isYT = name.startsWith('https://www.youtube') || name.startsWith('https://youtu')
                          const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name)
                          const icon = isYT ? '▶' : isWeb ? '🌐' : isPpt ? '📊' : isPdf ? '📄' : isDocx ? '📝' : isImg ? '🖼' : '📁'
                          const pct = Math.round(score * 100)
                          const colorClass = pct >= 70 ? 'bg-green-50 border-green-200 text-green-800'
                            : pct >= 40 ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                            : 'bg-gray-50 border-gray-200 text-gray-600'
                          return (
                            <div key={name} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${colorClass}`}>
                              <span>{icon}</span>
                              <span className="max-w-[200px] truncate" title={name}>{name}</span>
                              <span className="opacity-60">·</span>
                              <span>{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* RAG suggested follow-up prompts */}
              {(result.suggested_followups ?? []).length > 0 && (
                <div className="card p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                    <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">Suggested prompts</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.suggested_followups.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => { setQuery(q); setResult(null) }}
                        className="px-3 py-1.5 rounded-full border border-brand-200 bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 hover:border-brand-400 transition-colors text-left"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-ups */}
              {(result.follow_up_questions ?? []).length > 0 && (
                <div className="card p-4">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Follow-up questions</p>
                  <ul className="space-y-1">
                    {result.follow_up_questions.map((q, i) => (
                      <li key={i}>
                        <button
                          onClick={() => { setQuery(q); setResult(null) }}
                          className="text-sm text-brand-600 hover:underline text-left"
                        >
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sources */}
              {(result.sources ?? []).length > 0 && (
                <div className="card overflow-hidden">
                  <button
                    onClick={() => setShowSources(!showSources)}
                    className="flex items-center justify-between w-full px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Sources ({result.sources.length})
                    </span>
                    {showSources ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showSources && (
                    <div className="border-t border-gray-100 divide-y divide-gray-100">
                      {result.sources.map((src, i) => (
                        <div key={i} className="px-5 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-500">
                              {String(src.metadata.source ?? `Chunk ${i + 1}`)}
                            </span>
                            <span className="text-xs text-gray-400">score {src.score.toFixed(3)}</span>
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-3">{src.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Telemetry + Memory — full width, below the form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Query Telemetry */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-900">Query Telemetry</h3>
            </div>

            {!result ? (
              <p className="text-xs text-gray-500">Ask a question to see telemetry</p>
            ) : (
              <div className="space-y-3">
                <div className="p-2 bg-gray-50 rounded">
                  <p className="text-xs text-gray-500">Latency</p>
                  <p className="text-sm font-semibold text-gray-900">{result.latency_ms ?? 0}ms</p>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <p className="text-xs text-gray-500">Quality Score</p>
                  <p className="text-sm font-semibold text-gray-900">{((result.quality_score ?? 0.5) * 100).toFixed(1)}%</p>
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <p className="text-xs text-gray-500">Pattern Used</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(result.patterns_used && result.patterns_used.length > 0
                      ? result.patterns_used
                      : ['auto']
                    ).map((p, i) => (
                      <span key={p} className="text-sm font-semibold text-gray-900 capitalize">
                        {i > 0 && <span className="text-gray-400 mx-0.5 font-normal">→</span>}
                        {p.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {result.verified_knowledge_hit && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">cached</span>
                    )}
                    {result.retrieval_channel && result.retrieval_channel !== 'vector' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">via {result.retrieval_channel}</span>
                    )}
                  </div>
                </div>
                {(result.sources ?? []).length > 0 && (
                  <div className="p-2 bg-gray-50 rounded">
                    <p className="text-xs text-gray-500">Sources Retrieved</p>
                    <p className="text-sm font-semibold text-gray-900">{result.sources.length} chunks</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Memory Browser */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-gray-900">Memory Browser</h3>
            </div>

            {history.length === 0 ? (
              <p className="text-xs text-gray-500">View history after queries</p>
            ) : (
              <>
                {/* Tabs */}
                <div className="flex gap-1 mb-3 border-b border-gray-200">
                  <button
                    onClick={() => setMemoryTab('history')}
                    className={`text-xs font-medium pb-2 px-2 border-b-2 transition-colors ${
                      memoryTab === 'history'
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    History
                  </button>
                  <button
                    onClick={() => setMemoryTab('patterns')}
                    className={`text-xs font-medium pb-2 px-2 border-b-2 transition-colors ${
                      memoryTab === 'patterns'
                        ? 'border-brand-600 text-brand-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Patterns
                  </button>
                </div>

                {/* History Tab */}
                {memoryTab === 'history' && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {history.map((h, i) => (
                      <div key={i} className="p-2 bg-gray-50 rounded text-xs hover:bg-gray-100 cursor-pointer transition-colors">
                        <p className="font-medium text-gray-900 line-clamp-2">{h.query}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-gray-500">{h.latency}ms</span>
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded text-white text-xs font-medium',
                            h.quality >= 0.8 ? 'bg-green-600' :
                            h.quality >= 0.6 ? 'bg-yellow-600' : 'bg-red-600'
                          )}>
                            {(h.quality * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Patterns Tab */}
                {memoryTab === 'patterns' && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {patternStats.length === 0 ? (
                      <p className="text-xs text-gray-500">No patterns yet</p>
                    ) : (
                      patternStats.map((p, i) => (
                        <div key={i} className="p-2 bg-gray-50 rounded">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-gray-900 capitalize">{p.pattern.replace(/_/g, ' ')}</p>
                            <span className="text-xs text-gray-500">{p.usageCount}x</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-600 transition-all"
                              style={{ width: `${p.avgQuality * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{(p.avgQuality * 100).toFixed(0)}% avg quality</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
