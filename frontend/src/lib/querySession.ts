import { createAsyncSessionStore } from './sessionStore'
import type { QueryResponse } from '@/types'
import type { EvalResponse } from './api'

// Persistent sessions so an in-progress answer / evaluation survives navigating
// to another page and back (mirrors how Ingest keeps its progress).
export const queryStore = createAsyncSessionStore<QueryResponse>()
export const evalStore = createAsyncSessionStore<EvalResponse>()
