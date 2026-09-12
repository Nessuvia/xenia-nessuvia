// Run: node --experimental-strip-types src/core/prompt/checkReasoning.ts
import assert from 'node:assert'
import type { ReasoningConfig } from '../params/paramDef.ts'
import { reasoningSpan, stripReasoning, withoutReasoning } from './reasoning.ts'

const think: ReasoningConfig = {
  prefix: '<think>',
  suffix: '</think>',
  autoParse: true,
  sendBack: false,
}

// --- a plain block is found, and the offsets bracket it exactly ----------
{
  const text = '<think>hmm</think>The answer.'
  const span = reasoningSpan(text, think)!
  assert.ok(span)
  assert.strictEqual(text.slice(span.start, span.end), '<think>hmm</think>')
  assert.strictEqual(text.slice(span.end), 'The answer.')
  assert.strictEqual(withoutReasoning(text, think), 'The answer.')
}

// --- leading whitespace before the marker is allowed ---------------------
{
  const span = reasoningSpan('\n\n  <think>hmm</think>Answer.', think)!
  assert.strictEqual(span.start, 4)
  assert.strictEqual(withoutReasoning('\n\n  <think>hmm</think>Answer.', think), 'Answer.')
}

// --- a marker mid-reply is the model quoting it, not thinking ------------
{
  const text = 'I considered it. <think>later</think> done'
  assert.strictEqual(reasoningSpan(text, think), null)
  assert.strictEqual(withoutReasoning(text, think), text, 'the reply was cut')
}

// --- an unclosed block runs to the end -----------------------------------
{
  const text = '<think>cut off mid thou'
  assert.deepStrictEqual(reasoningSpan(text, think), { start: 0, end: text.length })
  assert.strictEqual(withoutReasoning(text, think), '')
}

// --- no block at all ------------------------------------------------------
{
  assert.strictEqual(reasoningSpan('Just an answer.', think), null)
  assert.strictEqual(withoutReasoning('Just an answer.', think), 'Just an answer.')
}

// --- an empty prefix never matches, so a blank config is inert -----------
{
  const blank: ReasoningConfig = { prefix: '', suffix: '', autoParse: true, sendBack: false }
  assert.strictEqual(reasoningSpan('<think>x</think>y', blank), null)
}

// --- sendBack off drops it at every distance ----------------------------
{
  const text = '<think>hmm</think>Answer.'
  assert.strictEqual(stripReasoning(text, think, 1), 'Answer.')
  assert.strictEqual(stripReasoning(text, think, 12), 'Answer.')
}

// --- sendBack on keeps it, maxSendBack draws the line -------------------
{
  const text = '<think>hmm</think>Answer.'
  const on: ReasoningConfig = { ...think, sendBack: true }
  assert.strictEqual(stripReasoning(text, on, 5), text)
  const capped: ReasoningConfig = { ...on, maxSendBack: 2 }
  assert.strictEqual(stripReasoning(text, capped, 1), text, 'newest turn lost its thinking')
  assert.strictEqual(stripReasoning(text, capped, 2), text)
  assert.strictEqual(stripReasoning(text, capped, 3), 'Answer.', 'an old turn kept its thinking')
}

console.log('ok')
