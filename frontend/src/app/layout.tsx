import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MaximAI — your data, distilled into answers',
  description: 'MaximAI — your data, distilled into answers. Retrieval-Augmented Generation across all your files.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
