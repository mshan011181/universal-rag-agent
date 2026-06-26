import { useSyncExternalStore } from 'react'

/**
 * A tiny module-level async store that SURVIVES route changes.
 *
 * React component state is lost when you navigate away (the page unmounts), so
 * an in-flight query/evaluation and its result disappear. By keeping the state
 * in a module (which Next.js keeps loaded across navigation) and running the
 * async work here, a page can navigate away mid-request and, on return, read
 * the current loading/result/error via useSyncExternalStore — mirroring how the
 * Ingest page survives navigation.
 */
export interface AsyncSessionState<T> {
  loading: boolean
  result: T | null
  error: string
  label: string // e.g. the question being processed (to restore the input)
}

export function createAsyncSessionStore<T>() {
  let state: AsyncSessionState<T> = { loading: false, result: null, error: '', label: '' }
  const listeners = new Set<() => void>()
  let runId = 0
  let controller: AbortController | null = null

  const emit = () => listeners.forEach((l) => l())

  function subscribe(l: () => void) {
    listeners.add(l)
    return () => { listeners.delete(l) }
  }
  function getSnapshot() { return state }

  // fetcher receives an AbortSignal so the underlying request can be cancelled.
  async function run(label: string, fetcher: (signal: AbortSignal) => Promise<T>) {
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal
    const id = ++runId
    state = { loading: true, result: null, error: '', label }
    emit()
    try {
      const res = await fetcher(signal)
      if (id !== runId) return // a newer run / cancel superseded this one
      state = { loading: false, result: res, error: '', label }
    } catch (e) {
      if (id !== runId) return // cancelled or superseded — don't overwrite
      if ((e as { name?: string })?.name === 'AbortError') {
        state = { loading: false, result: null, error: '', label: '' }
      } else {
        state = { loading: false, result: null, error: e instanceof Error ? e.message : 'Request failed', label }
      }
    }
    emit()
  }

  // Cancel an in-flight run and clear the session.
  function cancel() {
    controller?.abort()
    controller = null
    runId++ // invalidate the in-flight run so its result can't land
    state = { loading: false, result: null, error: '', label: '' }
    emit()
  }

  function reset() {
    controller?.abort()
    controller = null
    runId++ // cancel any in-flight run's result from landing
    state = { loading: false, result: null, error: '', label: '' }
    emit()
  }

  /** React hook — re-renders the component whenever the store changes. */
  function useSession(): AsyncSessionState<T> {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }

  return { run, reset, cancel, getSnapshot, useSession }
}
