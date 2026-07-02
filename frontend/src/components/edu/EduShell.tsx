'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import EduTopBar from './EduTopBar'

/** Light, gradient-background shell for the MaximAI Edu experience. */
export default function EduShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  useEffect(() => { if (!isAuthenticated()) router.replace('/login') }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-indigo-50">
      <EduTopBar />
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
