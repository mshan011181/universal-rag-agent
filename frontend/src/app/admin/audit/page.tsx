'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, Search, RefreshCw, ChevronLeft, ChevronRight,
  AlertCircle, Download, Trash2, Settings, UserX, CheckCircle,
} from 'lucide-react'
import {
  getAuditLogs, getAuditSummary, exportAuditLogs,
  getRetentionPolicy, setRetentionPolicy, purgeAuditLogs,
  eraseUserData, listOrgMembers, type AuditEntry,
} from '@/lib/api'
import AppShell from '@/components/layout/AppShell'

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  query:                    { label: 'Query',           color: 'bg-blue-100 text-blue-700' },
  ingest:                   { label: 'Ingest',          color: 'bg-purple-100 text-purple-700' },
  login:                    { label: 'Login',           color: 'bg-green-100 text-green-700' },
  login_failed:             { label: 'Login Failed',    color: 'bg-red-100 text-red-700' },
  register:                 { label: 'Register',        color: 'bg-teal-100 text-teal-700' },
  password_reset:           { label: 'Pwd Reset',       color: 'bg-amber-100 text-amber-700' },
  invite_sent:              { label: 'Invite Sent',     color: 'bg-indigo-100 text-indigo-700' },
  member_removed:           { label: 'Member Removed',  color: 'bg-orange-100 text-orange-700' },
  audit_purge:              { label: 'Audit Purged',    color: 'bg-gray-100 text-gray-600' },
  gdpr_erasure:             { label: 'GDPR Erasure',    color: 'bg-red-100 text-red-700' },
  retention_policy_updated: { label: 'Retention Set',   color: 'bg-yellow-100 text-yellow-700' },
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
    const parts: string[] = []
    if (obj.query)          parts.push(`"${String(obj.query).slice(0, 60)}${obj.query.length > 60 ? '…' : ''}"`)
    if (obj.source_name)    parts.push(obj.source_name)
    if (obj.invited_email)  parts.push(`→ ${obj.invited_email}`)
    if (obj.removed_email)  parts.push(`removed ${obj.removed_email}`)
    if (obj.erased_email)   parts.push(`erased ${obj.erased_email}`)
    if (obj.method)         parts.push(`via ${obj.method}`)
    if (obj.patterns)       parts.push(Array.isArray(obj.patterns) ? obj.patterns.join('+') : obj.patterns)
    if (obj.quality_score !== undefined) parts.push(`q=${obj.quality_score}`)
    if (obj.chunks !== undefined) parts.push(`${obj.chunks} chunks`)
    if (obj.deleted_rows !== undefined) parts.push(`${obj.deleted_rows} rows deleted`)
    if (obj.audit_log_days) parts.push(`audit=${obj.audit_log_days}d`)
    if (obj.error)          parts.push(`Error: ${obj.error}`)
    return <span className="text-gray-700 text-xs">{parts.join(' · ') || detail}</span>
  } catch {
    return <span className="text-gray-700 text-xs">{detail.slice(0, 80)}</span>
  }
}

const PAGE_SIZE = 50

interface Member { user_id: string; email: string; role: string }

