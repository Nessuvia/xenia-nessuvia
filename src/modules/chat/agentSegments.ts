// Extension-ful imports on purpose: checkAgentSegments.ts runs this under `node --experimental-strip-types`.
import type { AgentDisplay } from '../../core/agent/agentConfig.ts'
import type { Marked } from '../../core/agent/stage.ts'

export type Segment = Marked

/**
 * What a streaming reply shows under a Default display mode. null shows a working marker instead.
 * Stylized runs skip this: the pass hands over its own marks.
 * - blur: everything, with pending sentences marked.
 * - hold: nothing until the reply is stored.
 * - reveal: nothing while the model writes, then text up to the first pending sentence.
 */
export function agentSegments(text: string, pending: string[], display: AgentDisplay, passing: boolean): Segment[] | null {
  if (display === 'hold') return null
  if (display === 'reveal') {
    if (!passing) return null
    const at = pending.length ? text.indexOf(pending[0]) : -1
    return [{ text: at < 0 ? text : text.slice(0, at), mark: 'none' }]
  }
  const out: Segment[] = []
  let from = 0
  for (const sentence of pending) {
    const at = text.indexOf(sentence, from)
    if (at < 0) continue
    if (at > from) out.push({ text: text.slice(from, at), mark: 'none' })
    out.push({ text: sentence, mark: 'pending' })
    from = at + sentence.length
  }
  if (from < text.length) out.push({ text: text.slice(from), mark: 'none' })
  return out
}
