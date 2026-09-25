// Editing the stored message from a DOM text selection inside a message bubble.
//
// textOffset turns a DOM position into an offset in the body's rendered text. sourceMap.ts's
// storedSpan turns rendered offsets into a stored span, and the helpers below edit that span.
// Extension-ful imports on purpose: checkSelectionEdit loads this under node.
import type { Span } from './sourceMap.ts'

export type { Span }

/**
 * Index of (node, offset) within root's text content, counting only text nodes. Returns -1 when
 * node isn't inside root.
 */
export function textOffset(root: Node, node: Node, offset: number): number {
  if (!root.contains(node)) return -1
  let count = 0
  const walk = (current: Node): number | null => {
    if (current === node) {
      // An offset on an element node counts its first `offset` children, not characters.
      if (current.nodeType === 3) return count + offset
      let inner = count
      for (let i = 0; i < offset && i < current.childNodes.length; i++) {
        inner += current.childNodes[i].textContent?.length ?? 0
      }
      return inner
    }
    if (current.nodeType === 3) {
      count += current.nodeValue?.length ?? 0
      return null
    }
    for (const child of Array.from(current.childNodes)) {
      const hit = walk(child)
      if (hit !== null) return hit
    }
    return null
  }
  return walk(root) ?? -1
}

/**
 * Cut a span out. A cut between two spaces leaves one, a cut that empties a line leaves no
 * trailing blank, and a cut that took whole paragraphs leaves one paragraph break rather than the
 * pile of newlines from both sides. Nothing else is tidied: the stored text is the model's.
 */
export function cutSpan(content: string, span: Span): string {
  let { start, end } = span
  const before = content[start - 1]
  const after = content[end]
  if (before === ' ' && after === ' ') end += 1
  else if (before === ' ' && (after === undefined || after === '\n')) start -= 1

  const cut = content.slice(0, start) + content.slice(end)
  // Collapse the newline run sitting across the join, and only that one.
  let from = start
  let to = start
  while (from > 0 && cut[from - 1] === '\n') from--
  while (to < cut.length && cut[to] === '\n') to++
  if (to - from < 3) return cut
  return cut.slice(0, from) + '\n\n' + cut.slice(to)
}

/** Put `text` in place of a span. */
export function replaceSpan(content: string, span: Span, text: string): string {
  return content.slice(0, span.start) + text + content.slice(span.end)
}
