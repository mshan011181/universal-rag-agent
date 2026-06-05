'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { MessageSquare, Upload, BarChart2, LogOut, Database, Settings } from 'lucide-react'
import clsx from 'clsx'
import { logout } from '@/lib/api'
import { getUserRole } from '@/lib/auth'

const NAV = [
  { href: '/query',  label: 'Query',   icon: MessageSquare },
  { href: '/ingest', label: 'Ingest',  icon: Upload },
]

const ADMIN_NAV = [
  { href: '/admin',  label: 'Dashboard', icon: BarChart2 },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const role = getUserRole()

  function handleLogout() {
    logout()
    router.push('/login')
  }

  return (
    <aside className="w-56 min-h-screen bg-gray-900 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Database className="w-6 h-6 text-brand-500" />
          <span className="text-white font-semibold text-sm leading-tight">
            Universal RAG<br />
            <span className="text-gray-400 font-normal text-xs">Enterprise</span>
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              path.startsWith(href)
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800',
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}

        {role === 'admin' && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Admin</span>
            </div>
            {ADMIN_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  path.startsWith(href)
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800',
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400
                     hover:text-white hover:bg-gray-800 transition-colors w-full text-left"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
