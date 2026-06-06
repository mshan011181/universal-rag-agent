'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { submitQuery } from '@/lib/api'
import type { QueryResponse } from '@/types'
import { Send, ChevronDown, ChevronUp, Zap, BookOpen, AlertCircle, Clock, Gauge, BarChart3 } from 'lucide-react'
import clsx from 'clsx'

const PATTERNS = [
  'auto', 'naive_rag', 'hyde', 'query_rewriting', 'crag',
  'self_rag', 'adaptive_rag', 'flare', 'speculative_rag',
  'modular_rag', 'agentic_rag', 'graph_rag', 'conversational_rag', 'rag_fusion',
]

function QualityBadge({ score }: { score: number }) {
  const color = score >= 0.8 ? 'bg-green-100 text-green-800'
              : score >= 0.6 ? 'bg-yellow-100 text-yellow-800'
              : 'bg-red-100 text-red-800'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', color)}>
      Quality {(score * 100).toFixed(0)}%
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
  const [namespace, setNamespace] = useState('default')
  const [result, setResult] = useState<QueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSources, setShowSources] = useState(false)
  const [history, setHistory] = useState<QueryHistory[]>([])
  const [memoryTab, setMemoryTab] = useState<'history' | 'patterns'>('history')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setError('')
    setResult(null)
    setShowSources(false)
    setLoading(true)
    try {
      const res = await submitQuery({
        query: query.trim(),
        pattern: pattern === 'auto' ? undefined : pattern,
        namespace,
      })
      setResult(res)
      // Add to history
      setHistory([
        {
          query: query.trim(),
          answer: res.answer,
          pattern: res.pattern_used || 'auto',
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
                  <label className="label">Namespace (tenant)</label>
                  <input
                    className="input"
                    type="text"
                    value={namespace}
                    onChange={(e) => setNamespace(e.target.value)}
                    placeholder="default"
                  />
                </div>
              </div>

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

          {/* Result */}
          {result && (
            <div className="space-y-4">
              {/* Answer */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-brand-600" />
                    <span className="text-sm font-medium text-gray-700">
                      Pattern: <span className="text-brand-600">{(result.pattern_used || 'auto').replace(/_/g, ' ')}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <QualityBadge score={result.quality_score ?? 0.5} />
                    <span className="text-xs text-gray-400">{result.latency_ms ?? 0}ms</span>
                  </div>
                </div>
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">{result.answer}</p>
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
                  <p className="text-sm font-semibold text-gray-900 capitalize">{(result.pattern_used || 'auto').replace(/_/g, ' ')}</p>
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
        </div>
      </div>
    </AppShell>
  )
}
