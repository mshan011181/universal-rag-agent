'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { fetchAdminStats, fetchHealth } from '@/lib/api'
import type { AdminStats } from '@/types'
import { BarChart2, Users, FileText, MessageSquare, Zap, Activity, AlertCircle } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  sub?: string
}

function StatCard({ label, value, icon: Icon, sub }: StatCardProps) {
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

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [health, setHealth] = useState<{ status: string; version: string } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchAdminStats(), fetchHealth()])
      .then(([s, h]) => { setStats(s); setHealth(h) })
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
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
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
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-6">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard label="Total Queries" value={(stats.total_queries ?? 0).toLocaleString()} icon={MessageSquare} />
              <StatCard label="Users" value={(stats.total_users ?? 0).toLocaleString()} icon={Users} />
              <StatCard label="Documents" value={(stats.total_documents ?? 0).toLocaleString()} icon={FileText} />
              <StatCard
                label="Avg Quality"
                value={`${((stats.avg_quality_score ?? 0) * 100).toFixed(1)}%`}
                icon={Zap}
                sub="0.0 – 1.0 graded scale"
              />
            </div>

            {/* Pattern breakdown */}
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
                            <div
                              className="h-full bg-brand-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  )
}
