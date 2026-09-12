// Run: node --experimental-strip-types src/core/prompt/checkBudget.ts
import assert from 'node:assert'
import type { Message } from '../storage/types'
import { countTokens, loadTokenizer, perMessageOverhead, trimHistory } from './budget.ts'

// Real token counts: the arithmetic here is the arithmetic the app does.
await loadTokenizer()

let id = 0
function message(content: string): Message {
  return { id: ++id, ownerId: 'local', chatId: 1, role: 'user', content, createdAt: id }
}

const cost = (m: Message) => countTokens(m.content) + perMessageOverhead
const budget = { contextLimit: 1000, maxTokens: 0, safetyMarginPct: 0 }

// --- a short history fits ---------------------------------------
{
  const history = [message('one'), message('two'), message('three')]
  const out = trimHistory(history, 0, budget)
  assert.deepStrictEqual(out.messages, history)
  assert.strictEqual(out.droppedCount, 0)
  assert.strictEqual(out.overflow, false)
}

// --- a long history trims from the top, newest always kept ---------------
{
  const history = Array.from({ length: 200 }, (_, i) => message(`message number ${i}`))
  const out = trimHistory(history, 0, budget)
  assert.ok(out.messages.length > 0 && out.messages.length < history.length)
  assert.strictEqual(out.messages.at(-1), history.at(-1))
  assert.strictEqual(out.droppedCount, history.length - out.messages.length)
  // The kept slice is a contiguous tail. Order is never touched.
  assert.deepStrictEqual(out.messages, history.slice(out.droppedCount))
}

// --- the reply reserve is subtracted -------------------------------------
{
  const history = [message('alpha beta'), message('gamma delta')]
  const total = history.reduce((n, m) => n + cost(m), 0)
  // Fits with nothing reserved...
  assert.strictEqual(trimHistory(history, 0, { ...budget, contextLimit: total }).droppedCount, 0)
  // ...but not once the reply needs room.
  const reserved = trimHistory(history, 0, { ...budget, contextLimit: total, maxTokens: cost(history[0]) })
  assert.strictEqual(reserved.droppedCount, 1)
  assert.deepStrictEqual(reserved.messages, [history[1]])
}

// --- safetyMarginPct is applied ------------------------------------------
{
  const history = [message('alpha beta'), message('gamma delta')]
  const total = history.reduce((n, m) => n + cost(m), 0)
  const out = trimHistory(history, 0, { ...budget, contextLimit: total, safetyMarginPct: 50 })
  assert.ok(out.available < total)
  assert.strictEqual(out.droppedCount, 1)
}

// --- available <= 0 → history is dropped and the overflow flag is set ----
{
  const history = [message('alpha'), message('beta')]
  const out = trimHistory(history, 500, { ...budget, contextLimit: 256, maxTokens: 512 })
  assert.deepStrictEqual(out.messages, [])
  assert.strictEqual(out.droppedCount, 2)
  assert.strictEqual(out.overflow, true)
  assert.ok(out.available <= 0)
}

// --- one oversized message → nothing kept, no throw ---------------------
{
  const history = [message('word '.repeat(500))]
  const out = trimHistory(history, 0, { ...budget, contextLimit: 100 })
  assert.deepStrictEqual(out.messages, [])
  assert.strictEqual(out.droppedCount, 1)
  assert.strictEqual(out.overflow, false) // there was room, the message was just too big
}

// --- an empty history is not a special case ------------------------------
{
  const out = trimHistory([], 0, budget)
  assert.deepStrictEqual(out.messages, [])
  assert.strictEqual(out.droppedCount, 0)
}

console.log('ok')
