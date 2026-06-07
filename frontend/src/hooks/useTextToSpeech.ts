import { useState, useEffect, useRef, useCallback } from 'react'

export type TTSState = 'idle' | 'playing' | 'paused'

export interface UseTextToSpeechReturn {
  state: TTSState
  supported: boolean
  speed: number
  play: (text: string) => void
  pause: () => void
  resume: () => void
  stop: () => void
  setSpeed: (rate: number) => void
}

export function useTextToSpeech(): UseTextToSpeechReturn {
  const [state, setState] = useState<TTSState>('idle')
  const [speed, setSpeedState] = useState(1)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel()
    }
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    utteranceRef.current = null
    setState('idle')
  }, [supported])

  const play = useCallback((text: string) => {
    if (!supported) return
    window.speechSynthesis.cancel()

    // Strip markdown-style formatting for cleaner speech
    const cleanText = text
      .replace(/#{1,6}\s/g, '')           // headings
      .replace(/\*\*(.*?)\*\*/g, '$1')    // bold
      .replace(/\*(.*?)\*/g, '$1')        // italic
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // code
      .replace(/\|/g, ', ')              // table pipes → pause
      .replace(/\n{2,}/g, '. ')          // paragraph breaks
      .replace(/\n/g, ' ')
      .trim()

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.rate = speed
    utterance.pitch = 1
    utterance.volume = 1

    // Prefer a natural English voice if available
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Enhanced') || v.localService)
    ) || voices.find((v) => v.lang.startsWith('en'))
    if (preferred) utterance.voice = preferred

    utterance.onstart = () => setState('playing')
    utterance.onpause = () => setState('paused')
    utterance.onresume = () => setState('playing')
    utterance.onend = () => { setState('idle'); utteranceRef.current = null }
    utterance.onerror = () => { setState('idle'); utteranceRef.current = null }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    setState('playing')
  }, [supported, speed])

  const pause = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.pause()
    setState('paused')
  }, [supported])

  const resume = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.resume()
    setState('playing')
  }, [supported])

  const setSpeed = useCallback((rate: number) => {
    setSpeedState(rate)
    // If currently playing, restart with new speed
    if (utteranceRef.current && state === 'playing') {
      const text = utteranceRef.current.text
      window.speechSynthesis.cancel()
      setTimeout(() => play(text), 50)
    }
  }, [state, play])

  return { state, supported, speed, play, pause, resume, stop, setSpeed }
}
