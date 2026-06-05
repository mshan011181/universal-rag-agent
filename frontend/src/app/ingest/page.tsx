'use client'

import { useState, useRef, DragEvent } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ingestFile, ingestText } from '@/lib/api'
import type { IngestResponse } from '@/types'
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react'
import clsx from 'clsx'

const ACCEPTED = '.pdf,.docx,.txt,.md,.csv'

export default function IngestPage() {
  const [tab, setTab] = useState<'file' | 'text'>('file')
  const [namespace, setNamespace] = useState('default')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<IngestResponse | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  async function handleFileIngest() {
    if (!file) return
    setError(''); setResult(null); setLoading(true)
    try {
      setResult(await ingestFile(file, namespace))
      setFile(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ingest failed')
    } finally { setLoading(false) }
  }

  async function handleTextIngest() {
    if (!text.trim() || !source.trim()) return
    setError(''); setResult(null); setLoading(true)
    try {
      setResult(await ingestText(text, source, namespace))
      setText(''); setSource('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ingest failed')
    } finally { setLoading(false) }
  }

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ingest</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload documents or paste text to add them to your knowledge base.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {(['file', 'text'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setResult(null); setError('') }}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize',
                tab === t
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              )}
            >
              {t === 'file' ? 'Upload File' : 'Paste Text'}
            </button>
          ))}
        </div>

        <div className="card p-5 space-y-4">
          {/* Namespace */}
          <div>
            <label className="label">Namespace (tenant)</label>
            <input className="input" value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="default" />
          </div>

          {tab === 'file' ? (
            <>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
                  dragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50',
                )}
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Drop a file here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">PDF, DOCX, TXT, MD, CSV</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              {file && (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <FileText className="w-4 h-4 text-brand-600" />
                    {file.name}
                    <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <button
                onClick={handleFileIngest}
                disabled={!file || loading}
                className="btn-primary flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {loading ? 'Indexing…' : 'Index Document'}
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="label">Source / Title</label>
                <input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Company Policy v2.1" required />
              </div>
              <div>
                <label className="label">Content</label>
                <textarea
                  className="input resize-none"
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste your document content here…"
                  required
                />
              </div>
              <button
                onClick={handleTextIngest}
                disabled={!text.trim() || !source.trim() || loading}
                className="btn-primary flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {loading ? 'Indexing…' : 'Index Text'}
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="flex items-start gap-3 mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Document indexed successfully</p>
              <p className="text-xs text-green-700 mt-0.5">
                {result.chunks_indexed} chunks · ID: <code className="font-mono">{result.document_id}</code>
              </p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
