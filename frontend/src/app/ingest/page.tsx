'use client'

import { useState, useEffect, useRef, DragEvent } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ingestFile, ingestText, ingestYouTube, ingestWebLink, ingestMedia, getIngestHistory, deleteIngest } from '@/lib/api'
import type { IngestResponse, IngestHistory } from '@/types'
import { FileText, Music, Video, Globe, Youtube, Trash2, Upload, AlertCircle, CheckCircle, Loader } from 'lucide-react'

type TabType = 'documents' | 'text' | 'audio' | 'video' | 'weblinks' | 'youtube'

const TAB_CONFIG: Record<TabType, { label: string; icon: React.ElementType; description: string }> = {
  documents: { label: 'Documents', icon: FileText, description: 'PDF, DOCX, TXT, MD, CSV' },
  text: { label: 'Text', icon: FileText, description: 'Plain text paste' },
  audio: { label: 'Audio', icon: Music, description: 'MP3, WAV, M4A URLs' },
  video: { label: 'Video', icon: Video, description: 'MP4, WebM URLs' },
  weblinks: { label: 'Web Links', icon: Globe, description: 'Any web page URL' },
  youtube: { label: 'YouTube', icon: Youtube, description: 'YouTube video URLs' },
}

export default function IngestPage() {
  const [activeTab, setActiveTab] = useState<TabType>('documents')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [history, setHistory] = useState<IngestHistory>({ by_type: {}, total: 0 })
  const [historyLoading, setHistoryLoading] = useState(true)

  // Form fields
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('manual')
  const inputRef = useRef<HTMLInputElement>(null)

  const loadHistory = async () => {
    try {
      setHistoryLoading(true)
      const data = await getIngestHistory()
      setHistory(data)
    } catch {
      setMessage({ type: 'error', text: 'Failed to load ingestion history' })
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleIngestFile = async () => {
    if (!file) {
      showMessage('error', 'Please select a file')
      return
    }
    setLoading(true)
    try {
      await ingestFile(file)
      showMessage('success', `${file.name} queued for ingestion`)
      setFile(null)
      loadHistory()
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  const handleIngestText = async () => {
    if (!text.trim()) {
      showMessage('error', 'Please enter some text')
      return
    }
    setLoading(true)
    try {
      await ingestText(text, source)
      showMessage('success', 'Text ingested successfully')
      setText('')
      loadHistory()
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Text ingestion failed')
    } finally {
      setLoading(false)
    }
  }

  const handleIngestYouTube = async () => {
    if (!url.trim()) {
      showMessage('error', 'Please enter a YouTube URL')
      return
    }
    setLoading(true)
    try {
      await ingestYouTube(url)
      showMessage('success', 'YouTube video queued for transcription')
      setUrl('')
      loadHistory()
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'YouTube ingestion failed')
    } finally {
      setLoading(false)
    }
  }

  const handleIngestWebLink = async () => {
    if (!url.trim()) {
      showMessage('error', 'Please enter a URL')
      return
    }
    setLoading(true)
    try {
      await ingestWebLink(url)
      showMessage('success', 'Web page queued for ingestion')
      setUrl('')
      loadHistory()
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Web link ingestion failed')
    } finally {
      setLoading(false)
    }
  }

  const handleIngestMedia = async (type: 'audio' | 'video') => {
    if (!url.trim()) {
      showMessage('error', `Please enter a ${type} URL`)
      return
    }
    setLoading(true)
    try {
      await ingestMedia(url, type)
      showMessage('success', `${type.charAt(0).toUpperCase() + type.slice(1)} queued for transcription`)
      setUrl('')
      loadHistory()
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : `${type} ingestion failed`)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (ingestId: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await deleteIngest(ingestId)
      showMessage('success', 'Deleted successfully')
      loadHistory()
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const currentItems = (history.by_type[activeTab] || [])

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Ingest Content</h1>
          <p className="text-sm text-gray-500 mt-1">Upload documents, paste text, or add URLs for ingestion</p>
        </div>

        {message && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto mb-6 pb-2">
          {(Object.entries(TAB_CONFIG) as [TabType, typeof TAB_CONFIG[TabType]][]).map(([tab, config]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <config.icon className="w-4 h-4" />
              {config.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Input Section */}
          <div className="lg:col-span-1">
            <div className="card p-5 sticky top-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{TAB_CONFIG[activeTab].label}</h2>
              <p className="text-xs text-gray-500 mb-4">{TAB_CONFIG[activeTab].description}</p>

              {activeTab === 'documents' && (
                <div>
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-4 text-center mb-4 cursor-pointer transition-colors ${
                      dragging ? 'border-brand-600 bg-brand-50' : 'border-gray-300 hover:border-brand-600'
                    }`}
                  >
                    <input ref={inputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".pdf,.docx,.txt,.md,.csv" className="hidden" />
                    <Upload className="w-5 h-5 mx-auto mb-2 text-gray-400" />
                    <span className="text-xs">{file ? file.name : 'Click or drop file'}</span>
                  </div>
                  <button onClick={handleIngestFile} disabled={loading || !file} className="btn-primary w-full text-sm">
                    {loading ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
              )}

              {activeTab === 'text' && (
                <div className="space-y-3">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your text here..." className="input w-full h-24 text-sm" />
                  <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source name" className="input w-full text-sm" />
                  <button onClick={handleIngestText} disabled={loading || !text.trim()} className="btn-primary w-full text-sm">
                    {loading ? 'Processing…' : 'Ingest'}
                  </button>
                </div>
              )}

              {activeTab === 'youtube' && (
                <div className="space-y-3">
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="input w-full text-sm" />
                  <button onClick={handleIngestYouTube} disabled={loading || !url.trim()} className="btn-primary w-full text-sm">
                    {loading ? 'Processing…' : 'Add Video'}
                  </button>
                </div>
              )}

              {activeTab === 'weblinks' && (
                <div className="space-y-3">
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="input w-full text-sm" />
                  <button onClick={handleIngestWebLink} disabled={loading || !url.trim()} className="btn-primary w-full text-sm">
                    {loading ? 'Processing…' : 'Add Link'}
                  </button>
                </div>
              )}

              {activeTab === 'audio' && (
                <div className="space-y-3">
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/audio.mp3" className="input w-full text-sm" />
                  <button onClick={() => handleIngestMedia('audio')} disabled={loading || !url.trim()} className="btn-primary w-full text-sm">
                    {loading ? 'Processing…' : 'Add Audio'}
                  </button>
                </div>
              )}

              {activeTab === 'video' && (
                <div className="space-y-3">
                  <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/video.mp4" className="input w-full text-sm" />
                  <button onClick={() => handleIngestMedia('video')} disabled={loading || !url.trim()} className="btn-primary w-full text-sm">
                    {loading ? 'Processing…' : 'Add Video'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* History Section */}
          <div className="lg:col-span-2">
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">{TAB_CONFIG[activeTab].label} ({currentItems.length})</h2>

              {historyLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader className="w-5 h-5 animate-spin text-brand-600" />
                </div>
              ) : currentItems.length === 0 ? (
                <p className="text-sm text-gray-500">No {TAB_CONFIG[activeTab].label.toLowerCase()} ingested yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {currentItems.map((item: any) => (
                    <div key={item.ingest_id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-xs text-gray-500">{formatDate(item.created_at)}</span>
                          {item.size_bytes && <span className="text-xs text-gray-500">{formatBytes(item.size_bytes)}</span>}
                          {item.chunks > 0 && <span className="text-xs text-brand-600 font-medium">{item.chunks} chunks</span>}
                        </div>
                      </div>
                      <button onClick={() => handleDelete(item.ingest_id, item.name)} className="ml-2 p-1 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
