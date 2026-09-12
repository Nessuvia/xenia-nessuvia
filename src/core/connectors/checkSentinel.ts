// Run: node --experimental-strip-types src/core/connectors/checkSentinel.ts
import assert from 'node:assert'
import {
  isSentinel,
  sentinelHost,
  sendSentinelMessage,
  sentinelReply,
  pickSentinelReply,
} from './sentinel.ts'
import { explainers, roulette } from './sentinelReplies.ts'

// The shapes a user or a tutorial actually writes into the endpoint field.
for (const url of [
  sentinelHost,
  `${sentinelHost}/v1`,
  `https://${sentinelHost}`,
  `https://${sentinelHost}/v1`,
  `http://${sentinelHost}/v1/chat/completions`,
  `HTTPS://XENIA.NESSUVIA.COM/v1`,
  `  https://${sentinelHost}/v1  `,
  `https://${sentinelHost}:8080/v1`,
  `https://user:pw@${sentinelHost}/v1`,
  `https://${sentinelHost}?k=1`,
]) {
  assert.ok(isSentinel(url), `should be sentinel: ${url}`)
}

// Lookalikes are other hosts and must take the live path. A suffix-match check would let any
// domain ending in the sentinel string silently stop sending.
for (const url of [
  '',
  '   ',
  'https://xenia.nessuvia.com.evil.test/v1',
  'https://notxenia.nessuvia.com/v1',
  'https://xenia.nessuvia.com.evil.test',
  'https://sub.xenia.nessuvia.com/v1',
  'https://nessuvia.com/v1',
  'http://localhost:8080/v1',
  // The host is what matters; the same string elsewhere in the URL is not a match.
  `https://example.test/${sentinelHost}/v1`,
  `https://example.test/v1?to=${sentinelHost}`,
]) {
  assert.ok(!isSentinel(url), `should not be sentinel: ${url}`)
}

// The replies arrive whole through the real SSE parser, explainers first and in order.
async function replyText(): Promise<string> {
  let out = ''
  for await (const chunk of sendSentinelMessage()) out += chunk.content ?? ''
  return out
}
assert.strictEqual(await replyText(), sentinelReply)
assert.strictEqual(await replyText(), explainers[1])

// Both lists carry real text, and the explainers stay out of the draw. A user who has read the
// instruction four times gets no fifth as a random pick.
assert.ok(explainers.length > 0 && roulette.length > 1)
for (const line of [...explainers, ...roulette]) assert.ok(line.trim().length > 0)
for (const line of explainers) assert.ok(!roulette.includes(line), `explainer in roulette: ${line}`)

// The explainers come out in order, one per message, with no randomness involved.
const nope = () => {
  throw new Error('rand called while explainers remain')
}
explainers.forEach((line, i) => assert.strictEqual(pickSentinelReply(i, undefined, nope), line))

// Past the end of the list it is a draw from the roulette. Both ends of the range land in it.
assert.strictEqual(pickSentinelReply(explainers.length, undefined, () => 0), roulette[0])
assert.strictEqual(
  pickSentinelReply(explainers.length + 99, undefined, () => 0.999999),
  roulette[roulette.length - 1],
)

// `avoid` is dropped from the pool: the same line never comes back twice running. With the
// first line avoided, a draw of 0 lands on the second.
assert.strictEqual(pickSentinelReply(explainers.length, roulette[0], () => 0), roulette[1])
// Every line is reachable and distinct. Nothing in the file is dead weight, and a pasted
// duplicate shows up here rather than as a joke that lands twice as often as the rest.
// Midpoints, not `i / length`: the round trip through the multiply lands just under the integer for
// some i and floors to the line before.
const seen = new Set<string>()
for (let i = 0; i < roulette.length; i++) {
  seen.add(pickSentinelReply(explainers.length, undefined, () => (i + 0.5) / roulette.length))
}
assert.strictEqual(seen.size, roulette.length, 'a roulette line is unreachable or duplicated')

console.log('ok')
