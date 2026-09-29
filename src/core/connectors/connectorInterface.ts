export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  /**
   * Who said it. Text-completion connections use it to label a turn and to fill `{{char}}` and
   * `{{user}}` inside the instruct sequences; chat connections ignore it. Absent where the speaker
   * isn't a person, which is every system message.
   */
  name?: string
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

// Two SSE dialects: OpenAI's (/chat/completions, /completions) and Anthropic's (/messages).
// Anthropic frames carry a top-level `type`; OpenAI frames carry `choices`.
export async function* parseSse(body: ReadableStream<BufferSource>): AsyncGenerator<StreamChunk> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''

  // One SSE event's `data:` lines. Shared by the streaming loop and the end-of-stream flush.
  function* handle(event: string): Generator<StreamChunk> {
    for (const line of event.split('\n')) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]' || !data) continue
      const frame = JSON.parse(data)
      if (frame.type === 'content_block_delta') {
        if (frame.delta?.thinking) yield { reasoning: frame.delta.thinking }
        if (frame.delta?.text) yield { content: frame.delta.text }
        continue
      }
      if (frame.type === 'message_delta' && frame.delta?.stop_reason) {
        yield { finishReason: frame.delta.stop_reason === 'max_tokens' ? 'length' : frame.delta.stop_reason }
        continue
      }
      if (frame.type === 'error') throw new Error(frame.error?.message ?? 'Stream error')
      const choice = frame.choices?.[0]
      if (!choice) continue
      const delta = choice.delta
      // Reasoning field name isn't standardised: DeepSeek/llama.cpp use reasoning_content,
      // OpenRouter uses reasoning. Reasoning arrives before content: yield it first.
      const reasoning = delta?.reasoning_content ?? delta?.reasoning
      if (reasoning) yield { reasoning }
      if (delta?.content) yield { content: delta.content }
      // /completions frames carry the text on the choice itself, with no delta at all. Same SSE
      // envelope, same finish_reason, one different field.
      else if (typeof choice.text === 'string' && choice.text) yield { content: choice.text }
      // The last frame usually carries finish_reason with an empty delta: read it off the
      // choice rather than the delta.
      if (choice.finish_reason) yield { finishReason: choice.finish_reason }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    // Normalise CRLF: the event boundary is always '\n\n'. llama.cpp and other httplib-based
    // servers frame events with '\r\n\r\n'. Raw CR/LF only appear as framing, never inside the
    // JSON payload (those are escaped). Stripping them is safe.
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
