/**
 * Compute exclusion zones: sorted `[start, end]` char ranges that must not be tagged or matched.
 * Covers fenced code blocks, inline code spans, URLs, and markdown link targets. LaTeX delimiters
 * ride along when present. Link *text* is fair game (only the target in `(...)` is excluded).
 *
 * regex-scan, not a full markdown parser. Good enough for the render-time strip; a
 * pathological nest (code fence inside a link inside a quote) can mis-bound, but model chat rarely
 * produces that and the worst case is a missed strip, never a wrong rewrite: storage is untouched.
 */
export type Range = readonly [number, number]

/**
 * A delimiter pair whose contents the pass leaves alone: `[` to `]` for an OOC aside, `<think>` to
 * `</think>` for a reasoning block. Both delimiters are literal text, matched case-insensitively.
 * The delimiters themselves are excluded along with what they wrap.
 */
export interface IgnorePair {
  id: string
  open: string
  close: string
}

export function computeExclusions(text: string, pairs: IgnorePair[] = []): Range[] {
  const ranges: Range[] = []
  scanPairs(text, pairs, ranges)
  // Fenced code blocks: ``` or ~~~ up to the matching fence (greedy to next same-length fence).
  // Inline code: `...` (single backticks, no newline inside). Run fenced first so inline doesn't
  // eat a fence's backticks.
  scanFenced(text, ranges)
  scanInlineCode(text, ranges)
  scanUrls(text, ranges)
  scanLinkTargets(text, ranges)
  scanLatex(text, ranges)
  return sortByStart(ranges)
}

/**
 * The user's own ignored tags. Scanned first so a pair wraps whatever is inside it, code fences
 * and all. An unclosed opener runs to the end of the text, the same call `scanFenced` makes: a
 * half-written block is still not prose.
 *
 * Nested pairs of the same kind are not tracked. `[a [b] c]` ends at the first `]`, which is what
 * a non-greedy scan gives and what the render-time strip has always done elsewhere in this file.
 */
function scanPairs(text: string, pairs: IgnorePair[], ranges: Range[]) {
  if (!pairs.length) return
  const hay = text.toLowerCase()
  for (const { open, close } of pairs) {
    if (!open || !close) continue
    const from = open.toLowerCase()
    const to = close.toLowerCase()
    let at = 0
    for (let start = hay.indexOf(from, at); start >= 0; start = hay.indexOf(from, at)) {
      const closeAt = hay.indexOf(to, start + from.length)
      const end = closeAt < 0 ? text.length : closeAt + to.length
      ranges.push([start, end])
      at = end
      if (closeAt < 0) break
    }
  }
}

function scanFenced(text: string, ranges: Range[]) {
  const re = /(`{3,}|~{3,})[^\n]*\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const fence = m[1]
    const close = text.indexOf(fence, re.lastIndex)
    if (close < 0) {
      // Unclosed fence: exclude to end of string.
      ranges.push([m.index, text.length])
      break
    }
    const end = close + fence.length
    ranges.push([m.index, end])
    re.lastIndex = end
  }
}

function scanInlineCode(text: string, ranges: Range[]) {
  const re = /`([^`\n]+)`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, re.lastIndex])
  }
}

function scanUrls(text: string, ranges: Range[]) {
  const re = /\bhttps?:\/\/[^\s)]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    // Trim trailing punctuation that models often place after a bare URL.
    let end = re.lastIndex
    while (end > m.index && /[.,;:!?)]$/.test(text[end - 1])) end -= 1
    ranges.push([m.index, end])
  }
}

function scanLinkTargets(text: string, ranges: Range[]) {
  // [text](target): exclude only the `(target)`.
  const re = /\[[^\]]*\]\(([^)\s]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const targetStart = m.index + m[0].lastIndexOf('(') + 1
    ranges.push([targetStart, re.lastIndex - 1])
  }
}

function scanLatex(text: string, ranges: Range[]) {
  // $$...$$ and $...$ math. Greedy on $$, non-greedy on single $.
  const block = /\$\$([\s\S]+?)\$\$/g
  let m: RegExpExecArray | null
  while ((m = block.exec(text)) !== null) {
    ranges.push([m.index, block.lastIndex])
  }
  const inline = /\$([^$\n]+)\$/g
  while ((m = inline.exec(text)) !== null) {
    ranges.push([m.index, inline.lastIndex])
  }
}

function sortByStart(ranges: Range[]): Range[] {
  return mergeOverlapping(ranges.slice().sort((a, b) => a[0] - b[0]))
}

function mergeOverlapping(sorted: Range[]): Range[] {
  const out: Range[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) {
      // merge: extend the previous range
      out[out.length - 1] = [last[0], Math.max(last[1], r[1])] as Range
    } else out.push([r[0], r[1]] as Range)
  }
  return out
}
