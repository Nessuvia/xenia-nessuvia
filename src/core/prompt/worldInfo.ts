// Extension-ful imports on purpose: checkWorldInfo.ts runs this under `node --experimental-strip-types`,
// which can't resolve extensionless app imports.
import type { Lorebook, WorldInfoEntry } from '../storage/types'
import { countTokens } from './budget.ts'

/** What a key is scanned against. A chat passes its `Message[]`; Write mode has no messages and
 *  passes paragraphs of prose instead. Only the text is ever read: one type covers both. */
export interface ScanText {
  content: string
}

/** Scan window when neither the entry nor its book says how far back to look. */
export const defaultDepth = 4

/** Where an `atDepth` entry lands when it names no depth. SillyTavern's own default. */
export const defaultInsertDepth = 4

/** The books in play for a turn, by id. Each entry resolves its own book's depth and budget. */
export type BookMap = Map<number, Lorebook>

const bookOf = (entry: WorldInfoEntry, books?: BookMap) => books?.get(entry.bookId)

const window = (entry: WorldInfoEntry, book?: Lorebook) =>
  entry.scanDepth ?? book?.scanDepth ?? defaultDepth

// substring, not word boundary: a key of "BA" fires inside "abandon". Upgrade to a
// \b-anchored regex per key if that bites in practice.
const mentions = (haystack: string, keys: string[], caseSensitive?: boolean) =>
  keys.some((key) => haystack.includes(caseSensitive ? key : key.toLowerCase()))

/**
 * Whether an entry's secondary keys let a primary hit through, under SillyTavern's `selectiveLogic`
 * numbering. An entry with no secondary keys is never gated.
 *
 * The same scan window is searched for both halves: a secondary key is a condition on the same
 * stretch of conversation the primary key fired in, not a wider one.
 */
function secondaryPasses(entry: WorldInfoEntry, haystack: string): boolean {
  const keys = entry.secondaryKeys ?? []
  if (!keys.length) return true
  const present = keys.filter((key) =>
    haystack.includes(entry.caseSensitive ? key : key.toLowerCase()),
  )
  switch (entry.selectiveLogic) {
    case 1: // NOT_ALL: blocked only when every secondary is there
      return present.length < keys.length
    case 2: // NOT_ANY: blocked as soon as one is there
      return present.length === 0
    case 3: // AND_ALL
      return present.length === keys.length
    default: // 0, AND_ANY, and anything unrecognised
      return present.length > 0
  }
}

/**
 * The entries that belong in this turn's prompt: every enabled always-on one, plus any whose key
 * appears within its own scan window of recent history and whose secondary keys let it through.
 *
 * Each entry gets its own window: the depth is per entry, and the text being searched differs
 * from one to the next. There's no single haystack to build up front. Case folding is per entry
 * too: a case-sensitive entry searches the messages as they were written.
 */
export function matchedEntries(
  entries: WorldInfoEntry[],
  messages: ScanText[],
  books?: BookMap,
): WorldInfoEntry[] {
  return entries
    .filter((entry) => {
      if (!entry.enabled || !entry.content.trim()) return false
      if (entry.always) return true
      if (!entry.keys.length) return false
      const recent = messages.slice(-window(entry, bookOf(entry, books)))
      const haystack = recent
        .map((m) => (entry.caseSensitive ? m.content : m.content.toLowerCase()))
        .join('\n')
      if (!mentions(haystack, entry.keys, entry.caseSensitive)) return false
      return secondaryPasses(entry, haystack)
    })
    .sort(byPlacement)
}

/**
 * `beforeChar` ahead of everything else, then the book's own order, then the row id. `atDepth`
 * entries leave the block entirely. Where they land in this list only orders them against each
 * other at the same depth.
 *
 * The three positions feed three block sources (`worldInfo`, `worldInfoAfter`,
 * `worldInfoDepth`). This sort does not decide placement on its own. It still decides
 * priority: the prompt-wide budget below fills in this order and drops the tail.
 */
const rank = (entry: WorldInfoEntry) => (entry.position === 'beforeChar' ? 0 : 1)

const byPlacement = (a: WorldInfoEntry, b: WorldInfoEntry) =>
  rank(a) - rank(b) || a.order - b.order || (a.id ?? 0) - (b.id ?? 0)

