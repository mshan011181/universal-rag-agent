'use client'

import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { Trophy, BarChart3, MessageCircle, Users, Gem, Settings, HelpCircle, ArrowLeftRight } from 'lucide-react'

const CARDS = [
  { label: 'Test Results',     icon: Trophy,        href: '/edu/parent/students', color: 'text-amber-500' },
  { label: 'Feedback Reports', icon: BarChart3,     href: '/edu/parent/students', color: 'text-indigo-500' },
  { label: 'Chat with Tutor',  icon: MessageCircle, href: '/edu/study',           color: 'text-sky-500' },
  { label: 'Student Profiles', icon: Users,         href: '/edu/profiles',        color: 'text-violet-600' },
  { label: 'Subscriptions',    icon: Gem,           href: '/plan',                color: 'text-cyan-500' },
  { label: 'Account',          icon: Settings,      href: '/plan',                color: 'text-gray-500' },
  { label: 'Help & Support',   icon: HelpCircle,    href: '/edu/help',            color: 'text-rose-500' },
]

export default function ParentDashboard() {
  const router = useRouter()
  return (
    <EduShell>
      <button onClick={() => router.push('/edu/role-selection')}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-4 py-2.5 shadow-sm hover:opacity-95">
        <ArrowLeftRight className="w-4 h-4" />
        <span className="text-sm font-semibold leading-tight text-left">Switch Profile<br /><span className="text-xs font-normal opacity-90">Choose who&apos;s using MaximAI Edu</span></span>
      </button>

      <div className="text-center mt-6 mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Parent <span className="text-indigo-600">Dashboard</span></h1>
        <p className="text-gray-500 mt-1">Set up the learning experience &amp; monitor progress.</p>
        <div className="w-10 h-1 bg-indigo-500 rounded mx-auto mt-3" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {CARDS.map(({ label, icon: Icon, href, color }) => (
          <button key={label} onClick={() => router.push(href)}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-6 flex flex-col items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <span className="text-sm font-semibold text-gray-800 text-center">{label}</span>
          </button>
        ))}
      </div>
    </EduShell>
  )
}
