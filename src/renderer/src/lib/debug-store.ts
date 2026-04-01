import type { RequestDebugInfo } from './api/types'

export interface RequestTraceInfo {
  debugInfo?: RequestDebugInfo
  providerId?: string
  providerBuiltinId?: string
  model?: string
}

const MAX_DEBUG_STORE_ENTRIES = 80
const MAX_DEBUG_BODY_CHARS = 2_000

/**
 * Lightweight in-memory store for per-message request metadata.
 * Not persisted, not in Zustand — avoids bloating chat store and DB.
 * Capped at MAX_DEBUG_STORE_ENTRIES to prevent unbounded growth.
 */
const _store = new Map<string, RequestTraceInfo>()
const _insertionOrder: string[] = []

function evictOldest(): void {
  while (_insertionOrder.length > MAX_DEBUG_STORE_ENTRIES) {
    const oldest = _insertionOrder.shift()
    if (oldest) _store.delete(oldest)
  }
}

function stripLargeBody(info: RequestDebugInfo): RequestDebugInfo {
  if (!info.body || info.body.length <= MAX_DEBUG_BODY_CHARS) return info
  return {
    ...info,
    body: `${info.body.slice(0, MAX_DEBUG_BODY_CHARS)}\n... [truncated, ${info.body.length} chars total]`
  }
}

export function setRequestTraceInfo(msgId: string, patch: Partial<RequestTraceInfo>): void {
  const isNew = !_store.has(msgId)
  const current = _store.get(msgId) ?? {}
  _store.set(msgId, { ...current, ...patch })
  if (isNew) {
    _insertionOrder.push(msgId)
    evictOldest()
  }
}

export function getRequestTraceInfo(msgId: string): RequestTraceInfo | undefined {
  return _store.get(msgId)
}

export function setLastDebugInfo(msgId: string, info: RequestDebugInfo): void {
  setRequestTraceInfo(msgId, { debugInfo: stripLargeBody(info) })
}

export function getLastDebugInfo(msgId: string): RequestDebugInfo | undefined {
  return _store.get(msgId)?.debugInfo
}

export function clearDebugStoreForSession(messageIds: string[]): void {
  for (const id of messageIds) {
    _store.delete(id)
  }
  const idSet = new Set(messageIds)
  const len = _insertionOrder.length
  for (let i = len - 1; i >= 0; i--) {
    if (idSet.has(_insertionOrder[i])) _insertionOrder.splice(i, 1)
  }
}
