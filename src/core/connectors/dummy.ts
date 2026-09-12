// Extension-ful imports on purpose: checkSentinel.ts pulls this in through sentinel.ts under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { ChatMessage, StreamChunk } from './connectorInterface.ts'
import { parseSse } from './connectorInterface.ts'

// the word pool is the whole library. `lorem-ipsum` and `faker` both do this, and
// neither is worth a dependency for three lines.
const pool =
  `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut
   labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris
   nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse
   cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui
   officia deserunt mollit anim id est laborum`.split(/\s+/)

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

const cap = (w: string) => `${w[0].toUpperCase()}${w.slice(1)}`

/** `count` words split into sentences of 6–12 words, each capitalised and full-stopped. */
function loremWords(count: number): string {
  const words = Array.from({ length: count }, () => pick(pool))
  const out: string[] = []
  for (let i = 0; i < words.length; ) {
    const len = Math.min(6 + Math.floor(Math.random() * 7), words.length - i)
    const sentence = words.slice(i, i + len)
    out.push(`${cap(sentence[0])} ${sentence.slice(1).join(' ')}.`)
    i += len
  }
  return out.join(' ')
}

/** A different reply every time: alternates stay distinguishable from each other. */
function lorem(): string {
  return loremWords(20 + Math.floor(Math.random() * 40))
}

/**
 * Debug-only keyword responses. The last user message picks a canned shape so streaming/rendering
 * paths are easy to exercise. First match wins; they don't combine.
 */
function debugReply(userText: string): string {
  const t = userText.toLowerCase()
  // `tag:name` wraps lorem in that tag: `tag:abcd` -> <abcd>lorem</abcd>ipsum.
  const tag = t.match(/tag:([a-z0-9]+)/)
  if (tag) return `<${tag[1]}>${loremWords(20)}</${tag[1]}>${loremWords(40)}`
  if (t.includes('format')) {
    const w = loremWords
    // One of each nesting case: every combination of markers has something to render.
    return [
      `${w(6)} *${w(4)}* ${w(4)}`, // italics
      `${w(4)} **${w(4)}** ${w(4)}`, // bold
      `${w(3)} ***${w(4)}*** ${w(3)}`, // bold italics
      `"${w(4)} *${w(3)}* ${w(4)}"`, // italics inside dialogue
      `"${w(4)} **${w(3)}** ${w(4)}"`, // bold inside dialogue
      `"${w(3)} ***${w(3)}*** ${w(3)}"`, // bold italics inside dialogue
      `${w(4)} *"${w(4)}"* ${w(4)}`, // dialogue inside italics
    ].join(' ')
  }
  if (t.includes('short')) return loremWords(30)
  if (t.includes('medium')) return loremWords(60)
  if (t.includes('long')) return loremWords(120)
  return lorem()
}

/** A real SSE body, byte for byte. Debug mode exercises the same parser as a live backend. */
export function loremStream(
  text: string,
  signal?: AbortSignal,
  delayMs = 40,
  wordsPerChunk = 1,
): ReadableStream<BufferSource> {
  const encoder = new TextEncoder()
  const words = text.split(' ')
  let at = 0

  return new ReadableStream({
    async pull(controller) {
      if (signal?.aborted || at >= words.length) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
        return
      }
      // A batch of words per SSE event, at roughly the pace of a hosted model.
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const batch = words.slice(at, at + wordsPerChunk)
      const delta = (at === 0 ? '' : ' ') + batch.join(' ')
      at += batch.length
      const chunk = { choices: [{ delta: { content: delta } }] }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
    },
  })
}

/** Reasoning words as `reasoning_content` deltas, then the reply, same wire format as a live model. */
function reasoningStream(
  reasoning: string,
  reply: string,
  signal?: AbortSignal,
  delayMs = 40,
): ReadableStream<BufferSource> {
  const encoder = new TextEncoder()
  const think = reasoning.split(' ')
  const words = reply.split(' ')
  let at = 0

  return new ReadableStream({
    async pull(controller) {
      if (signal?.aborted || at >= think.length + words.length) {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      const inThink = at < think.length
      const word = inThink ? think[at] : words[at - think.length]
      const first = inThink ? at === 0 : at === think.length
      const text = (first ? '' : ' ') + word
      const delta = inThink ? { reasoning_content: text } : { content: text }
      at += 1
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`))
    },
  })
}

/** Debug mode's stand-in for a backend. Nothing leaves the browser and no key is needed. */
export async function* sendDummyMessage(
  messages: ChatMessage[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  if (lastUser.toLowerCase().includes('think')) {
    // Reasoning then reply, to exercise the reasoning-capture path. A few paragraphs' worth,
    // a substantial block rather than a single line.
    yield* parseSse(reasoningStream(loremWords(80), debugReply(lastUser), signal))
    return
  }
  if (lastUser.toLowerCase().includes('nostream')) {
    // The whole reply at once after a pause, to exercise the non-streaming path.
    await new Promise((resolve) => setTimeout(resolve, 3000))
    if (!signal?.aborted) yield { content: lorem() }
    return
  }
  if (lastUser.toLowerCase().includes('fast')) {
    // 200 words at half the usual per-word delay.
    yield* parseSse(loremStream(loremWords(200), signal, 20))
    return
  }
  if (lastUser.toLowerCase().includes('chunk')) {
    // Several words per SSE event, like a backend that batches tokens.
    yield* parseSse(loremStream(loremWords(80), signal, 120, 8))
    return
  }
  yield* parseSse(loremStream(debugReply(lastUser), signal))
}
