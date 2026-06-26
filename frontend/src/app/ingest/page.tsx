'use client'

import { useState, useEffect, useRef, DragEvent } from 'react'
import AppShell from '@/components/layout/AppShell'
import { ingestFile, ingestText, ingestYouTube, ingestWebLink, ingestMedia, ingestAudioFile, ingestVideoFile, ingestImage, convertImageToExcel, getIngestHistory, deleteIngest, retryIngest, cancelIngest } from '@/lib/api'
import type { IngestResponse, IngestHistory } from '@/types'
import { FileText, Music, Video, Globe, Youtube, Trash2, Upload, AlertCircle, CheckCircle, Loader, RefreshCw, Image, RotateCcw, Ban } from 'lucide-react'

type TabType = 'documents' | 'text' | 'audio' | 'video' | 'weblinks' | 'youtube' | 'images'

const TAB_CONFIG: Record<TabType, { label: string; icon: React.ElementType; description: string }> = {
  documents: { label: 'Documents', icon: FileText, description: 'PDF, DOCX, TXT, MD, CSV, PPT, PPTX, XLS, XLSX, JSON, GeoJSON' },
  text: { label: 'Text', icon: FileText, description: 'Plain text paste' },
  audio: { label: 'Audio', icon: Music, description: 'MP3, WAV, M4A URLs' },
  video: { label: 'Video', icon: Video, description: 'MP4, WebM, MOV, AVI, MKV' },
  weblinks: { label: 'Web Links', icon: Globe, description: 'Any web page URL' },
  youtube: { label: 'YouTube', icon: Youtube, description: 'YouTube video URLs' },
  images: { label: 'Images', icon: Image, description: 'PNG, JPG, GIF, WebP — text & diagrams extracted via AI Vision' },
}

