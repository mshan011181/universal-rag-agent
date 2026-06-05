'use client'

import Sidebar from './Sidebar'
import AuthGuard from '@/components/AuthGuard'

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-8 bg-gray-50">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