export default function AuditLogPage() {
  const [logs, setLogs]         = useState<AuditEntry[]>([])
  const [summary, setSummary]   = useState<{ event_type: string; total: number; failures: number }[]>([])
  const [page, setPage]         = useState(0)
  const [filter, setFilter]     = useState('')
  const [search, setSearch]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  // Retention policy
  const [retDays, setRetDays]   = useState({ audit_log_days: 90, conversation_days: 90 })
  const [retSaving, setRetSaving] = useState(false)
  const [retMsg, setRetMsg]     = useState('')

  // Purge
  const [purging, setPurging]   = useState(false)
  const [purgeResult, setPurgeResult] = useState('')

  // Export
  const [exporting, setExporting] = useState(false)

  // Erasure
  const [members, setMembers]   = useState<Member[]>([])
  const [eraseTarget, setEraseTarget] = useState('')
  const [erasing, setErasing]   = useState(false)
  const [eraseMsg, setEraseMsg] = useState('')
  const [eraseError, setEraseError] = useState('')

  const load = useCallback(async (p = page, et = filter) => {
    setLoading(true); setError('')
    try {
      const [logsRes, summaryRes, policyRes, membersRes] = await Promise.all([
        getAuditLogs({ event_type: et || undefined, limit: PAGE_SIZE, offset: p * PAGE_SIZE }),
        p === 0 ? getAuditSummary() : Promise.resolve(null),
        p === 0 ? getRetentionPolicy() : Promise.resolve(null),
        p === 0 ? listOrgMembers() : Promise.resolve(null),
      ])
      setLogs(logsRes.logs)
      if (summaryRes) setSummary(summaryRes)
      if (policyRes)  setRetDays({ audit_log_days: policyRes.audit_log_days, conversation_days: policyRes.conversation_days })
      if (membersRes) setMembers(membersRes.filter((m: Member) => m.role !== 'admin'))
    } catch {
      setError('Failed to load audit log.')
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => { load(page, filter) }, [page, filter])

  function handleFilterChange(et: string) { setFilter(et); setPage(0) }

  const displayed = search
    ? logs.filter(l =>
        (l.email || '').toLowerCase().includes(search.toLowerCase()) ||
        (l.event_type || '').includes(search.toLowerCase()) ||
        (l.ip_address || '').includes(search) ||
        (l.detail || '').toLowerCase().includes(search.toLowerCase()))
    : logs

  async function handleExport() {
    setExporting(true)
    try { await exportAuditLogs({ event_type: filter || undefined }) }
    catch { setError('Export failed.') }
    finally { setExporting(false) }
  }

  async function handleSaveRetention() {
    setRetSaving(true); setRetMsg('')
    try {
      await setRetentionPolicy(retDays.audit_log_days, retDays.conversation_days)
      setRetMsg('Retention policy saved.')
      setTimeout(() => setRetMsg(''), 3000)
    } catch { setRetMsg('Failed to save.') }
    finally { setRetSaving(false) }
  }

  async function handlePurge() {
    if (!confirm('This will permanently delete old audit logs based on your retention policy. Download a CSV backup first. Continue?')) return
    setPurging(true); setPurgeResult('')
    try {
      const res = await purgeAuditLogs()
      setPurgeResult(res.message)
      load(0, filter)
    } catch { setPurgeResult('Purge failed.') }
    finally { setPurging(false) }
  }

  async function handleErase() {
    if (!eraseTarget) return
    const member = members.find(m => m.user_id === eraseTarget)
    if (!confirm(`Permanently erase ALL data for ${member?.email}? This cannot be undone (GDPR Article 17).`)) return
    setErasing(true); setEraseMsg(''); setEraseError('')
    try {
      const res = await eraseUserData(eraseTarget)
      setEraseMsg(res.message)
      setEraseTarget('')
      setMembers(prev => prev.filter(m => m.user_id !== eraseTarget))
    } catch (err) {
      setEraseError(err instanceof Error ? err.message : 'Erasure failed.')
    } finally { setErasing(false) }
  }

  return (
    <AppShell>
    <div className="flex-1 overflow-auto p-6">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-600" /> Audit Log
          </h1>
          <p className="text-sm text-gray-500 mt-1">Who did what, when — GDPR-compliant audit trail.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
            <Download className={`w-4 h-4 ${exporting ? 'animate-bounce' : ''}`} />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button onClick={() => load(page, filter)} disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 px-2 py-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Retention Policy card */}
      <div className="card p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4 text-gray-500" /> Data Retention Policy
        </h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Audit log retention (days)</label>
            <input type="number" min={7} max={3650} className="input"
              value={retDays.audit_log_days}
              onChange={e => setRetDays(p => ({ ...p, audit_log_days: Number(e.target.value) }))} />
            <p className="text-xs text-gray-400 mt-1">Logs older than this are eligible for purge. GDPR typical: 90 days.</p>
          </div>
          <div>
            <label className="label">Conversation history retention (days)</label>
            <input type="number" min={7} max={3650} className="input"
              value={retDays.conversation_days}
              onChange={e => setRetDays(p => ({ ...p, conversation_days: Number(e.target.value) }))} />
            <p className="text-xs text-gray-400 mt-1">Chat/query history retention period.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSaveRetention} disabled={retSaving} className="btn-primary text-sm px-4 py-2">
            {retSaving ? 'Saving…' : 'Save policy'}
          </button>
          {retMsg && (
            <span className={`text-sm flex items-center gap-1 ${retMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
              <CheckCircle className="w-4 h-4" />{retMsg}
            </span>
          )}
        </div>

        {/* Purge section */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Purge old audit logs</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Permanently deletes logs older than {retDays.audit_log_days} days.
                <strong className="text-amber-600"> Download CSV backup first.</strong>
              </p>
              {purgeResult && <p className="text-xs text-green-600 mt-1">{purgeResult}</p>}
            </div>
            <button onClick={handlePurge} disabled={purging}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 shrink-0">
              <Trash2 className="w-4 h-4" />
              {purging ? 'Purging…' : 'Purge now'}
            </button>
          </div>
        </div>
      </div>

      {/* GDPR Right to Erasure card */}
      <div className="card p-5 mb-6">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
          <UserX className="w-4 h-4 text-red-500" /> GDPR Right to Erasure
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Permanently delete all data for a user — audit logs, queries, ingest history, and account (Article 17).
        </p>
        {eraseMsg && (
          <div className="mb-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle className="w-4 h-4 shrink-0" />{eraseMsg}
          </div>
        )}
        {eraseError && (
          <div className="mb-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0" />{eraseError}
          </div>
        )}
        {members.length === 0 ? (
          <p className="text-sm text-gray-400">No non-admin members to erase.</p>
        ) : (
          <div className="flex items-center gap-3">
            <select className="input flex-1 text-sm" value={eraseTarget} onChange={e => setEraseTarget(e.target.value)}>
              <option value="">— Select member to erase —</option>
              {members.map(m => (
                <option key={m.user_id} value={m.user_id}>{m.email}</option>
              ))}
            </select>
            <button onClick={handleErase} disabled={erasing || !eraseTarget}
              className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 shrink-0">
              <UserX className="w-4 h-4" />
              {erasing ? 'Erasing…' : 'Erase all data'}
            </button>
          </div>
        )}
      </div>

      {/* Filter chips */}
      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Event</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Detail</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">IP</th>
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
        {logs.length === PAGE_SIZE && (
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
    </AppShell>
  )
}
