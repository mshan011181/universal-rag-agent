'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { lmsDashboard } from '@/lib/api'
import type { LmsDashboard } from '@/lib/api'
import { getUserRole } from '@/lib/auth'
import { Trophy, Plus, Loader2 } from 'lucide-react'

const BELTS = ['White', 'Yellow', 'Orange', 'Green', 'Blue', 'Purple', 'Brown', 'Black']
function beltFor(completed = 0) { return BELTS[Math.min(BELTS.length - 1, Math.floor(completed / 3))] }

export default function RoleSelectionPage() {
  const router = useRouter()
  const role = getUserRole()
  const [data, setData] = useState<LmsDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Students land straight in their own space.
    if (role === 'student') { router.replace('/edu/student'); return }
    lmsDashboard().then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [role, router])

  const children = data?.children || []

  return (
    <EduShell>
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-3xl font-bold text-center text-gray-900">Choose <span className="text-indigo-600">Profile</span></h1>
          <p className="text-center text-gray-500 mt-1">Select who&apos;s using MaximAI Edu</p>
          <div className="w-10 h-1 bg-indigo-500 rounded mx-auto mt-3 mb-6" />

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
          ) : (
            <div className="space-y-4">
              {/* Parent */}
              <button onClick={() => router.push('/edu/parent')}
                className="w-full rounded-2xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all p-6 text-center">
                <Trophy className="w-9 h-9 mx-auto text-amber-500" />
                <p className="font-bold text-gray-900 mt-2">Parent</p>
                <p className="text-sm text-gray-500">Manage &amp; monitor</p>
              </button>

              {/* Children */}
              {children.map((c) => (
                <button key={c.student_id} onClick={() => router.push(`/edu/parent/child/${c.student_id}`)}
                  className="w-full rounded-2xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-bold">
                    {(c.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <p className="font-bold text-gray-900 mt-2">{c.name}</p>
                  <span className="inline-block mt-1 px-3 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
                    {beltFor(c.completed)} Belt
                  </span>
                  <p className="text-sm text-gray-500 mt-1">View progress</p>
                </button>
              ))}

              {/* Add student (managed by admin for now) */}
              <button onClick={() => router.push('/edu/parent/students')}
                className="w-full rounded-2xl border border-dashed border-gray-300 hover:border-indigo-400 hover:shadow-md transition-all p-6 text-center">
                <Plus className="w-8 h-8 mx-auto text-indigo-500" />
                <p className="font-bold text-gray-900 mt-2">Student Profiles</p>
                <p className="text-sm text-gray-500">Manage student profiles</p>
              </button>
            </div>
          )}
        </div>
      </div>
    </EduShell>
  )
}
