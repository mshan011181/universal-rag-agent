'use client'

import { useState, useEffect, useRef } from 'react'
import AppShell from '@/components/layout/AppShell'
import { submitQuery, getIngestHistory } from '@/lib/api'
import type { QueryResponse, IngestedItem } from '@/types'
import {
  Send, FileSpreadsheet, BarChart3, AlertCircle,
  ChevronDown, ChevronUp, Table2, TrendingUp, Loader2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'

// ── Suggested BI prompts ──────────────────────────────────────────────────────
const SUGGESTIONS = [
  'What is the total revenue across all rows in the excel file?',
  'Show total sales by region from the spreadsheet',
  'What is the average profit margin from the excel file?',
  'Compare revenue between the two excel files',
  'Show top 5 products by sales from the spreadsheet',
  'What is the month over month growth in the excel file?',
  'Group by category and sum sales from the excel file',
  'Show total cost per department from the spreadsheet',
]

interface BIResult {
  query: string
  answer: string
  latency: number
  quality: number
  channel: string
}

function QualityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color =
    score >= 0.8 ? 'bg-green-100 text-green-800' :
    score >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
    score >= 0.3 ? 'bg-orange-100 text-orange-800' :
                   'bg-red-100 text-red-800'
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', color)}>
      {score < 0.3 && <AlertCircle className="w-3 h-3 mr-1" />}
      {score >= 0.3 ? `Quality ${pct}%` : 'Low confidence'}
    </span>
  )
}

export default function BIPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BIResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [excelFiles, setExcelFiles] = useState<IngestedItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Load user's ingested Excel/CSV files for display
  useEffect(() => {
    getIngestHistory()
      .then(hist => {
        const docs: IngestedItem[] = Object.values(hist.by_type).flat()
        const sheets = docs.filter(d =>
          /\.(xlsx|xls|csv)$/i.test(d.name)
        )
        setExcelFiles(sheets)
      })
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setResult(null)
    setShowSuggestions(false)

    try {
      const resp: QueryResponse = await submitQuery({
        query: q,
        namespace: 'default',
        pattern: 'auto',
      })
      setResult({
        query: q,
        answer: resp.answer,
        latency: resp.latency_ms,
        quality: resp.quality_score,
        channel: resp.retrieval_channel || 'bi_computation',
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  function useSuggestion(s: string) {
    setQuery(s)
    textareaRef.current?.focus()
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Business Intelligence</h1>
            <p className="text-sm text-gray-500">
              Ask analytical questions across your Excel &amp; CSV files
            </p>
          </div>
        </div>

        {/* Indexed spreadsheets */}
        {excelFiles.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-800">
                Indexed Spreadsheets ({excelFiles.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {excelFiles.map(f => (
                <span
                  key={f.ingest_id}
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border
                             border-emerald-200 rounded-full text-xs text-emerald-700 font-medium"
                >
                  <Table2 className="w-3 h-3" />
                  {f.name}
                  <span className="text-emerald-400">· {f.chunks} chunks</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {excelFiles.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">No spreadsheets indexed yet</p>
              <p className="text-xs text-amber-600 mt-1">
                Go to <strong>Ingest</strong> and upload your Excel (.xlsx, .xls) or CSV files first.
              </p>
            </div>
          </div>
        )}

        {/* Query form */}
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            Ask a business question
          </label>
          <textarea
            ref={textareaRef}
            rows={3}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) }
            }}
            placeholder="e.g. What is the total revenue by region from the excel file?"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm
                       resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowSuggestions(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Sample questions
              {showSuggestions ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700
                         disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm
                         font-medium rounded-lg transition-colors"
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                : <><Send className="w-4 h-4" /> Analyze</>}
            </button>
          </div>

          {/* Suggestions */}
          {showSuggestions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => useSuggestion(s)}
                  className="text-left text-xs px-3 py-2 bg-gray-50 hover:bg-emerald-50
                             border border-gray-200 hover:border-emerald-300 rounded-lg
                             text-gray-600 hover:text-emerald-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Result header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                <span className="font-medium text-gray-700">BI Analysis</span>
                <span>·</span>
                <span>{result.latency}ms</span>
                <span>·</span>
                <span className="capitalize">{result.channel.replace('_', ' ')}</span>
              </div>
              <QualityBadge score={result.quality} />
            </div>

            {/* Query echo */}
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Question</p>
              <p className="text-sm text-gray-800">{result.query}</p>
            </div>

            {/* Answer */}
            <div className="px-5 py-4">
              <div className="prose prose-sm max-w-none
                              prose-table:w-full prose-table:border-collapse
                              prose-th:bg-emerald-50 prose-th:border prose-th:border-gray-200
                              prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs
                              prose-th:font-semibold prose-th:text-gray-700
                              prose-td:border prose-td:border-gray-200 prose-td:px-3 prose-td:py-2
                              prose-td:text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {result.answer}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
