// Mapping a DOM text selection inside a message bubble back onto the stored string.
//
// renderText drops the markers it consumes (`**`, `*`, backticks) and tag blocks, so the text a
// user selects on screen is not a substring of message.content at the same offsets. The way back
// is a search rather than an index: take the selected string, count how many times it already
// appeared in the rendered text above the selection, then pick that same occurrence in the stored
// text. Exact match first; if the selection straddled a dropped marker, a tolerant pass allows
// marker characters between the letters.
//
// Display-only find/replace rules and hidden tag blocks can still put the two texts out of reach
// of each other. Then locate returns null and the caller falls back to editing the whole message.

/** Characters renderText eats. A tolerant match lets runs of them sit between any two letters. */
const markerChars = '*_`'

/** How long a selection may be before the tolerant pass gives up. Keeps the regex bounded. */
export const tolerantLimit = 2000

/**
 * Index of (node, offset) within root's text content, counting only text nodes. Returns -1 when
 * node is not inside root.
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

/** How many non-overlapping copies of `needle` start before `limit` in `haystack`. */
export function occurrenceBefore(haystack: string, needle: string, limit: number): number {
  if (!needle) return 0
  let count = 0
  let i = haystack.indexOf(needle)
  while (i >= 0 && i < limit) {
    count += 1
    i = haystack.indexOf(needle, i + needle.length)
  }
  return count
}

function escapeChar(ch: string): string {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `abc` → /a[*_`]{0,3}b[*_`]{0,3}c/ so a selection that crossed a dropped marker still lands.
 *
 * Whitespace is its own case. A selection spanning paragraphs comes back from the DOM with
 * whatever the browser put between two block elements: one newline, two, or none at all, none of
 * which has to match the stored text. So any run of whitespace in the selection matches any run of
 * whitespace in the content, and markers may sit in it.
 */
function tolerantPattern(selected: string): RegExp {
  const gap = `[${markerChars.replace(/[\]\\^-]/g, '\\$&')}]{0,3}`
  const parts: string[] = []
  const chars = Array.from(selected)
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) {
      while (i + 1 < chars.length && /\s/.test(chars[i + 1])) i++
      parts.push(`[\\s${markerChars.replace(/[\]\\^-]/g, '\\$&')}]+`)
    } else {
      parts.push(escapeChar(chars[i]))
    }
  }
  // A whitespace class already swallows its neighbours' gaps: joining with one more would let two
  // adjacent classes overlap and blow the match up.
  let body = ''
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && !parts[i].startsWith('[\\s') && !parts[i - 1].startsWith('[\\s')) body += gap
    body += parts[i]
  }
  return new RegExp(body, 'g')
}

export interface Span {
  start: number
  end: number
}

/**
 * Find the span of `content` that the selection came from. `occurrence` is zero-based: the number
 * of identical runs that preceded it in the rendered text.
 */
export function locate(content: string, selected: string, occurrence: number): Span | null {
  if (!selected) return null

  const exact: Span[] = []
  let i = content.indexOf(selected)
  while (i >= 0) {
    exact.push({ start: i, end: i + selected.length })
    i = content.indexOf(selected, i + selected.length)
  }
  if (exact.length > occurrence) return exact[occurrence]
  // One hit and a stale count still means one unambiguous place to cut.
  if (exact.length === 1) return exact[0]
  if (exact.length > 0) return exact[exact.length - 1]

  if (selected.length > tolerantLimit) return null
  const loose: Span[] = []
  const re = tolerantPattern(selected)
  for (const match of content.matchAll(re)) {
    loose.push({ start: match.index, end: match.index + match[0].length })
  }
  if (!loose.length) return null
  return loose[Math.min(occurrence, loose.length - 1)]
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
