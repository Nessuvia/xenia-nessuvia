import type { Message } from '../storage/types'
import { defaultTokenizer, tokenizerDef, type ResolvedTokenizerId } from './tokenizers.ts'
import { readVocab } from './tokenizerCache.ts'

// A BPE table is big. It loads on demand and never touches first paint. For the tiktoken
// families the single-encoding entrypoint matters: the package root bundles every encoding it
// ships and doubles the chunk.
//
// Two phases on purpose: loading is async, counting is not. countTokens runs inside trim loops and
// straight in JSX, and none of that can await.
let count: ((text: string) => number) | null = null
const counters = new Map<ResolvedTokenizerId, (text: string) => number>()

async function buildCounter(id: ResolvedTokenizerId) {
  const def = tokenizerDef(id)
  try {
    if (def.kind === 'tiktoken') {
      // Static specifiers: Vite needs both chunks visible. A computed path would bundle nothing.
      // Only o200k_base is precached; offline, cl100k_base fails here and falls back like the
      // undownloaded families do.
      const mod =
        id === 'cl100k_base'
          ? await import('gpt-tokenizer/encoding/cl100k_base')
          : await import('gpt-tokenizer/encoding/o200k_base')
      return mod.countTokens
    }
    // Never downloads a vocab: an hf family the user hasn't fetched stays unavailable and the
    // caller falls back. Downloading is only ever the button in the connection editor.
    const vocab = await readVocab(id)
    if (!vocab) return null
    const { TokenizerLoader } = await import('@lenml/tokenizers')
    const tok = TokenizerLoader.fromPreTrained(vocab)
    // Raw text, no chat template and no specials: perMessageOverhead already prices the wrapper.
    return (text: string) => tok.encode(text, { add_special_tokens: false }).length
  } catch {
    // A chunk that won't load or a vocab that won't parse counts as unavailable. Falling back is
    // always better than throwing: this sits in the send path, and a slightly wrong number beats
    // a failed generate.
    return null
  }
}

/**
 * Prepares `id` and points countTokens at it. Falls back to the bundled default when the family
 * needs a download that hasn't happened. This resolves with something usable either way.
 *
 * Concurrent loads of different ids both write `count`, and the last one wins. Every counting site
 * awaits its own load first, and only one connection is active at a time. The worst case is a
 * stale number in a preview, never a wrong prompt. Not worth a lock.
 */
export async function loadTokenizer(id: ResolvedTokenizerId = defaultTokenizer): Promise<void> {
  const cached = counters.get(id)
  if (cached) {
    count = cached
    return
  }
  const built = await buildCounter(id)
  if (!built) {
    if (id !== defaultTokenizer) await loadTokenizer(defaultTokenizer)
    return
  }
  counters.set(id, built)
  count = built
}

/** Roles and delimiters aren't free: every message costs a little more than its text. */
export const perMessageOverhead = 4

export function countTokens(text: string): number {
  // chars/4 before any table lands. Every caller that shows numbers awaits loadTokenizer.
  return count ? count(text) : Math.ceil(text.length / 4)
}

export function countMessages(messages: { content: string }[]): number {
  return messages.reduce((n, m) => n + countTokens(m.content) + perMessageOverhead, 0)
}

export interface Budget {
  contextLimit: number
  maxTokens: number
  safetyMarginPct: number
}

export interface Trimmed {
  /** A contiguous tail of the input. History is never reordered. */
  messages: Message[]
  /** The messages that didn't fit, oldest first. The preview names them, not just counts them. */
  dropped: Message[]
  droppedCount: number
  available: number
  /** Context can't even hold the system prompt plus the reply reserve. */
  overflow: boolean
}

/** Keeps the newest history that fits, dropping the rest from the top. */
export function trimHistory(messages: Message[], fixedTokens: number, budget: Budget): Trimmed {
  const margin = (budget.contextLimit * budget.safetyMarginPct) / 100
  const available = Math.floor(budget.contextLimit - fixedTokens - budget.maxTokens - margin)

  if (available <= 0) {
    return { messages: [], dropped: messages, droppedCount: messages.length, available, overflow: true }
  }

  let used = 0
  let keepFrom = messages.length
  for (let i = messages.length - 1; i >= 0; i--) {
    const cost = countTokens(messages[i].content) + perMessageOverhead
    // One message bigger than the whole allowance keeps nothing; no mid-message truncation yet.
    if (used + cost > available) break
    used += cost
    keepFrom = i
  }

  return {
    messages: messages.slice(keepFrom),
    dropped: messages.slice(0, keepFrom),
    droppedCount: keepFrom,
    available,
    overflow: false,
  }
}
