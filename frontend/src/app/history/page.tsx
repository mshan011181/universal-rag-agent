'use client'

import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import { fetchUserQueries, fetchArchiveStats, archiveQueries, unarchiveQueries, emailQuery } from '@/lib/api'
import type { UserQueryItem } from '@/lib/api'
import { Search, ChevronDown, ChevronUp, Clock, MessageSquare, X, Copy, Download, Check, Archive, RotateCcw, AlertTriangle, Mail } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const PAGE_SIZE = 20

function formatDate(ts: string) {
  const d = new Date(ts)
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function itemToText(item: UserQueryItem): string {
  return `Q: ${item.query}\nDate: ${formatDate(item.timestamp)}\n\nA: ${item.answer}\n`
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function HistoryItem({ item }: { item: UserQueryItem }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  function handleCopy() {
    navigator.clipboard.writeText(itemToText(item))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const filename = `query_${item.id}_${item.timestamp.slice(0, 10)}.txt`
    downloadText(itemToText(item), filename)
  }

  async function handleEmail() {
    setEmailStatus('sending')
    try {
      await emailQuery(item.id)
      setEmailStatus('sent')
      setTimeout(() => setEmailStatus('idle'), 3000)
    } catch {
      setEmailStatus('error')
      setTimeout(() => setEmailStatus('idle'), 3000)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-brand-300 transition-colors">
      {/* Question row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <MessageSquare className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <button
            className="w-full text-left"
            onClick={() => setExpanded(e => !e)}
          >
            <p className="text-sm font-medium text-gray-900">{item.query}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <Clock className="w-3 h-3 text-gray-400" />
              <span className="text-xs text-gray-400">{formatDate(item.timestamp)}</span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400">Session: {item.session_id}</span>
            </div>
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            title="Copy question & answer"
            className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            title="Download as text file"
            className="flex items-center gap-1 px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Save
          </button>
          <button
            onClick={handleEmail}
            disabled={emailStatus === 'sending'}
            title="Send to my email"
            className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors
              ${emailStatus === 'sent'  ? 'border-green-400 text-green-600 bg-green-50' :
                emailStatus === 'error' ? 'border-red-400 text-red-600 bg-red-50' :
                'border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600'}
              disabled:opacity-60`}
          >
            {emailStatus === 'sent'    ? <><Check className="w-3.5 h-3.5" /> Sent!</> :
             emailStatus === 'error'   ? <><Mail className="w-3.5 h-3.5" /> Failed</> :
             emailStatus === 'sending' ? <><Mail className="w-3.5 h-3.5" /> Sending…</> :
                                         <><Mail className="w-3.5 h-3.5" /> Email</>}
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1 rounded text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded answer */}
      {expanded && item.answer && (
        <div className="px-4 pb-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-2">Answer</p>
          <div className="prose prose-sm max-w-none text-gray-700
            prose-headings:text-gray-900 prose-headings:font-semibold
            prose-strong:text-gray-900
            prose-ul:text-gray-700 prose-ol:text-gray-700
            prose-li:my-0.5
            prose-code:bg-gray-100 prose-code:text-brand-700 prose-code:px-1 prose-code:rounded prose-code:text-xs
            prose-table:w-full prose-table:text-sm
            prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:border prose-th:border-gray-200
            prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-gray-200
            prose-tr:even:bg-gray-50
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.answer}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}

export default function HistoryPage() {
  const [queries, setQueries] = useState<UserQueryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [archiveDays, setArchiveDays] = useState(30)
  const [archiveStats, setArchiveStats] = useState<{ eligible: number; already_archived: number } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveMsg, setArchiveMsg] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archivedQueries, setArchivedQueries] = useState<UserQueryItem[]>([])
  const [archivedTotal, setArchivedTotal] = useState(0)

  const load = useCallback(async (pg: number, q: string) => {
    setLoading(true)
    try {
      const data = await fetchUserQueries({ limit: PAGE_SIZE, offset: pg * PAGE_SIZE, search: q })
      setQueries(data.queries)
      setTotal(data.total)
    } catch {
      setQueries([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(page, search) }, [page, search, load])

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    setSearch(searchInput)
  }

  function clearSearch() {
    setSearchInput('')
    setPage(0)
    setSearch('')
  }

  async function downloadAll() {
    setDownloading(true)
    try {
      // Fetch all records (up to 500)
      const data = await fetchUserQueries({ limit: 500, offset: 0, search })
      const lines = data.queries.map((item, i) =>
        `--- Query ${i + 1} ---\n${itemToText(item)}`
      ).join('\n')
      const header = `Query History Export\nGenerated: ${new Date().toLocaleString()}\nTotal: ${data.total} queries\n${'='.repeat(50)}\n\n`
      const date = new Date().toISOString().slice(0, 10)
      downloadText(header + lines, `query_history_${date}.txt`)
    } finally {
      setDownloading(false)
    }
  }

  function copyAll() {
    const lines = queries.map((item, i) =>
      `--- Query ${i + 1} ---\n${itemToText(item)}`
    ).join('\n')
    navigator.clipboard.writeText(lines)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  async function previewArchive(days: number) {
    try {
      const stats = await fetchArchiveStats(days)
      setArchiveStats(stats)
      setArchiveMsg('')
    } catch { /* ignore */ }
  }

  async function handleArchive() {
    setArchiving(true)
    setArchiveMsg('')
    try {
      const res = await archiveQueries(archiveDays)
      setArchiveMsg(`Archived ${res.archived} quer${res.archived === 1 ? 'y' : 'ies'} older than ${archiveDays} days.`)
      setArchiveStats(null)
      load(page, search)  // refresh active list
    } finally {
      setArchiving(false)
    }
  }

  async function handleUnarchive() {
    setArchiving(true)
    setArchiveMsg('')
    try {
      const res = await unarchiveQueries()
      setArchiveMsg(`Restored ${res.restored} archived quer${res.restored === 1 ? 'y' : 'ies'}.`)
      setArchiveStats(null)
      setArchivedQueries([])
      setArchivedTotal(0)
      setShowArchived(false)
      load(page, search)
    } finally {
      setArchiving(false)
    }
  }

  async function loadArchived() {
    try {
      const data = await fetchUserQueries({ limit: 500, archived: true })
      setArchivedQueries(data.queries)
      setArchivedTotal(data.total)
    } catch { /* ignore */ }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Query History</h1>
            <p className="text-sm text-gray-500 mt-1">All questions you have asked across all sessions</p>
          </div>
          {/* Bulk actions */}
          {total > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={copyAll}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors text-sm"
              >
                <Copy className="w-4 h-4" />
                Copy page
              </button>
              <button
                onClick={downloadAll}
                disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors text-sm disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                {downloading ? 'Downloading…' : `Download all (${total})`}
              </button>
            </div>
          )}
        </div>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="input pl-9 pr-8"
              placeholder="Search questions or answers..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button type="submit" className="btn-primary px-4 py-2 text-sm">Search</button>
        </form>

        {/* Stats row */}
        <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
          <MessageSquare className="w-4 h-4" />
          <span>{total.toLocaleString()} {search ? 'matching' : 'total'} {total === 1 ? 'query' : 'queries'}</span>
          {search && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs font-medium">
              Filtered: &quot;{search}&quot;
            </span>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : queries.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{search ? 'No results found' : 'No queries yet'}</p>
            <p className="text-sm mt-1">{search ? 'Try a different search term' : 'Ask a question in the Query page to get started'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queries.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages} &nbsp;·&nbsp; {total} total
            </span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
        {/* ── Archive Section ──────────────────────────── */}
        <div className="mt-10 border-t border-gray-200 pt-8">
          <div className="flex items-center gap-2 mb-4">
            <Archive className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-800">Archive</h2>
            <span className="text-xs text-gray-400 ml-1">Move old queries out of your active history</span>
          </div>

          {/* Archive controls */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4">
            {/* Default auto-archive notice */}
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Default: queries older than <strong>30 days</strong> can be archived to keep your history clean.</span>
            </div>

            {/* Days selector + preview */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Archive queries older than</label>
              <select
                className="input w-32 text-sm"
                value={archiveDays}
                onChange={(e) => { setArchiveDays(Number(e.target.value)); setArchiveStats(null); setArchiveMsg('') }}
              >
                {[7, 14, 30, 60, 90, 180, 365].map(d => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
              <button
                onClick={() => previewArchive(archiveDays)}
                className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-white transition-colors"
              >
                Preview
              </button>
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-60"
              >
                <Archive className="w-4 h-4" />
                {archiving ? 'Archiving…' : 'Archive now'}
              </button>
            </div>

            {/* Preview result */}
            {archiveStats && (
              <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-4 py-2">
                <span className="font-medium text-orange-600">{archiveStats.eligible}</span> quer{archiveStats.eligible === 1 ? 'y' : 'ies'} will be archived &nbsp;·&nbsp;
                <span className="font-medium">{archiveStats.already_archived}</span> already archived
              </div>
            )}

            {/* Feedback message */}
            {archiveMsg && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                {archiveMsg}
              </div>
            )}
          </div>

          {/* View / Restore archived */}
          <div className="mt-4">
            <button
              onClick={() => {
                if (!showArchived) loadArchived()
                setShowArchived(v => !v)
              }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              {showArchived ? 'Hide archived queries' : 'View archived queries'}
              {archivedTotal > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium">{archivedTotal}</span>
              )}
            </button>

            {showArchived && (
              <div className="mt-3 space-y-2">
                {archivedQueries.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No archived queries yet.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">{archivedTotal} archived</span>
                      <button
                        onClick={handleUnarchive}
                        disabled={archiving}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-600 hover:bg-white transition-colors disabled:opacity-60"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Restore all
                      </button>
                    </div>
                    {archivedQueries.map(item => (
                      <div key={item.id} className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3">
                        <p className="text-sm text-gray-500 truncate">{item.query}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                          <Clock className="w-3 h-3" />
                          <span>{formatDate(item.timestamp)}</span>
                          {item.archived_at && <span>· Archived {formatDate(item.archived_at)}</span>}
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </AppShell>
  )
}
