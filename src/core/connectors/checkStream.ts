// Self-check for the SSE parser. Run: node --experimental-strip-types src/core/connectors/checkStream.ts
import assert from 'node:assert'
import { parseSse } from './connectorInterface.ts'

function sse(chunks: string[]) {
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk))
      c.close()
    },
  })
}

const delta = (t: string) => `data: {"choices":[{"delta":{"content":"${t}"}}]}\n\n`

// Split mid-event on purpose: the parser must buffer across reads.
const wire = (delta('Hel') + delta('lo') + 'data: [DONE]\n\n').match(/.{1,7}/gs)!

const out: string[] = []
for await (const chunk of parseSse(sse(wire))) {
  if (chunk.content) out.push(chunk.content)
}
assert.deepStrictEqual(out, ['Hel', 'lo'])

// reasoning_content lands on the reasoning channel, content on its own; both split mid-event.
{
  const reason = (t: string) => `data: {"choices":[{"delta":{"reasoning_content":"${t}"}}]}\n\n`
  const wire2 = (reason('be') + reason('cause') + delta('ok') + 'data: [DONE]\n\n').match(/.{1,9}/gs)!
  let reasoning = ''
  let content = ''
  for await (const chunk of parseSse(sse(wire2))) {
    if (chunk.reasoning) reasoning += chunk.reasoning
    if (chunk.content) content += chunk.content
  }
  assert.strictEqual(reasoning, 'because')
  assert.strictEqual(content, 'ok')
}

// CRLF-framed events (llama.cpp / httplib) still parse, and a stream that closes without a
// trailing blank line still flushes its last event.
{
  const crlf = 'data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\n'
  const noTrailer = 'data: {"choices":[{"delta":{"content":"b"}}]}' // no blank line, no [DONE]
  const out2: string[] = []
  for await (const chunk of parseSse(sse([crlf + noTrailer]))) {
    if (chunk.content) out2.push(chunk.content)
  }
  assert.deepStrictEqual(out2, ['a', 'b'])
}

// finish_reason rides on the choice, not the delta, and the final frame's delta is empty.
{
  const last = 'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'
  const reasons: string[] = []
  let content = ''
  for await (const chunk of parseSse(sse([delta('hi') + last]))) {
    if (chunk.content) content += chunk.content
    if (chunk.finishReason) reasons.push(chunk.finishReason)
  }
  assert.strictEqual(content, 'hi')
  assert.deepStrictEqual(reasons, ['length'])
}

console.log('ok')

// Anthropic frames: thinking and text deltas, max_tokens maps to 'length'.
{
  const frame = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`
  const wire3 = [
    frame({ type: 'message_start', message: {} }),
    frame({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'hm' } }),
    frame({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'yo' } }),
    frame({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }),
  ].join('').match(/.{1,11}/gs)!
  const got = []
  for await (const chunk of parseSse(sse(wire3))) got.push(chunk)
  assert.deepStrictEqual(got, [{ reasoning: 'hm' }, { content: 'yo' }, { finishReason: 'length' }])
}
