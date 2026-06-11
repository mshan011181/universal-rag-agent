'use client'

import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import { fetchUserQueries } from '@/lib/api'
import type { UserQueryItem } from '@/lib/api'
import { Search, ChevronDown, ChevronUp, Clock, MessageSquare, X, Copy, Download, Check } from 'lucide-react'
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

  function handleCopy() {
    navigator.clipboard.writeText(itemToText(item))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const filename = `query_${item.id}_${item.timestamp.slice(0, 10)}.txt`
    downloadText(itemToText(item), filename)
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
      </div>
    </AppShell>
  )
}
