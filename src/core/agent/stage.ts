// Stylized post-processing: the reply as marked runs while the pass edits it.
// Extension-ful imports on purpose: checkStage.ts runs this under `node --experimental-strip-types`.

/** none: plain. pending: flagged, blurred. strike: being deleted. fresh: a rewrite that just landed. flash: a swapped word. */
export type Mark = 'none' | 'pending' | 'strike' | 'fresh' | 'flash'

export interface Marked {
  text: string
  mark: Mark
}

/** Stylized progress: the marked reply, and how long one step's animation lasts in ms. */
export interface AgentStage {
  marks: Marked[]
  beat: number
}

/** One step's length. Many hits share about two seconds between them, plus model time. */
export function agentBeat(hits: number): number {
  return Math.round(Math.min(600, Math.max(150, 2000 / Math.max(1, hits))))
}

/**
 * Word ranges in `after` that differ from `before`, as [start, end) offsets.
 * A pure removal has nothing left to show, so it marks the word before the gap.
 */
export function changedRanges(before: string, after: string): [number, number][] {
  if (before === after) return []
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)
  const n = a.length
  const m = b.length
  const w = m + 1
  // ponytail: full LCS table, O(n·m). Replies past ~1000 words each way skip the flash. Myers diff if that matters.
  if ((n + 1) * w > 4_000_000) return []
  const t = new Uint16Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1])
    }
  }
  const starts: number[] = []
  let pos = 0
  for (const token of b) {
    starts.push(pos)
    pos += token.length
  }
  const word = (j: number): [number, number] => [starts[j], starts[j] + b[j].length]

  const out: [number, number][] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++
      j++
    } else if (j < m && (i >= n || t[i * w + j + 1] >= t[(i + 1) * w + j])) {
      if (b[j].trim()) out.push(word(j))
      j++
    } else {
      if (a[i].trim()) {
        let k = j - 1
        while (k >= 0 && !b[k].trim()) k--
        if (k >= 0) out.push(word(k))
      }
      i++
    }
  }

  out.sort((x, y) => x[0] - y[0])
  const merged: [number, number][] = []
  for (const r of out) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([r[0], r[1]])
  }
  return merged
}

/** Split `text`, which starts at `at` in the reply, into plain and flash runs. */
export function flashed(text: string, at: number, ranges: [number, number][]): Marked[] {
  const out: Marked[] = []
  let from = 0
  for (const [s, e] of ranges) {
    const start = Math.max(0, s - at)
    const end = Math.min(text.length, e - at)
    if (end <= start) continue
    if (start > from) out.push({ text: text.slice(from, start), mark: 'none' })
    out.push({ text: text.slice(start, end), mark: 'flash' })
    from = end
  }
  if (from < text.length) out.push({ text: text.slice(from), mark: 'none' })
  return out
}

/** Join neighbouring runs with the same mark. Fewer runs keep markdown inside one render call. */
export function mergeMarks(marks: Marked[]): Marked[] {
  const out: Marked[] = []
  for (const run of marks) {
    if (!run.text) continue
    const last = out[out.length - 1]
    if (last && last.mark === run.mark && run.mark !== 'fresh' && run.mark !== 'strike') last.text += run.text
    else out.push({ ...run })
  }
  return out
}
