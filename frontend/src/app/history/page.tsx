'use client'

import { useState, useEffect, useCallback } from 'react'
import AppShell from '@/components/layout/AppShell'
import { fetchUserQueries } from '@/lib/api'
import type { UserQueryItem } from '@/lib/api'
import { Search, ChevronDown, ChevronUp, Clock, MessageSquare, X } from 'lucide-react'
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

export default function HistoryPage() {
  const [queries, setQueries] = useState<UserQueryItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)

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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Query History</h1>
          <p className="text-sm text-gray-500 mt-1">All questions you have asked across all sessions</p>
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
              <div key={item.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-brand-300 transition-colors">
                {/* Question row */}
                <button
                  className="w-full flex items-start gap-3 px-4 py-3 text-left"
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                >
                  <MessageSquare className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.query}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-400">{formatDate(item.timestamp)}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">Session: {item.session_id}</span>
                    </div>
                  </div>
                  {expanded === item.id
                    ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />}
                </button>

                {/* Expanded answer */}
                {expanded === item.id && item.answer && (
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
