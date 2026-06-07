'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { fetchAdminStats, fetchHealth, fetchAdminUsers } from '@/lib/api'
import type { AdminStats, AdminUser } from '@/types'
import { BarChart2, Users, FileText, MessageSquare, Zap, AlertCircle, HardDrive } from 'lucide-react'
import clsx from 'clsx'

// Default quota per user: 500 MB
const QUOTA_BYTES = 500 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatCard({ label, value, icon: Icon, sub }: {
  label: string; value: string | number; icon: React.ElementType; sub?: string
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-brand-600" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function StorageBar({ used, quota }: { used: number; quota: number }) {
  const pct = Math.min((used / quota) * 100, 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-brand-500'
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>{formatBytes(used)}</span>
        <span>{formatBytes(quota)}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-400 mt-0.5">{pct.toFixed(1)}% used</p>
    </div>
  )
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchAdminStats(), fetchHealth(), fetchAdminUsers()])
      .then(([s, h, u]) => { setStats(s); setHealth(h); setUsers(u) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

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
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* KPI row */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Queries" value={(stats.total_queries ?? 0).toLocaleString()} icon={MessageSquare} />
            <StatCard label="Users" value={(stats.total_users ?? 0).toLocaleString()} icon={Users} />
            <StatCard label="Documents Indexed" value={(stats.total_documents ?? 0).toLocaleString()} icon={FileText} />
            <StatCard
              label="Avg Quality"
              value={`${((stats.avg_quality_score ?? 0) * 100).toFixed(1)}%`}
              icon={Zap}
              sub="0.0 – 1.0 graded scale"
            />
          </div>
        )}

        {/* Users Table */}
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <Users className="w-4 h-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-gray-700">User Accounts & Storage</h2>
            <span className="ml-auto text-xs text-gray-400">Default quota: {formatBytes(QUOTA_BYTES)} / user</span>
          </div>

          {users.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Org ID</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Docs</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Chunks</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-48">Storage Usage</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => {
                    const pct = Math.min((u.storage_used_bytes / QUOTA_BYTES) * 100, 100)
                    const overQuota = pct >= 100
                    return (
                      <tr key={u.user_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-900 font-medium">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {u.org_id.slice(0, 8)}…
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            u.role === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'
                          )}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{u.doc_count}</td>
                        <td className="px-4 py-3 text-gray-700">{u.total_chunks}</td>
                        <td className="px-4 py-3">
                          {overQuota ? (
                            <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                              <HardDrive className="w-3 h-3" />
                              Over quota ({formatBytes(u.storage_used_bytes)})
                            </div>
                          ) : (
                            <StorageBar used={u.storage_used_bytes} quota={QUOTA_BYTES} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
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
                {Object.entries(stats.pattern_breakdown)
                  .sort(([, a], [, b]) => b - a)
                  .map(([pattern, count]) => {
                    const pct = stats.total_queries > 0
                      ? Math.round((count / stats.total_queries) * 100)
                      : 0
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
    </AppShell>
  )
}
