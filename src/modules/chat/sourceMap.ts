// Display text that remembers where each character came from in the stored string.
//
// renderText rewrites stored text before anyone sees it: find/replace rules, the <state> strip,
// tag blocks that hide or unwrap, markers it consumes. Anything that edits the stored message from
// a selection on screen needs the way back. Every display character carries the stored range it
// stands for: an untouched character covers one stored character, a character a replace rule
// produced covers the whole match it replaced.
//
// Extension-ful imports on purpose: checkRenderText and checkSelectionEdit load this under node.

export interface Mapped {
  text: string
  /** Per display character: stored start, and stored end (exclusive). */
  from: number[]
  to: number[]
}

export function identity(text: string): Mapped {
  const from: number[] = []
  const to: number[] = []
  for (let i = 0; i < text.length; i++) {
    from.push(i)
    to.push(i + 1)
  }
  return { text, from, to }
}

/** Stored position at display index k. Past the end means the end of the last character. */
function storedAt(m: Mapped, k: number): number {
  return k < m.text.length ? m.from[k] : (m.to[m.text.length - 1] ?? 0)
}

/** String.prototype.replace's `$` patterns for one match, so the display matches what replace() gives. */
function expand(replacement: string, match: RegExpMatchArray, input: string): string {
  const at = match.index ?? 0
  return replacement.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g, (token, p: string) => {
    if (p === '$') return '$'
    if (p === '&') return match[0]
    if (p === '`') return input.slice(0, at)
    if (p === "'") return input.slice(at + match[0].length)
    if (p[0] === '<') return match.groups ? (match.groups[p.slice(1, -1)] ?? '') : token
    const n = Number(p)
    if (n >= 1 && n < match.length) return match[n] ?? ''
    // `$12` with one group reads as `$1` then a literal `2`, like replace().
    const one = Number(p[0])
    if (p.length === 2 && one >= 1 && one < match.length) return (match[one] ?? '') + p[1]
    return token
  })
}

/** `m.text.replace(re, replacement)`, carrying the map along. */
export function replaceMapped(m: Mapped, re: RegExp, replacement: string): Mapped {
  const found = re.global ? [...m.text.matchAll(re)] : [m.text.match(re)].filter((x) => x !== null)
  if (!found.length) return m
  const out: Mapped = { text: '', from: [], to: [] }
  let cursor = 0
  const copy = (end: number) => {
    out.text += m.text.slice(cursor, end)
    out.from.push(...m.from.slice(cursor, end))
    out.to.push(...m.to.slice(cursor, end))
  }
  for (const match of found) {
    const at = match.index ?? 0
    copy(at)
    const start = storedAt(m, at)
    const end = match[0].length ? m.to[at + match[0].length - 1] : start
    const rep = expand(replacement, match, m.text)
    out.text += rep
    for (let k = 0; k < rep.length; k++) {
      out.from.push(start)
      out.to.push(end)
    }
    cursor = at + match[0].length
  }
  copy(m.text.length)
  return out
}

export function trimEndMapped(m: Mapped): Mapped {
  const text = m.text.trimEnd()
  if (text.length === m.text.length) return m
  return { text, from: m.from.slice(0, text.length), to: m.to.slice(0, text.length) }
}

/**
 * The rendered DOM's text, run by run, in document order. `at` is the display index a run starts
 * at, or -1 for text with no stored source (a collapsed block's label).
 */
export interface SourceMap {
  runs: { at: number; len: number }[]
  mapped: Mapped
}

export interface Span {
  start: number
  end: number
}

/**
 * The stored span behind DOM text offsets [domStart, domEnd) of the rendered body. Null when the
 * selection covers nothing with a source.
 */
export function storedSpan(map: SourceMap, domStart: number, domEnd: number): Span | null {
  // Collect the display indices the selection covers, skipping unsourced runs.
  let first = -1
  let last = -1
  let cum = 0
  for (const run of map.runs) {
    const lo = Math.max(domStart, cum)
    const hi = Math.min(domEnd, cum + run.len)
    if (run.at >= 0 && lo < hi) {
      if (first < 0) first = run.at + (lo - cum)
      last = run.at + (hi - cum) - 1
    }
    cum += run.len
  }
  if (first < 0) return null
  const start = map.mapped.from[first]
  const end = map.mapped.to[last]
  return end > start ? { start, end } : null
}
