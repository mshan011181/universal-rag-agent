import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Universal RAG Enterprise',
  description: 'Production-grade Retrieval-Augmented Generation — 14 patterns, multi-tenant, Cloud-native',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
