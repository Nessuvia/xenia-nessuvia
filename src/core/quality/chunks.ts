// Extension-ful imports on purpose: checkChunks.ts runs this under `node --experimental-strip-types`.
import { sentences } from './sentences.ts'

/** A piece of a passage, with char offsets back into the string it came from. */
export interface Chunk {
  text: string
  start: number
  end: number
}

/** Past this many characters a paragraph is split further, at sentence boundaries. A single
 *  wall-of-text paragraph would otherwise make the whole message one accept-or-reject decision,
 *  which is the thing chunking exists to avoid. */
const MAX_CHUNK = 600

/** Below this Dice similarity two chunks are not the same passage, they are different passages that
 *  happen to share a few words. */
const FLOOR = 0.25

/** How much better a split or a merge has to score than a plain 1:1 pairing before it wins. */
const MARGIN = 0.05

/**
 * Split a passage into decidable pieces: paragraphs, and long paragraphs split again at sentence
 * boundaries into runs of at most `MAX_CHUNK` characters.
 *
 * Offsets are into `text` as handed in, so a decision about a chunk can always be mapped back to
 * the exact span it came from.
 */
export function splitChunks(text: string): Chunk[] {
  const out: Chunk[] = []
  // A blank line is the paragraph boundary. Walking the separators rather than using split() keeps
  // the offsets honest when the separator is "\n   \n" rather than "\n\n".
  const re = /\n[ \t]*\n\s*/g
  let cursor = 0
  const pieces: Chunk[] = []
  for (const m of text.matchAll(re)) {
    pieces.push(slice(text, cursor, m.index))
    cursor = m.index + m[0].length
  }
  pieces.push(slice(text, cursor, text.length))

  for (const p of pieces) {
    if (!p.text) continue
    if (p.text.length <= MAX_CHUNK) {
      out.push(p)
      continue
    }
    out.push(...splitLong(text, p))
  }
  return out
}

/** Trim a span and report where the trimmed body actually sits. */
function slice(source: string, start: number, end: number): Chunk {
  const raw = source.slice(start, end)
  const lead = raw.length - raw.trimStart().length
  const body = raw.trim()
  return { text: body, start: start + lead, end: start + lead + body.length }
}

/** Break one over-long paragraph into sentence runs, each as close to MAX_CHUNK as fits. */
function splitLong(source: string, para: Chunk): Chunk[] {
  const parts = sentences(para.text)
  // No terminal punctuation anywhere: nothing to split on, so the paragraph stays whole. Better one
  // large chunk than an arbitrary cut mid-sentence.
  if (parts.length < 2) return [para]

  const out: Chunk[] = []
  let from = 0
  for (let i = 0; i < parts.length; i++) {
    const runEnd = parts[i].end
    const runLength = runEnd - parts[from].start
    const last = i === parts.length - 1
    if (runLength >= MAX_CHUNK || last) {
      out.push(slice(source, para.start + parts[from].start, para.start + runEnd))
      from = i + 1
    }
  }
  return out
}

/**
 * How one alignment step resolved. `from` and `to` hold one or more chunks each, so a paragraph the
 * rewrite split in two, or two it merged into one, still comes through as a single decision.
 */
export type Alignment =
  | { kind: 'pair'; from: Chunk[]; to: Chunk[] }
  | { kind: 'unmatched'; from: Chunk[] }

/**
 * Line the rewrite's chunks up against the original's.
 *
 * Chunk-level accept only works if we know which rewritten paragraph answers which original one,
 * and a rewrite is free to split or merge paragraphs. Two stages:
 *
 * 1. Equal counts align by index. The common case, and it costs nothing.
 * 2. Otherwise a greedy monotonic walk on bigram Dice similarity, choosing at each step between a
 *    1:1 pairing, a 1:2 split and a 2:1 merge. Monotonic means the pass can never reorder the
 *    passage, which is a useful invariant in itself: a rewrite that moved a paragraph produces
 *    unmatched chunks and keeps the originals rather than silently shuffling the prose.
 *
 * An original chunk with no partner above the similarity floor comes back `unmatched`, and the
 * caller keeps its original text. Rewrite chunks left over at the end are dropped: text the model
 * invented that answers nothing in the original is exactly what should not reach history.
 */
