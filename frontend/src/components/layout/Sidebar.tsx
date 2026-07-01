'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Upload, BarChart2, LogOut, Database, User, TableProperties, Users, ShieldCheck, History, ClipboardCheck, CreditCard, GraduationCap } from 'lucide-react'
import clsx from 'clsx'
import { logout, fetchUsage } from '@/lib/api'
import { getUserRole } from '@/lib/auth'

const NAV = [
  { href: '/query',    label: 'Ask Your Data',     icon: Home },
  { href: '/evaluate', label: 'Answer Evaluation', icon: ClipboardCheck },
  { href: '/teacher-tools', label: 'Teacher Tools', icon: GraduationCap },
  { href: '/history',  label: 'My History',        icon: History },
  { href: '/bi',      label: 'BI / Analytics', icon: TableProperties },
  { href: '/ingest',  label: 'Ingest',         icon: Upload },
  { href: '/plan',    label: 'Plan & Usage',   icon: CreditCard },
]

const ADMIN_NAV = [
  { href: '/admin',        label: 'Dashboard', icon: BarChart2 },
  { href: '/team',         label: 'Team',      icon: Users },
  { href: '/admin/audit',  label: 'Audit Log', icon: ShieldCheck },
]

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()
  const role = getUserRole()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [plan, setPlan] = useState<string | null>(null)

  useEffect(() => {
    // Get user email from sessionStorage (set during login)
    const email = sessionStorage.getItem('user_email')
    setUserEmail(email)
    fetchUsage().then(u => setPlan(u.plan)).catch(() => {})
  }, [])

  function handleLogout() {
    logout() // clears access token, refresh_token, user_role, user_email
    router.push('/login')
  }

  return (
    <aside className="w-56 h-screen shrink-0 bg-gray-900 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Database className="w-6 h-6 text-brand-500" />
          <span className="text-white font-semibold text-sm leading-tight">
            MaximAI<br />
            <span className="text-gray-400 font-normal text-xs">your data, distilled into answers</span>
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
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

      {/* User info */}
      <div className="px-3 py-4 border-t border-gray-700 space-y-2">
        <div className="flex items-start gap-2 px-2 py-2">
          <User className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Logged in as</p>
            <p className="text-sm text-white truncate font-medium">{userEmail || 'Loading...'}</p>
            <p className="text-xs text-gray-500 mt-1 capitalize">Role: {role || 'user'}</p>
            {plan && (
              <span className={clsx(
                'inline-block mt-1 px-1.5 py-0.5 rounded text-xs font-medium capitalize',
                plan === 'owner' ? 'bg-amber-900/40 text-amber-300'
                  : plan === 'free' ? 'bg-gray-700 text-gray-300'
                  : 'bg-brand-600/30 text-brand-300',
              )}>
                {plan === 'owner' ? 'Owner · Unlimited' : `${plan} plan`}
              </span>
            )}
          </div>
        </div>
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
