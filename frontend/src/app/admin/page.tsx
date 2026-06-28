'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import {
  fetchAdminStats, fetchHealth, fetchAdminUsers,
  fetchAdminQueries, fetchAdminDocuments,
  createAdminUser, deleteAdminUser, updateUserQuota, migrateVectors,
} from '@/lib/api'
import type { AdminStats, AdminUser, AdminQuery, AdminDocument } from '@/types'
import {
  BarChart2, Users, FileText, MessageSquare, Zap, AlertCircle,
  HardDrive, Trash2, UserPlus, Infinity, X, ChevronRight, Info,
} from 'lucide-react'
import clsx from 'clsx'
import { getUserRole } from '@/lib/auth'
import { PATTERNS_INFO } from '@/lib/models'

const DEFAULT_QUOTA = 500 * 1024 * 1024
const UNLIMITED = -1

const TYPE_LABELS: Record<string, string> = {
  document: 'Document', text: 'Text', audio: 'Audio',
  video: 'Video', weblink: 'Web Link', youtube: 'YouTube',
}
const TYPE_COLORS: Record<string, string> = {
  document: 'bg-blue-100 text-blue-700',
  text: 'bg-gray-100 text-gray-700',
  audio: 'bg-purple-100 text-purple-700',
  video: 'bg-red-100 text-red-700',
  weblink: 'bg-green-100 text-green-700',
  youtube: 'bg-red-100 text-red-800',
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleString()
}

// ── Clickable KPI Card ────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, sub, onClick }: {
  label: string; value: string | number; icon: React.ElementType; sub?: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={clsx('card p-5', onClick && 'cursor-pointer hover:shadow-md hover:border-brand-300 border border-transparent transition-all')}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className="flex items-center gap-1">
          {onClick && <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-brand-600" />
          </div>
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {onClick && <p className="text-xs text-brand-500 mt-2">Click to view details</p>}
    </div>
  )
}

function StorageBar({ used, quota }: { used: number; quota: number }) {
  if (quota === UNLIMITED) {
    return (
      <div className="w-full">
        <div className="text-xs text-gray-500 mb-1">{formatBytes(used)} used</div>
        <div className="flex items-center gap-1 text-xs text-brand-600 font-medium">
          <Infinity className="w-3 h-3" /> Unlimited
        </div>
      </div>
    )
  }
  const pct = Math.min((used / quota) * 100, 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-brand-500'
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{formatBytes(used)}</span><span>{formatBytes(quota)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% used</p>
    </div>
  )
}

// ── Slide-in Detail Panel ─────────────────────────────────────────────────────
function SlidePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Queries Panel ─────────────────────────────────────────────────────────────
function QueriesPanel({ onClose }: { onClose: () => void }) {
  const [queries, setQueries] = useState<AdminQuery[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchAdminQueries().then(setQueries).finally(() => setLoading(false))
  }, [])

  const filtered = queries.filter(q =>
    q.query.toLowerCase().includes(search.toLowerCase()) ||
    (q.email || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <SlidePanel title={`All Queries (${queries.length})`} onClose={onClose}>
      <div className="px-6 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="Search queries or user email…"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 px-6 py-8 text-center">No queries found.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map((q, i) => (
            <div key={i} className="px-6 py-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-brand-600">{q.email || 'Unknown user'}</span>
                <span className="text-xs text-gray-400">{formatDate(q.timestamp)}</span>
              </div>
              <p className="text-sm font-medium text-gray-900 mb-1.5">{q.query}</p>
              <p className="text-xs text-gray-500 line-clamp-2">{q.answer}</p>
            </div>
          ))}
        </div>
      )}
    </SlidePanel>
  )
}

