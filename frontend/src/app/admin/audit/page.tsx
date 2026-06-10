'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, Search, RefreshCw, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { getAuditLogs, getAuditSummary, type AuditEntry } from '@/lib/api'

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  query:           { label: 'Query',          color: 'bg-blue-100 text-blue-700' },
  ingest:          { label: 'Ingest',         color: 'bg-purple-100 text-purple-700' },
  login:           { label: 'Login',          color: 'bg-green-100 text-green-700' },
  login_failed:    { label: 'Login Failed',   color: 'bg-red-100 text-red-700' },
  register:        { label: 'Register',       color: 'bg-teal-100 text-teal-700' },
  password_reset:  { label: 'Pwd Reset',      color: 'bg-amber-100 text-amber-700' },
  invite_sent:     { label: 'Invite Sent',    color: 'bg-indigo-100 text-indigo-700' },
  member_removed:  { label: 'Member Removed', color: 'bg-orange-100 text-orange-700' },
}

function EventBadge({ type, status }: { type: string; status: string }) {
  const meta = EVENT_LABELS[type] || { label: type, color: 'bg-gray-100 text-gray-600' }
  const isFailure = status === 'failure'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isFailure ? 'bg-red-100 text-red-700' : meta.color}`}>
      {isFailure ? `${meta.label} ✗` : meta.label}
    </span>
  )
}

function DetailCell({ detail }: { detail: string | null }) {
  if (!detail) return <span className="text-gray-400">—</span>
  try {
    const obj = JSON.parse(detail)
    // Show most useful fields based on event type
    const parts: string[] = []
    if (obj.query)          parts.push(`"${String(obj.query).slice(0, 60)}${obj.query.length > 60 ? '…' : ''}"`)
    if (obj.source_name)    parts.push(obj.source_name)
    if (obj.invited_email)  parts.push(`→ ${obj.invited_email}`)
    if (obj.removed_email)  parts.push(`removed ${obj.removed_email}`)
    if (obj.method)         parts.push(`via ${obj.method}`)
    if (obj.patterns)       parts.push(Array.isArray(obj.patterns) ? obj.patterns.join('+') : obj.patterns)
    if (obj.quality_score !== undefined) parts.push(`q=${obj.quality_score}`)
    if (obj.chunks !== undefined) parts.push(`${obj.chunks} chunks`)
    if (obj.reason)         parts.push(obj.reason)
    if (obj.error)          parts.push(`Error: ${obj.error}`)
    return <span className="text-gray-700 text-xs">{parts.join(' · ') || detail}</span>
  } catch {
    return <span className="text-gray-700 text-xs">{detail.slice(0, 80)}</span>
  }
}

const PAGE_SIZE = 50

export default function AuditLogPage() {
  const [logs, setLogs]         = useState<AuditEntry[]>([])
  const [summary, setSummary]   = useState<{ event_type: string; total: number; failures: number }[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [filter, setFilter]     = useState('')
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const load = useCallback(async (p = page, et = filter) => {
    setLoading(true); setError('')
    try {
      const [logsRes, summaryRes] = await Promise.all([
        getAuditLogs({ event_type: et || undefined, limit: PAGE_SIZE, offset: p * PAGE_SIZE }),
        p === 0 ? getAuditSummary() : Promise.resolve(null),
      ])
      setLogs(logsRes.logs)
      setTotal(logsRes.count)
      if (summaryRes) setSummary(summaryRes)
    } catch {
      setError('Failed to load audit log.')
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => { load(page, filter) }, [page, filter])

  function handleFilterChange(et: string) {
    setFilter(et); setPage(0)
  }

  const displayed = search
    ? logs.filter(l =>
        (l.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.event_type || '').includes(search.toLowerCase()) ||
        (l.ip_address || '').includes(search) ||
        (l.detail || '').toLowerCase().includes(search.toLowerCase()))
    : logs

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-600" /> Audit Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">All activity in your organisation — who did what, when.</p>
        </div>
        <button onClick={() => load(page, filter)} disabled={loading}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Summary chips */}
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => handleFilterChange('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              !filter ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
            }`}>
            All events
          </button>
          {summary.map(s => {
            const meta = EVENT_LABELS[s.event_type] || { label: s.event_type, color: '' }
            return (
              <button key={s.event_type} onClick={() => handleFilterChange(s.event_type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  filter === s.event_type ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                }`}>
                {meta.label} <span className="opacity-60 ml-1">{s.total}</span>
                {s.failures > 0 && <span className="ml-1 text-red-400">({s.failures} failed)</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" className="input pl-9 text-sm" placeholder="Search email, IP, detail…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Event</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : displayed.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-gray-400">No audit entries found.</td></tr>
              ) : displayed.map(entry => (
                <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${entry.status === 'failure' ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <EventBadge type={entry.event_type} status={entry.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 max-w-[160px] truncate">
                    {entry.email || entry.user_id || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <DetailCell detail={entry.detail} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                    {entry.ip_address || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total === PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-xs text-gray-500">Page {page + 1}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-white">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => p + 1)} disabled={logs.length < PAGE_SIZE}
                className="p-1.5 rounded border border-gray-300 disabled:opacity-40 hover:bg-white">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
