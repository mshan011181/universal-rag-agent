'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { restoreSession } from '@/lib/auth'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    restoreSession().then((ok) => {
      if (!ok) {
        router.replace('/login')
      } else {
        setReady(true)
      }
    })
  }, [router])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
