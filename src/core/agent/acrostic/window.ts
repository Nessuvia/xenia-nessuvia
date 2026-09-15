// Extension-ful imports on purpose: check scripts run this under `node --experimental-strip-types`.

/** The fields the window reads off a message. Structural, so the checks need no storage types. */
export interface WindowMessage {
  role: string
  content: string
  divider?: boolean
  reasoningEnd?: number
}

/**
 * The replies an acrostic draw and the beat suggestions read: the last `size` assistant replies,
 * oldest first, stopping at a `/break` divider. `content` is already the active swipe; the reasoning
 * block in front of it is cut off.
 */
export function acrosticWindow(messages: WindowMessage[], size = 10): string[] {
  const out: string[] = []
  for (let i = messages.length - 1; i >= 0 && out.length < size; i--) {
    const m = messages[i]
    if (m.divider) break
    if (m.role !== 'assistant') continue
    const text = m.content.slice(m.reasoningEnd ?? 0).trim()
    if (text) out.unshift(text)
  }
  return out
}