// ── Documents Panel ───────────────────────────────────────────────────────────
function DocumentsPanel({ onClose }: { onClose: () => void }) {
  const [docs, setDocs] = useState<AdminDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetchAdminDocuments().then(setDocs).finally(() => setLoading(false))
  }, [])

  const types = ['all', ...Array.from(new Set(docs.map(d => d.ingest_type)))]
  const filtered = filter === 'all' ? docs : docs.filter(d => d.ingest_type === filter)

  return (
    <SlidePanel title={`All Indexed Documents (${docs.length})`} onClose={onClose}>
      <div className="px-6 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="flex gap-2 flex-wrap">
          {types.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={clsx('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                filter === t ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}>
              {t === 'all' ? 'All' : (TYPE_LABELS[t] ?? t)}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 px-6 py-8 text-center">No documents found.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {filtered.map((d) => (
            <div key={d.ingest_id} className="px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', TYPE_COLORS[d.ingest_type] ?? 'bg-gray-100 text-gray-600')}>
                      {TYPE_LABELS[d.ingest_type] ?? d.ingest_type}
                    </span>
                    <span className="text-xs text-gray-400">{d.email || 'Unknown user'}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {d.source_name || d.source_url || 'Unnamed'}
                  </p>
                  {d.source_url && d.source_name && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">{d.source_url}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">{d.chunks_created} chunks</p>
                  <p className="text-xs text-gray-400">{formatBytes(d.file_size_bytes)}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(d.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SlidePanel>
  )
}

// ── Add User Modal ────────────────────────────────────────────────────────────
function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await createAdminUser(email, password, role)
      onCreated(); onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add User</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" required minLength={6} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Quota Modal ───────────────────────────────────────────────────────────────
function QuotaModal({ user, onClose, onUpdated }: { user: AdminUser; onClose: () => void; onUpdated: () => void }) {
  const [unlimited, setUnlimited] = useState(user.storage_quota_bytes === UNLIMITED)
  const [mb, setMb] = useState(user.storage_quota_bytes === UNLIMITED ? 500 : Math.round(user.storage_quota_bytes / (1024 * 1024)))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setError('')
    setLoading(true)
    try {
      await updateUserQuota(user.user_id, unlimited ? null : mb * 1024 * 1024, unlimited)
      onUpdated(); onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update quota')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Edit Storage Quota</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">User: <span className="font-medium text-gray-900">{user.email}</span></p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="w-4 h-4 accent-brand-600" />
            <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
              <Infinity className="w-4 h-4 text-brand-600" /> Unlimited storage
            </span>
          </label>
          {!unlimited && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quota (MB)</label>
              <div className="flex items-center gap-2">
                <input type="number" min={50} step={50} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={mb} onChange={(e) => setMb(Number(e.target.value))} />
                <span className="text-sm text-gray-500">MB</span>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {[100, 250, 500, 1000, 2000].map((v) => (
                  <button key={v} onClick={() => setMb(v)}
                    className={clsx('px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                      mb === v ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-300 text-gray-600 hover:border-brand-400'
                    )}>
                    {v >= 1000 ? `${v / 1000} GB` : `${v} MB`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
              {loading ? 'Saving…' : 'Save Quota'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAddUser, setShowAddUser] = useState(false)
  const [quotaUser, setQuotaUser] = useState<AdminUser | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [panel, setPanel] = useState<'queries' | 'documents' | null>(null)
  const [migrateMsg, setMigrateMsg] = useState<string>('')

  useEffect(() => {
    const role = getUserRole()
    if (role && role !== 'admin') { router.replace('/query'); return }
    loadData()
  }, [router])

  async function loadData() {
    try {
      const [s, h, u] = await Promise.all([fetchAdminStats(), fetchHealth(), fetchAdminUsers()])
      setStats(s); setHealth(h); setUsers(u)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally { setLoading(false) }
  }

  async function handleDelete(userId: string) {
    setActionLoading(userId)
    try {
      await deleteAdminUser(userId)
      setUsers((prev) => prev.filter((u) => u.user_id !== userId))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally { setActionLoading(null); setDeleteConfirm(null) }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">System overview and usage statistics</p>
          </div>
          {health && (
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${health.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-gray-600">API {health.status}</span>
              {health.version && <span className="text-gray-400">v{health.version}</span>}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* KPIs */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Queries" value={(stats.total_queries ?? 0).toLocaleString()}
              icon={MessageSquare} onClick={() => setPanel('queries')}
            />
            <StatCard label="Users" value={(stats.total_users ?? 0).toLocaleString()} icon={Users} />
            <StatCard
              label="Documents Indexed" value={(stats.total_documents ?? 0).toLocaleString()}
              icon={FileText} onClick={() => setPanel('documents')}
            />
            <StatCard label="Avg Quality" value={`${((stats.avg_quality_score ?? 0) * 100).toFixed(1)}%`} icon={Zap} sub="0.0 – 1.0 graded scale" />
          </div>
        )}

        {/* Users Table */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Users className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-700">User Accounts & Storage</h2>
            <button onClick={() => setShowAddUser(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors">
              <UserPlus className="w-3.5 h-3.5" /> Add User
            </button>
          </div>
          {users.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    {['Email', 'Org ID', 'Role', 'Docs', 'Chunks', 'Storage', 'Joined', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => (
                    <tr key={u.user_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900 font-medium">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded" title={u.org_id}>
                          {u.org_id.slice(0, 8)}…
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('px-2 py-0.5 rounded text-xs font-medium',
                          u.role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600')}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{u.doc_count}</td>
                      <td className="px-4 py-3 text-gray-700">{u.total_chunks}</td>
                      <td className="px-4 py-3 w-48"><StorageBar used={u.storage_used_bytes} quota={u.storage_quota_bytes} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setQuotaUser(u)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-600 hover:border-brand-400 hover:text-brand-600 transition-colors">
                            <HardDrive className="w-3 h-3" /> Quota
                          </button>
                          {deleteConfirm === u.user_id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDelete(u.user_id)} disabled={actionLoading === u.user_id}
                                className="px-2 py-1 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                                {actionLoading === u.user_id ? '…' : 'Confirm'}
                              </button>
                              <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(u.user_id)}
                              className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete user">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Maintenance — one-time vector migration */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-700">Maintenance</h2>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Copy all vectors from Pinecone into pgvector (Postgres). Run this once, then switch the
            backend to pgvector.
          </p>
          <button
            onClick={async () => {
              setMigrateMsg('Migrating…')
              try {
                const r = await migrateVectors()
                setMigrateMsg(`Migrated ${r.total} vectors across ${Object.keys(r.migrated).length} namespace(s).`)
              } catch (e) {
                setMigrateMsg(e instanceof Error ? e.message : 'Migration failed')
              }
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Migrate vectors → pgvector
          </button>
          {migrateMsg && <p className="text-xs text-gray-600 mt-2">{migrateMsg}</p>}
        </div>

        {/* Models & Patterns reference */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Info className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-700">Models &amp; Patterns</h2>
          </div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">RAG Patterns</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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

        {/* RAG Pattern Usage */}
        {stats && (
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-gray-700">RAG Pattern Usage</h2>
            </div>
            {Object.keys(stats.pattern_breakdown).length === 0 ? (
              <p className="text-sm text-gray-400">No queries yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.pattern_breakdown).sort(([, a], [, b]) => b - a).map(([pattern, count]) => {
                  const pct = stats.total_queries > 0 ? Math.round((count / stats.total_queries) * 100) : 0
                  return (
                    <div key={pattern}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-700 capitalize">{pattern.replace(/_/g, ' ')}</span>
                        <span className="text-gray-500">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panels & Modals */}
      {panel === 'queries' && <QueriesPanel onClose={() => setPanel(null)} />}
      {panel === 'documents' && <DocumentsPanel onClose={() => setPanel(null)} />}
      {showAddUser && <AddUserModal onClose={() => setShowAddUser(false)} onCreated={loadData} />}
      {quotaUser && <QuotaModal user={quotaUser} onClose={() => setQuotaUser(null)} onUpdated={loadData} />}
    </AppShell>
  )
}
