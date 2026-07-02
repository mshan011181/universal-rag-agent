'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut } from 'lucide-react'
import { logout } from '@/lib/api'
import { getUserRole } from '@/lib/auth'

/**
 * Light top bar for the MaximAI Edu (student/parent) experience.
 * Kept fully separate from the existing dark side-pane AppShell so the main
 * app is untouched.
 */
export default function EduTopBar() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const role = getUserRole()

  useEffect(() => { setEmail(sessionStorage.getItem('user_email')) }, [])

  return (
    <header className="sticky top-0 z-20 px-4 pt-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between bg-white/90 backdrop-blur rounded-2xl shadow-sm border border-gray-100 px-5 py-2.5">
        <button onClick={() => router.push('/edu/role-selection')} className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/maximai-edu-logo.png" alt="MaximAI Edu" className="h-9 w-auto" />
        </button>
        <div className="flex items-center gap-4">
          <button className="relative text-gray-400 hover:text-gray-600" title="Notifications">
            <Bell className="w-5 h-5" />
          </button>
          <span className="text-sm text-gray-700 hidden sm:inline">
            {email || 'Signed in'}{role ? <span className="text-gray-400"> ({role})</span> : null}
          </span>
          <button onClick={() => { logout(); router.push('/login') }} title="Sign out"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  )
}
