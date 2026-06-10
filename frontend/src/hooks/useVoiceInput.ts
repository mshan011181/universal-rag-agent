'use client'

/**
 * useVoiceInput — browser Speech Recognition hook (Web Speech API).
 *
 * Works in Chrome, Edge, and Safari 17+. Firefox does not support it natively.
 * No external dependencies or API keys required — runs fully in the browser.
 *
 * Usage:
 *   const { listening, supported, startListening, stopListening, error } = useVoiceInput({
 *     onResult: (transcript) => setQuery(prev => prev + transcript),
 *   })
 */

import { useState, useRef, useCallback, useEffect } from 'react'

interface UseVoiceInputOptions {
  /** Called with the final transcript text when speech ends */
  onResult: (transcript: string) => void
  /** BCP-47 language tag, e.g. 'en-US'. Defaults to browser language. */
  lang?: string
}

interface UseVoiceInputReturn {
  listening: boolean
  supported: boolean
  error: string
  startListening: () => void
  stopListening: () => void
}

// Browser type shim for SpeechRecognition (not in TS lib yet)
type SpeechRecognitionType = {
  new (): SpeechRecognitionInstance
}
interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList
}
interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}
interface SpeechRecognitionResult {
  isFinal: boolean
  [index: number]: { transcript: string }
}
interface SpeechRecognitionErrorEvent {
  error: string
}

function getSpeechRecognition(): SpeechRecognitionType | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function useVoiceInput({ onResult, lang }: UseVoiceInputOptions): UseVoiceInputReturn {
  const [listening, setListening] = useState(false)
  const [error, setError]         = useState('')
  const [supported, setSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const interimRef     = useRef('')

  useEffect(() => {
    // Check both: Speech API available AND at least one microphone connected
    if (!getSpeechRecognition()) { setSupported(false); return }
    if (!navigator.mediaDevices?.enumerateDevices) { setSupported(true); return }
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const hasMic = devices.some(d => d.kind === 'audioinput')
      setSupported(hasMic)
    }).catch(() => setSupported(true)) // fallback: show button, let browser handle it
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Use Chrome or Edge.')
      return
    }
    setError('')
    interimRef.current = ''

    const rec = new SpeechRecognition()
    rec.lang            = lang || navigator.language || 'en-US'
    rec.continuous      = true   // keep listening until user clicks stop
    rec.interimResults  = true   // show partial results while speaking

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      let final   = ''
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          final += r[0].transcript
        } else {
          interim += r[0].transcript
        }
      }
      interimRef.current = interim
      if (final) {
        onResult(final)
      }
    }

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'not-allowed') {
        setError('Microphone access denied. Allow microphone in browser settings.')
      } else if (e.error === 'no-speech') {
        setError('No speech detected. Try again.')
      } else {
        setError(`Speech error: ${e.error}`)
      }
      setListening(false)
    }

    rec.onend = () => {
      setListening(false)
    }

    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }, [lang, onResult])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.abort() }
  }, [])

  return { listening, supported, error, startListening, stopListening }
}