/** What the matched entries contribute, split by where they go. */
export interface ResolvedWorldInfo {
  /** `beforeChar` entries: the `worldInfo` block's text. */
  before: string
  /** `afterChar` entries: the `worldInfoAfter` block's text. */
  after: string
  /** Entries placed in history instead, one per distinct depth, deepest first. */
  atDepth: { depth: number; text: string }[]
  /** What the prompt-wide budget cut, for the preview to report. Book budgets don't land here:
   *  those are the book author's own limit, not something the user set and should see undone. */
  dropped: { name: string; tokens: number }[]
}

/**
 * The matched entries, budgeted and split into the World info block's text and the entries that go
 * into history at a depth. Empty text is what the prompt builder already treats as an empty bound
 * field and reports as skipped.
 *
 * The budget is enforced rather than advisory, and enforced per book: real books carry entries of
 * several hundred words each. A handful firing at once would swallow the context before history
 * got any, and one book's spending must not silence another's.
 */
export function resolveWorldInfo(
  entries: WorldInfoEntry[],
  messages: ScanText[],
  books?: BookMap,
  /** The stack's `worldInfoBudget`: one pool shared by all three slots, in tokens. Undefined or 0
   *  is no cap, which is what every stack has until the user sets one. */
  cap?: number,
): ResolvedWorldInfo {
  const matched = matchedEntries(entries, messages, books)
  // Per book: tokens spent, and whether anything has gone in yet.
  const spent = new Map<number, number>()
  const kept = new Map<number, number>()
  const before: string[] = []
  const after: string[] = []
  const depths = new Map<number, string[]>()
  const dropped: { name: string; tokens: number }[] = []
  const capped = cap !== undefined && cap > 0
  let poolSpent = 0
  let full = false

  for (const entry of matched) {
    // Once the pool is full every entry left is lower priority than the one that overflowed it.
    // Recording them without pricing them keeps the preview's list complete.
    if (full) {
      dropped.push({ name: entry.name, tokens: countTokens(entry.content) })
      continue
    }
    const cost = countTokens(entry.content)
    const budget = bookOf(entry, books)?.tokenBudget
    if (budget !== undefined && budget > 0) {
      const used = spent.get(entry.bookId) ?? 0
      // The first match of a book always goes in, over budget or not. Real books set budgets
      // smaller than a single entry (the reference book allows 500 tokens for entries of 700)
      // and a book that silently injects nothing at all looks like broken rather than as thrifty.
      // Skips rather than stops: with several books interleaved by `order`, one long entry
      // exhausting its book is no reason to drop everything after it.
      if ((kept.get(entry.bookId) ?? 0) > 0 && used + cost > budget) continue
      spent.set(entry.bookId, used + cost)
      kept.set(entry.bookId, (kept.get(entry.bookId) ?? 0) + 1)
    }
    // The prompt-wide cap, applied after the book's own. Stops rather than skips: `matched` is in
    // priority order. Letting a small late entry jump the queue past the one that didn't fit
    // would make `order` mean less than it says.
    // Unlike a book budget this has no first-match exemption: the user set the number, and a cap
    // that quietly overspends is worse than one that yields nothing.
    if (capped && poolSpent + cost > cap) {
      dropped.push({ name: entry.name, tokens: cost })
      full = true
      continue
    }
    poolSpent += cost

    if (entry.position === 'atDepth') {
      const depth = entry.depth ?? defaultInsertDepth
      const at = depths.get(depth)
      if (at) at.push(entry.content)
      else depths.set(depth, [entry.content])
    } else if (entry.position === 'afterChar') {
      after.push(entry.content)
    } else {
      before.push(entry.content)
    }
  }

  return {
    before: before.join('\n'),
    after: after.join('\n'),
    // Deepest first, which is the order they have to be spliced in: each insertion point is
    // counted from the end of history. A shallower note inserted first would shift a deeper one.
    atDepth: [...depths.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([depth, texts]) => ({ depth, text: texts.join('\n') })),
    dropped,
  }
}

/** Nothing matched. The shape `buildPrompt` gets when a chat has no books attached at all. */
export const emptyWorldInfo: ResolvedWorldInfo = {
  before: '',
  after: '',
  atDepth: [],
  dropped: [],
}