export default function IngestPage() {
  const [activeTab, setActiveTab] = useState<TabType>('documents')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [history, setHistory] = useState<IngestHistory>({ by_type: {}, total: 0 })
  const [historyLoading, setHistoryLoading] = useState(true)

  // Form fields (multi-select: each holds the list of files picked)
  const [files, setFiles] = useState<File[]>([])
  const [useMarker, setUseMarker] = useState(false)
  const [audioFiles, setAudioFiles] = useState<File[]>([])
  const [videoFiles, setVideoFiles] = useState<File[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [source, setSource] = useState('manual')
  const inputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  // silent=true means background refresh — no spinner shown
  const loadHistory = async (silent = false) => {
    try {
      if (!silent) setHistoryLoading(true)
      const data = await getIngestHistory()
      setHistory(data)
    } catch {
      if (!silent) setMessage({ type: 'error', text: 'Failed to load ingestion history' })
    } finally {
      if (!silent) setHistoryLoading(false)
    }
  }

  const historyRef = useRef(history)
  useEffect(() => { historyRef.current = history }, [history])

  useEffect(() => {
    loadHistory()
    const interval = setInterval(() => {
      const allItems = Object.values(historyRef.current.by_type).flat() as any[]
      const hasProcessing = allItems.some((i: any) => i.status === 'processing')
      // Poll every 2s when something is processing, every 6s when idle
      if (hasProcessing || Math.random() < 0.34) {
        loadHistory(true)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  // Upload many files in parallel with a small concurrency cap so several
  // large videos don't saturate the connection (or one Cloud Run instance).
  const uploadAll = async (list: File[], uploader: (f: File) => Promise<unknown>, limit = 3) => {
    const queue = [...list]
    const failed: string[] = []
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        try { await uploader(f) } catch { failed.push(f.name) }
      }
    })
    await Promise.all(workers)
    return failed
  }

  const handleIngestFile = async () => {
    if (files.length === 0) {
      showMessage('error', 'Please select at least one file')
      return
    }
    setLoading(true)
    try {
      const failed = await uploadAll(files, (f) => ingestFile(f, 'default', useMarker))
      if (failed.length) showMessage('error', `Failed: ${failed.join(', ')}`)
      else showMessage('success', `${files.length} file(s) queued for ingestion. Will appear in the list shortly.`)
      setFiles([])
      setUseMarker(false)
      loadHistory(true)
      setTimeout(() => loadHistory(true), 1000)
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
      loadHistory(true)
      setTimeout(() => loadHistory(true), 500)
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
      showMessage('success', 'YouTube video queued for transcription. Will appear shortly.')
      setUrl('')
      loadHistory(true)
      setTimeout(() => loadHistory(true), 1500)
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
      showMessage('success', 'Web page queued for ingestion. Will appear shortly.')
      setUrl('')
      loadHistory(true)
      setTimeout(() => loadHistory(true), 1500)
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
      showMessage('success', `${type.charAt(0).toUpperCase() + type.slice(1)} queued for transcription. Will appear shortly.`)
      setUrl('')
      loadHistory(true)
      setTimeout(() => loadHistory(true), 1500)
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : `${type} ingestion failed`)
    } finally {
      setLoading(false)
    }
  }

  const handleIngestAudioFile = async () => {
    if (audioFiles.length === 0) {
      showMessage('error', 'Please select at least one audio file')
      return
    }
    setLoading(true)
    try {
      const failed = await uploadAll(audioFiles, (f) => ingestAudioFile(f))
      if (failed.length) showMessage('error', `Failed: ${failed.join(', ')}`)
      else showMessage('success', `${audioFiles.length} audio file(s) queued for transcription. Will appear shortly.`)
      setAudioFiles([])
      loadHistory(true)
      setTimeout(() => loadHistory(true), 1500)
    } finally {
      setLoading(false)
    }
  }

  const handleIngestVideoFile = async () => {
    if (videoFiles.length === 0) {
      showMessage('error', 'Please select at least one video file')
      return
    }
    setLoading(true)
    try {
      // Cap of 2 for videos — they can be hundreds of MB each
      const failed = await uploadAll(videoFiles, (f) => ingestVideoFile(f), 2)
      if (failed.length) showMessage('error', `Failed: ${failed.join(', ')}`)
      else showMessage('success', `${videoFiles.length} video(s) queued for transcription. Will appear shortly.`)
      setVideoFiles([])
      loadHistory(true)
      setTimeout(() => loadHistory(true), 1500)
    } finally {
      setLoading(false)
    }
  }

  const [converting, setConverting] = useState(false)

  const handleConvertToExcel = async () => {
    if (imageFiles.length !== 1) {
      showMessage('error', 'Select exactly one image to convert to Excel')
      return
    }
    setConverting(true)
    try {
      await convertImageToExcel(imageFiles[0])
      showMessage('success', 'Excel file downloaded.')
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setConverting(false)
    }
  }

  const handleIngestImage = async () => {
    if (imageFiles.length === 0) {
      showMessage('error', 'Please select at least one image file')
      return
    }
    setLoading(true)
    try {
      const failed = await uploadAll(imageFiles, (f) => ingestImage(f))
      if (failed.length) showMessage('error', `Failed: ${failed.join(', ')}`)
      else showMessage('success', `${imageFiles.length} image(s) queued for vision extraction. Will appear shortly.`)
      setImageFiles([])
      loadHistory(true)
      setTimeout(() => loadHistory(true), 2000)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (ingestId: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    try {
      await deleteIngest(ingestId)
      showMessage('success', 'Deleted successfully')
      loadHistory(true)
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleRetry = async (ingestId: string, name: string) => {
    try {
      await retryIngest(ingestId)
      showMessage('success', `Retrying extraction for "${name}"…`)
      loadHistory(true)
      setTimeout(() => loadHistory(true), 3000)
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Retry failed')
    }
  }

  const handleCancel = async (ingestId: string, name: string) => {
    try {
      await cancelIngest(ingestId)
      showMessage('success', `Cancelling "${name}"…`)
      loadHistory(true)
      setTimeout(() => loadHistory(true), 2000)
    } catch (e) {
      showMessage('error', e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
    if (dropped.length) setFiles(dropped)
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
          {(Object.entries(TAB_CONFIG) as [TabType, typeof TAB_CONFIG[TabType]][]).map(([tab, config]) => {
            const count = (history.by_type[tab] || []).length
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <config.icon className="w-4 h-4" />
                {config.label}
                {count > 0 && (
                  <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-xs font-bold ${
                    activeTab === tab ? 'bg-white text-brand-600' : 'bg-brand-600 text-white'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
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
                    <input ref={inputRef} type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} accept=".pdf,.docx,.doc,.txt,.md,.csv,.pptx,.ppt,.xlsx,.xls,.xlsm,.json,.geojson,.gjson" className="hidden" />
                    <Upload className="w-5 h-5 mx-auto mb-2 text-gray-400" />
                    <span className="text-xs">{files.length === 0 ? 'Click or drop files' : files.length === 1 ? files[0].name : `${files.length} files selected`}</span>
                  </div>
                  <label className="flex items-start gap-2 mb-3 cursor-pointer select-none">
                    <input type="checkbox" checked={useMarker} onChange={(e) => setUseMarker(e.target.checked)} className="mt-0.5" />
                    <span className="text-xs text-gray-600">
                      Process as STEM document (Marker)
                      <span className="block text-[11px] text-gray-400">
                        For scientific PDFs with formulas/equations. Slower (~2–5 min) but preserves math as LaTeX.
                      </span>
                    </span>
                  </label>
                  <button onClick={handleIngestFile} disabled={loading || files.length === 0} className="btn-primary w-full text-sm">
                    {loading ? 'Uploading…' : files.length > 1 ? `Upload ${files.length} Files` : 'Upload'}
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
                  <div>
                    <p className="text-xs text-gray-600 mb-2 font-medium">Upload File</p>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 mb-2 cursor-pointer hover:border-brand-600 transition-colors" onClick={() => audioInputRef.current?.click()}>
                      <input ref={audioInputRef} type="file" multiple onChange={(e) => setAudioFiles(Array.from(e.target.files || []))} accept=".mp3,.wav,.m4a,.aac,.flac,.ogg" className="hidden" />
                      <Upload className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                      <span className="text-xs">{audioFiles.length === 0 ? 'Click to select' : audioFiles.length === 1 ? audioFiles[0].name : `${audioFiles.length} files selected`}</span>
                    </div>
                    <button onClick={handleIngestAudioFile} disabled={loading || audioFiles.length === 0} className="btn-primary w-full text-sm">
                      {loading ? 'Uploading…' : audioFiles.length > 1 ? `Upload ${audioFiles.length} Audio Files` : 'Upload Audio'}
                    </button>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-600 mb-2 font-medium">Or Use URL</p>
                    <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/audio.mp3" className="input w-full text-sm mb-2" />
                    <button onClick={() => handleIngestMedia('audio')} disabled={loading || !url.trim()} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {loading ? 'Processing…' : 'Add from URL'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'video' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-600 mb-2 font-medium">Upload File</p>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 mb-2 cursor-pointer hover:border-brand-600 transition-colors" onClick={() => videoInputRef.current?.click()}>
                      <input ref={videoInputRef} type="file" multiple onChange={(e) => setVideoFiles(Array.from(e.target.files || []))} accept=".mp4,.webm,.avi,.mov,.mkv,.flv,.m4v,.3gp" className="hidden" />
                      <Upload className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                      <span className="text-xs">{videoFiles.length === 0 ? 'Click to select' : videoFiles.length === 1 ? videoFiles[0].name : `${videoFiles.length} files selected`}</span>
                    </div>
                    <button onClick={handleIngestVideoFile} disabled={loading || videoFiles.length === 0} className="btn-primary w-full text-sm">
                      {loading ? 'Uploading…' : videoFiles.length > 1 ? `Upload ${videoFiles.length} Videos` : 'Upload Video'}
                    </button>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-600 mb-2 font-medium">Or Use URL</p>
                    <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/video.mp4" className="input w-full text-sm mb-2" />
                    <button onClick={() => handleIngestMedia('video')} disabled={loading || !url.trim()} className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {loading ? 'Processing…' : 'Add from URL'}
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'images' && (
                <div className="space-y-3">
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-brand-600 transition-colors"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <input
                      ref={imageInputRef}
                      type="file"
                      multiple
                      onChange={(e) => setImageFiles(Array.from(e.target.files || []))}
                      accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff"
                      className="hidden"
                    />
                    <Image className="w-6 h-6 mx-auto mb-2 text-gray-400" />
                    <span className="text-xs text-gray-600 block">{imageFiles.length === 0 ? 'Click to select images' : imageFiles.length === 1 ? imageFiles[0].name : `${imageFiles.length} images selected`}</span>
                    <span className="text-xs text-gray-400 mt-1 block">PNG, JPG, GIF, WebP, BMP, TIFF</span>
                  </div>
                  {imageFiles.length > 0 && (
                    <p className="text-xs text-gray-500 bg-blue-50 border border-blue-200 rounded p-2">
                      Claude Vision will extract all text and describe any diagrams or flowcharts in {imageFiles.length === 1 ? 'this image' : 'these images'}.
                    </p>
                  )}
                  <button onClick={handleIngestImage} disabled={loading || imageFiles.length === 0} className="btn-primary w-full text-sm">
                    {loading ? 'Extracting…' : imageFiles.length > 1 ? `Extract & Ingest ${imageFiles.length} Images` : 'Extract & Ingest'}
                  </button>
                  <button
                    onClick={handleConvertToExcel}
                    disabled={converting || imageFiles.length !== 1}
                    title={imageFiles.length > 1 ? 'Select a single image to convert' : 'Convert a table photo/screenshot to a downloadable .xlsx'}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {converting ? 'Converting…' : 'Convert Table to Excel (.xlsx)'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* History Section */}
          <div className="lg:col-span-2">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-900">{TAB_CONFIG[activeTab].label} ({currentItems.length})</h2>
                <button
                  onClick={() => loadHistory()}
                  disabled={historyLoading}
                  className="p-1 text-gray-500 hover:text-brand-600 transition-colors disabled:opacity-50"
                  title="Refresh history"
                >
                  <RefreshCw className={`w-4 h-4 ${historyLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Image query hint */}
              {activeTab === 'images' && currentItems.length > 0 && (
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">
                    <span className="font-semibold">Tip:</span> Ask about the <span className="font-semibold">content</span>, not the filename.
                    E.g. <em>"What is the invoice total?"</em> or <em>"List all line items in the invoice"</em> — not <em>"Tell me about invoice_1.jpg"</em>.
                  </p>
                </div>
              )}

              {historyLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader className="w-5 h-5 animate-spin text-brand-600" />
                </div>
              ) : currentItems.length === 0 ? (
                <p className="text-sm text-gray-500">No {TAB_CONFIG[activeTab].label.toLowerCase()} ingested yet</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {currentItems.map((item: any) => {
                    const status = item.status || 'done'
                    const isFailed = status === 'failed'
                    const isProcessing = status === 'processing'
                    const progress = item.progress ?? 0
                    const progressLabel = item.progress_label || 'Processing…'
                    return (
                      <div key={item.ingest_id} className={`p-3 rounded-lg transition-colors ${isFailed ? 'bg-red-50 border border-red-200' : 'bg-gray-50 hover:bg-gray-100'}`}>
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              <span className="text-xs text-gray-500">{formatDate(item.created_at)}</span>
                              {item.size_bytes && <span className="text-xs text-gray-500">{formatBytes(item.size_bytes)}</span>}
                              {item.chunks > 0 && (
                                <span className="text-xs text-brand-600 font-medium">{item.chunks} chunks</span>
                              )}
                              {isFailed && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                                  <AlertCircle className="w-3 h-3" /> Failed
                                </span>
                              )}
                              {status === 'done' && item.chunks > 0 && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                  <CheckCircle className="w-3 h-3" /> Ready
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2 shrink-0">
                            {isProcessing && (
                              <button
                                onClick={() => handleCancel(item.ingest_id, item.name)}
                                className="p-1 text-orange-500 hover:text-orange-700 transition-colors"
                                title="Cancel ingestion"
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                            {(isFailed || (item.chunks === 0 && !isProcessing)) &&
                              ['documents', 'images', 'video', 'audio', 'weblinks'].includes(activeTab) && (
                              <button
                                onClick={() => handleRetry(item.ingest_id, item.name)}
                                className="p-1 text-blue-500 hover:text-blue-700 transition-colors"
                                title="Retry extraction"
                              >
                                <RotateCcw className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => handleDelete(item.ingest_id, item.name)} className="p-1 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Progress bar — visible only while processing */}
                        {isProcessing && (
                          <div className="mt-2 px-0.5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-500 truncate pr-2">{progressLabel}</span>
                              <span className="text-xs font-semibold text-brand-600 shrink-0">{progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500 ease-out"
                                style={{
                                  width: `${progress > 0 ? progress : 8}%`,
                                  background: 'linear-gradient(90deg, #4f46e5, #7c3aed)',
                                  animation: progress === 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
