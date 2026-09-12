export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** One delta from the stream: reply text, reasoning text, or (usually) one of the two. */
export interface StreamChunk {
  content?: string
  reasoning?: string
  /**
   * Why the server stopped, from the final frame. 'length' means max_tokens cut the reply off
   * mid-sentence: without this a truncated reply is indistinguishable from a finished one.
   */
  finishReason?: string
}

// every backend here speaks the OpenAI /chat/completions SSE dialect, so the
// stream parsing lives here once. Split it if a backend ever needs a different wire format.
export async function* parseSse(body: ReadableStream<BufferSource>): AsyncGenerator<StreamChunk> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  // One SSE event's `data:` lines. Shared by the streaming loop and the end-of-stream flush.
  function* handle(event: string): Generator<StreamChunk> {
    for (const line of event.split('\n')) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]' || !data) continue
      const choice = JSON.parse(data).choices?.[0]
      if (!choice) continue
      const delta = choice.delta
      // Reasoning field name isn't standardised: DeepSeek/llama.cpp use reasoning_content,
      // OpenRouter uses reasoning. Reasoning arrives before content, so yield it first.
      const reasoning = delta?.reasoning_content ?? delta?.reasoning
      if (reasoning) yield { reasoning }
      if (delta?.content) yield { content: delta.content }
      // /completions frames carry the text on the choice itself, with no delta at all. Same SSE
      // envelope, same finish_reason, one different field.
      else if (typeof choice.text === 'string' && choice.text) yield { content: choice.text }
      // The last frame usually carries finish_reason with an empty delta, so it's read off the
      // choice rather than the delta.
      if (choice.finish_reason) yield { finishReason: choice.finish_reason }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    // Normalise CRLF so the event boundary is always '\n\n'. llama.cpp and other httplib-based
    // servers frame events with '\r\n\r\n'; raw CR/LF only appear as framing, never inside the
    // JSON payload (those are escaped), so stripping them is safe.
    buffer += value.replace(/\r\n/g, '\n')

    // SSE events are separated by a blank line; a chunk may split mid-event.
    let cut: number
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      yield* handle(event)
    }
  }

  // A server that closes without a trailing blank line leaves the last event in the buffer.
  yield* handle(buffer)
}
