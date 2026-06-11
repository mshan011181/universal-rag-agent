'use client'

import { useState, useEffect, useRef, DragEvent } from 'react'
import AppShell from '@/components/layout/AppShell'
import { submitQuery, getIngestHistory, ingestFile, deleteIngest } from '@/lib/api'
import type { QueryResponse, IngestedItem } from '@/types'
import {
  Send, FileSpreadsheet, BarChart3, AlertCircle,
  ChevronDown, ChevronUp, Table2, TrendingUp, Loader2,
  Upload, CheckCircle, Trash2, X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'

// ── Constants ─────────────────────────────────────────────────────────────────
const ACCEPTED = '.xlsx,.xls,.csv'
const ACCEPTED_RE = /\.(xlsx|xls|csv)$/i

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

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(b: number) {
  if (!b) return '0 B'
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function BIPage() {
  // ── Upload state ───────────────────────────────────────────────────────────
  const [file, setFile]             = useState<File | null>(null)
  const [dragging, setDragging]     = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [uploadMsg, setUploadMsg]   = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileInputRef                = useRef<HTMLInputElement>(null)

  // ── Indexed files state ────────────────────────────────────────────────────
  const [excelFiles, setExcelFiles] = useState<IngestedItem[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ── Query state ────────────────────────────────────────────────────────────
  const [query, setQuery]             = useState('')
  const [querying, setQuerying]       = useState(false)
  const [result, setResult]           = useState<BIResult | null>(null)
  const [queryError, setQueryError]   = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const textareaRef                   = useRef<HTMLTextAreaElement>(null)

  // ── Load / refresh spreadsheet list ───────────────────────────────────────
  const loadFiles = async (silent = false) => {
    try {
      const hist = await getIngestHistory()
      const all = (Object.values(hist.by_type) as IngestedItem[][]).flat()
      setExcelFiles(all.filter(d => ACCEPTED_RE.test(d.name)))
    } catch {
      if (!silent) setUploadMsg({ type: 'error', text: 'Failed to load file list' })
    }
  }

  useEffect(() => {
    loadFiles()
    const id = setInterval(() => loadFiles(true), 5000)
    return () => clearInterval(id)
  }, [])

  // ── Upload handlers ────────────────────────────────────────────────────────
  function pickFile(f: File | null) {
    if (!f) return
    if (!ACCEPTED_RE.test(f.name)) {
      setUploadMsg({ type: 'error', text: 'Only .xlsx, .xls, .csv files are accepted' })
      return
    }
    setFile(f)
    setUploadMsg(null)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false)
    pickFile(e.dataTransfer.files?.[0] ?? null)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setUploadMsg(null)
    try {
      await ingestFile(file)
      setUploadMsg({ type: 'success', text: `${file.name} uploaded — indexing in progress…` })
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      // Refresh list after short delay for backend to process
      setTimeout(() => loadFiles(true), 1500)
      setTimeout(() => loadFiles(true), 4000)
    } catch (err) {
      setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(ingestId: string) {
    setDeletingId(ingestId)
    try {
      await deleteIngest(ingestId)
      await loadFiles(true)
    } catch {
      setUploadMsg({ type: 'error', text: 'Delete failed' })
    } finally {
      setDeletingId(null)
    }
  }

  // ── Query handler ──────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setQuerying(true)
    setQueryError(null)
    setResult(null)
    setShowSuggestions(false)
    try {
      const resp: QueryResponse = await submitQuery({ query: q, namespace: 'default', pattern: 'auto', force_bi: true })
      setResult({
        query: q,
        answer: resp.answer,
        latency: resp.latency_ms,
        quality: resp.quality_score,
        channel: resp.retrieval_channel || 'bi_computation',
      })
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setQuerying(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">BI / Analytics</h1>
            <p className="text-sm text-gray-500">
              Upload &amp; query your Excel and CSV files with natural language
            </p>
          </div>
        </div>

        {/* ── Upload section ─────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">Upload Spreadsheet</span>
            <span className="text-xs text-gray-400 ml-1">(.xlsx · .xls · .csv)</span>
          </div>

          <div className="p-5 space-y-4">
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={clsx(
                'border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors',
                dragging
                  ? 'border-emerald-400 bg-emerald-50'
                  : file
                  ? 'border-emerald-300 bg-emerald-50/40'
                  : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50',
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={e => pickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="ml-2 p-1 rounded-full hover:bg-gray-200 text-gray-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Drag &amp; drop or <span className="text-emerald-600 font-medium">browse</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Supports .xlsx · .xls · .csv</p>
                </>
              )}
            </div>

            {/* Upload button */}
            <div className="flex items-center justify-between">
              {uploadMsg && (
                <div className={clsx(
                  'flex items-center gap-2 text-sm',
                  uploadMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600',
                )}>
                  {uploadMsg.type === 'success'
                    ? <CheckCircle className="w-4 h-4" />
                    : <AlertCircle className="w-4 h-4" />}
                  {uploadMsg.text}
                </div>
              )}
              {!uploadMsg && <span />}
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || uploading}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700
                           disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm
                           font-medium rounded-lg transition-colors"
              >
                {uploading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                  : <><Upload className="w-4 h-4" /> Upload &amp; Index</>}
              </button>
            </div>
          </div>
        </div>

        {/* ── Indexed spreadsheets list ──────────────────────────────────── */}
        {excelFiles.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <Table2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-gray-700">
                Indexed Spreadsheets
              </span>
              <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                {excelFiles.length} file{excelFiles.length !== 1 ? 's' : ''}
              </span>
            </div>
            <ul className="divide-y divide-gray-100">
              {excelFiles.map(f => (
                <li key={f.ingest_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                    <p className="text-xs text-gray-400">
                      {f.chunks} chunks
                      {f.size_bytes ? ` · ${formatBytes(f.size_bytes)}` : ''}
                      {f.created_at ? ` · ${new Date(f.created_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(f.ingest_id)}
                    disabled={deletingId === f.ingest_id}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50
                               rounded-lg transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deletingId === f.ingest_id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2 className="w-4 h-4" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {excelFiles.length === 0 && !file && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">No spreadsheets indexed yet</p>
              <p className="text-xs text-amber-600 mt-1">
                Upload an Excel or CSV file above — once indexed it will appear here and you can start querying.
              </p>
            </div>
          </div>
        )}

        {/* ── Query form ─────────────────────────────────────────────────── */}
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
              disabled={querying || !query.trim() || excelFiles.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700
                         disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm
                         font-medium rounded-lg transition-colors"
              title={excelFiles.length === 0 ? 'Upload a spreadsheet first' : ''}
            >
              {querying
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                : <><Send className="w-4 h-4" /> Analyze</>}
            </button>
          </div>

          {showSuggestions && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setQuery(s); textareaRef.current?.focus() }}
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

        {/* Query error */}
        {queryError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{queryError}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
                <span className="font-medium text-gray-700">BI Analysis</span>
                <span>·</span>
                <span>{result.latency}ms</span>
                <span>·</span>
                <span className="capitalize">{result.channel.replace(/_/g, ' ')}</span>
              </div>
              <QualityBadge score={result.quality} />
            </div>
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Question</p>
              <p className="text-sm text-gray-800">{result.query}</p>
            </div>
            <div className="px-5 py-4">
              <div className="prose prose-sm max-w-none
                              prose-table:w-full prose-table:border-collapse
                              prose-th:bg-emerald-50 prose-th:border prose-th:border-gray-200
                              prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs
                              prose-th:font-semibold prose-th:text-gray-700
                              prose-td:border prose-td:border-gray-200 prose-td:px-3 prose-td:py-2
                              prose-td:text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppShell>
  )
}
