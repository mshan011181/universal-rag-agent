'use client'

import { useRouter } from 'next/navigation'
import EduShell from '@/components/edu/EduShell'
import { ArrowLeft, MessageCircle, Mail, Globe, Instagram } from 'lucide-react'

const CONTACTS = [
  { icon: MessageCircle, label: 'WhatsApp', value: '+91 99416 32837', href: 'https://wa.me/919941632837' },
  { icon: Mail, label: 'Email', value: 'support@edu.maximai.com', href: 'mailto:support@edu.maximai.com' },
  { icon: Globe, label: 'Website', value: 'edu.maximai.com', href: 'https://edu.maximai.com' },
  { icon: Instagram, label: 'Instagram', value: '@maximai-edu', href: 'https://www.instagram.com/maximai-edu' },
]

export default function HelpPage() {
  const router = useRouter()
  return (
    <EduShell>
      <div className="max-w-lg mx-auto">
        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/maximai-edu-logo.png" alt="MaximAI Edu" className="h-10 mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900 mt-4">We&apos;re here to help</h1>
          <p className="text-sm text-gray-500 mt-1">Reach the MaximAI Edu team anytime.</p>
          <div className="mt-6 space-y-3 text-left">
            {CONTACTS.map(c => (
              <a key={c.label} href={c.href} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 px-4 py-3 transition-colors">
                <c.icon className="w-5 h-5 text-indigo-600 shrink-0" />
                <div><p className="text-xs text-gray-500">{c.label}</p><p className="text-sm font-medium text-gray-800">{c.value}</p></div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </EduShell>
  )
}
