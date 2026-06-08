'use client'

import { useState, useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { submitQuery, fetchUserStats, getIngestHistory } from '@/lib/api'
import type { QueryResponse, IngestedItem } from '@/types'
import { Send, ChevronDown, ChevronUp, Zap, BookOpen, AlertCircle, Gauge, BarChart3, Info, ChevronRight, MessageSquare, FileText, Volume2, VolumeX, Pause, Play, Square, Filter, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { MODELS_BY_ENVIRONMENT, PATTERNS_INFO } from '@/lib/models'
import { useTextToSpeech } from '@/hooks/useTextToSpeech'

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 1.75, 2]

// All supported answer languages grouped by region
const LANGUAGE_OPTIONS = [
  { group: 'English Variants', options: [
    'American English', 'British English', 'Australian English',
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
  const [userStats, setUserStats] = useState<{
    total_queries: number; total_documents: number; avg_quality_score: number;
    storage_used_bytes: number; storage_quota_bytes: number;
  } | null>(null)

  useEffect(() => {
    fetchUserStats().then(setUserStats).catch(() => {})
  }, [])

  const [query, setQuery] = useState('')
  const [pattern, setPattern] = useState('auto')
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSources, setShowSources] = useState(false)
  const [history, setHistory] = useState<QueryHistory[]>([])
  const [memoryTab, setMemoryTab] = useState<'history' | 'patterns'>('history')
  const [showModelsInfo, setShowModelsInfo] = useState(false)
  const [expandedEnv, setExpandedEnv] = useState<string | null>(null)
  const tts = useTextToSpeech()

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
    setResult(null)
    setShowSources(false)
    setLoading(true)
    tts.stop()
    try {
      const res = await submitQuery({
        query: query.trim(),
        pattern: pattern === 'auto' ? undefined : pattern,
        language,
        source_filters: selectedSources.length > 0 ? selectedSources : undefined,
      })
      setResult(res)
      // Refresh personal stats after query
      fetchUserStats().then(setUserStats).catch(() => {})
      // Add to history
      setHistory([
        {
          query: query.trim(),
          answer: res.answer,
          pattern: (res.patterns_used && res.patterns_used.length > 0) ? res.patterns_used.join(' → ') : (res.pattern_used || 'auto'),
          latency: res.latency_ms || 0,
          quality: res.quality_score ?? 0.5,
        },
        ...history.slice(0, 9), // Keep last 10 queries
      ])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Query failed')
    } finally {
      setLoading(false)
    }
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

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {/* Main content — 3 columns */}
        <div className="lg:col-span-3">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Query</h1>
            <p className="text-sm text-gray-500 mt-1">
              Ask anything across your indexed documents. The system auto-selects the optimal RAG pattern.
            </p>
          </div>

          {/* Personal usage stats bar */}
          {userStats && (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4 text-brand-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">My Queries</p>
                  <p className="text-xl font-bold text-gray-900">{userStats.total_queries}</p>
                </div>
              </div>
              <div className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-brand-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Docs Indexed</p>
                  <p className="text-xl font-bold text-gray-900">{userStats.total_documents}</p>
                </div>
              </div>
              <div className="card p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <Zap className="w-4 h-4 text-brand-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg Quality</p>
                  <p className="text-xl font-bold text-gray-900">
                    {(userStats.avg_quality_score * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Query form */}
          <div className="card p-5 mb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Question</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  placeholder="What would you like to know?"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
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
                          <div className="space-y-1">
                            {files.map(f => (
                              <label key={f.name} className="flex items-center gap-2.5 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={selectedSources.includes(f.name)}
                                  onChange={() => toggleSource(f.name)}
                                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                />
                                <span className="text-sm text-gray-700 group-hover:text-brand-700 truncate max-w-xs" title={f.name}>
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

              <button type="submit" disabled={loading || !query.trim()} className="btn-primary flex items-center gap-2">
                <Send className="w-4 h-4" />
                {loading ? 'Thinking…' : 'Submit'}
              </button>
            </form>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
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
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.answer}
                  </ReactMarkdown>
                </div>

                {/* TTS player */}
                {tts.supported && (
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                    <Volume2 className="w-4 h-4 text-gray-400 shrink-0" />

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

        {/* Right sidebar — 1 column */}
        <div className="lg:col-span-1 space-y-4">
          {/* Query Telemetry */}
          <div className="card p-4 sticky top-4">
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
          <div className="card p-4 sticky top-52">
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

          {/* Models Info */}
          <div className="card p-4 sticky top-96">
            <button
              onClick={() => setShowModelsInfo(!showModelsInfo)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-semibold text-gray-900">Models & Patterns</h3>
              </div>
              {showModelsInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showModelsInfo && (
              <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                {/* Environments */}
                <div className="space-y-2 border-b border-gray-200 pb-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">LLM Models by Environment</p>
                  {Object.entries(MODELS_BY_ENVIRONMENT).map(([env, roles]) => {
                    const synthesizer = roles.synthesizer
                    return (
                      <div key={env} className="bg-gray-50 rounded p-2 text-xs">
                        <div
                          onClick={() => setExpandedEnv(expandedEnv === env ? null : env)}
                          className="cursor-pointer flex items-center justify-between"
                        >
                          <div className="font-medium text-gray-900 capitalize">{env}</div>
                          <ChevronRight
                            className={clsx('w-3 h-3 transition-transform', expandedEnv === env && 'rotate-90')}
                          />
                        </div>
                        {expandedEnv === env && (
                          <div className="mt-2 space-y-1 pt-2 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Model:</span>
                              <span className="text-gray-900 font-medium">{synthesizer.name}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Provider:</span>
                              <span className="text-gray-900">{synthesizer.provider}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-gray-600">Context:</span>
                              <span className="text-gray-900">{synthesizer.contextWindow.toLocaleString()} tokens</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Patterns */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">RAG Patterns</p>
                  {Object.entries(PATTERNS_INFO).map(([key, info]) => (
                    <div key={key} className="bg-gray-50 rounded p-2 text-xs">
                      <div className="font-medium text-gray-900">{info.name}</div>
                      <p className="text-gray-600 text-xs mt-0.5">{info.description}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-gray-500">{info.useCase}</span>
                        <span
                          className={clsx(
                            'px-1.5 py-0.5 rounded text-white text-xs font-medium',
                            info.complexity === 'simple' ? 'bg-green-600' :
                            info.complexity === 'medium' ? 'bg-yellow-600' : 'bg-red-600'
                          )}
                        >
                          {info.complexity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