export function alignChunks(before: Chunk[], after: Chunk[]): Alignment[] {
  if (!before.length) return []
  if (!after.length) return before.map((c) => ({ kind: 'unmatched', from: [c] }))
  if (before.length === after.length) {
    return before.map((c, i) => ({ kind: 'pair', from: [c], to: [after[i]] }))
  }

  const out: Alignment[] = []
  let i = 0
  let j = 0
  while (i < before.length) {
    if (j >= after.length) {
      out.push({ kind: 'unmatched', from: [before[i]] })
      i += 1
      continue
    }

    const one = similarity(before[i].text, after[j].text)
    const split = j + 1 < after.length ? similarity(before[i].text, join(after, j, 2)) : -1
    const merge = i + 1 < before.length ? similarity(join(before, i, 2), after[j].text) : -1
    // A split or a merge has to beat the plain pairing by a margin. Without it a deleted paragraph
    // gets swallowed by the merge branch: "Two beta." and "Three gamma." together do resemble
    // "Three gamma rewritten." a little, and that little would be enough to win.
    const best = Math.max(one, split - MARGIN, merge - MARGIN)

    // Look one step ahead on each side before committing. If the next original answers this rewrite
    // better than this original does, this one was dropped; if the next rewrite answers this
    // original better, this rewrite chunk is something the model inserted.
    const skipBefore = i + 1 < before.length ? similarity(before[i + 1].text, after[j].text) : -1
    if (skipBefore > best && skipBefore >= FLOOR) {
      out.push({ kind: 'unmatched', from: [before[i]] })
      i += 1
      continue
    }
    const skipAfter = j + 1 < after.length ? similarity(before[i].text, after[j + 1].text) : -1
    if (skipAfter > best && skipAfter >= FLOOR) {
      j += 1
      continue
    }

    if (best < FLOOR) {
      // Nothing here answers this paragraph. Advance the original and, if the rewrite still has
      // material, advance it too: staying put would re-test the same losing pair forever.
      out.push({ kind: 'unmatched', from: [before[i]] })
      i += 1
      if (after.length - j > before.length - i) j += 1
      continue
    }

    if (merge - MARGIN === best) {
      out.push({ kind: 'pair', from: [before[i], before[i + 1]], to: [after[j]] })
      i += 2
      j += 1
    } else if (split - MARGIN === best) {
      out.push({ kind: 'pair', from: [before[i]], to: [after[j], after[j + 1]] })
      i += 1
      j += 2
    } else {
      out.push({ kind: 'pair', from: [before[i]], to: [after[j]] })
      i += 1
      j += 1
    }
  }
  return out
}

function join(chunks: Chunk[], from: number, count: number): string {
  return chunks.slice(from, from + count).map((c) => c.text).join('\n\n')
}

/** Sorensen-Dice on word bigrams, the standard cheap "is this the same passage" measure. Words
 *  rather than characters, so a rewrite that changes every adjective still scores as a match. */
export function similarity(a: string, b: string): number {
  const x = bigrams(a)
  const y = bigrams(b)
  if (!x.size || !y.size) return a.trim() === b.trim() ? 1 : 0
  let shared = 0
  for (const [gram, count] of x) {
    const other = y.get(gram)
    if (other) shared += Math.min(count, other)
  }
  const total = size(x) + size(y)
  return (2 * shared) / total
}

function bigrams(text: string): Map<string, number> {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map((w) => w.replace(/'/g, ''))
  const out = new Map<string, number>()
  // A one-word chunk has no bigrams, so fall back to the word itself rather than scoring zero.
  if (words.length === 1) return new Map([[words[0], 1]])
  for (let i = 0; i + 1 < words.length; i++) {
    const key = `${words[i]} ${words[i + 1]}`
    out.set(key, (out.get(key) ?? 0) + 1)
  }
  return out
}

function size(counts: Map<string, number>): number {
  let n = 0
  for (const c of counts.values()) n += c
  return n
}
