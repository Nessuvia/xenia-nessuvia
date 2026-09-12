// Chapters as prompt text: the Story prose, and the ladder that degrades it beat by beat when it
// will not fit. Pure and check-testable: the store resolves rows, this decides wording and shape.
//
// Extension-ful imports on purpose: checkChapterGuide.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { BlockContext, Chapter } from '../storage/types.ts'

/** The fields the prose walk needs off a Chapter row. */
export type GuideChapter = Pick<Chapter, 'id' | 'title' | 'summary' | 'blocks' | 'guideSend'>

/** A Chapter's prose: its Blocks' content in order. Blocks are stretches of one document: they
 *  join with a blank line, the same separator Chapters use inside the prose blob. */
export const chapterProse = (chapter: Pick<Chapter, 'blocks'>): string =>
  chapter.blocks
    .map((b) => b.content.trim())
    .filter(Boolean)
    .join('\n\n')

/** The line marking a Chapter boundary inside the Story prose: the model can see where the
 *  boundaries fall as the prose scrolls past them. Prompt wording; keep it here with the rest. */
export const chapterDivider = (index: number, title: string): string =>
  `- Chapter ${index + 1}${title.trim() ? `: ${title.trim()}` : ''} -`

/** What a Chapter is doing right now, from two facts: has prose, and is the active Chapter. */
export type ChapterState = 'written' | 'writingNow' | 'notYetWritten'

/** The one definition of "has prose" for the `written` stamp: any Block with non-whitespace text. */
export const hasProse = (chapter: Pick<Chapter, 'blocks'>): boolean =>
  chapter.blocks.some((b) => b.content.trim() !== '')

export function chapterState(chapter: GuideChapter, activeId: number | null): ChapterState {
  if (chapter.id != null && chapter.id === activeId) return 'writingNow'
  return hasProse(chapter) ? 'written' : 'notYetWritten'
}

/**
 * The header a Chapter gets once some of its prose has been degraded to instructions: what the
 * Chapter was, in one line: the beat lines under it have something to hang off. Replaces
 * `chapterDivider` for that Chapter, and unlike the divider it is emitted for Chapter 1 too: with
 * the prose gone there is nothing else naming what those beats belong to.
 *
 * Prompt wording; retuned here with the rest.
 */
export const degradedHeader = (index: number, title: string, summary: string): string => {
  const name = title.trim()
  const recap = summary.trim()
  return `Chapter ${index + 1}${name ? ` - ${name}` : ''}${recap ? `. ${recap}` : ''}`
}

/** A degraded beat's line: its instructions, numbered by position among its Chapter's beats. */
export const beatLine = (n: number, instructions: string): string =>
  `Beat ${n}: ${instructions.trim()}`

/**
 * The Story prose the Co-Writer sees: every Chapter up to and including the active one, divider
 * lines between them. Chapters after the active one are the future and contribute only what the
 * Story tokens carry: their prose (if any, after a reorder) would be text the passage hasn't
 * reached yet.
 *
 * Nothing is degraded here. `fitStoryProse` is the same walk with a budget over it.
 */
export function storyProse(chapters: GuideChapter[], activeId: number | null): string {
  return storyProseSplit(chapters, activeId, null, 'both').text
}

/**
 * The same prose, split around one Block: `text` is everything before it (the Story context as
 * `storyProse` has always built it), `trailing` is the rest of the active Chapter after it: what
 * the model has to write its way back to. The Block's own content is in neither: it is what the
 * generation is replacing.
 *
 * `trailing` stops at the end of the active Chapter. Later Chapters are the future and stay out,
 * the same rule `text` follows on the other side.
 *
 * `context` is the Block's own setting and does nothing but blank one side or the other. That is
 * the whole of the per-Block context feature: `buildStoryPrompt` already took these two strings.
 *
 * With `blockId` null (a preview with no Block picked) the split falls at the end of the active
 * Chapter, `trailing` is '' and `text` is the whole prose, the shape this returned before Blocks.
 */
export function storyProseSplit(
  chapters: GuideChapter[],
  activeId: number | null,
  blockId: string | null,
  context: BlockContext,
): { text: string; trailing: string } {
  return walk(chapters, activeId, blockId, context, 0).split
}

export interface FittedProse {
  text: string
  trailing: string
  /** Blocks whose prose was replaced by their instructions, or dropped for having none. */
  degradedCount: number
  /** Blocks that could have been degraded. `degradedCount === degradable` means every Chapter
   *  before the active one is down to its plan and there is nothing gentler left to give. */
  degradable: number
}

/**
 * The Story prose, degraded until it fits `available` tokens.
 *
 * Everything sends in full while there is room. Over budget, the oldest Block swaps its prose for
 * `Beat N: <instructions>` and its Chapter grows a `degradedHeader`; still over, the next Block
 * does the same, and so on. Blocks are walked in Story order: a Chapter is fully converted
 * before the next one is touched, and what the model loses is always the oldest prose.
 *
 * The active Chapter is never degraded, and neither is anything after it: the passage being written
 * into is the one piece of prose that cannot be replaced by a description of itself. If the active
 * Chapter alone overruns, that is what comes back, the same floor the Chapter guide used to hold.
 *
 * `count` is injected so this file stays free of gpt-tokenizer and the check scripts can run it
 * under `--experimental-strip-types`.
 */
export function fitStoryProse(
  chapters: GuideChapter[],
  activeId: number | null,
  blockId: string | null,
  context: BlockContext,
  available: number,
  count: (s: string) => number,
): FittedProse {
  const degradable = walk(chapters, activeId, blockId, context, 0).degradable

  for (let degraded = 0; degraded < degradable; degraded++) {
    const { split } = walk(chapters, activeId, blockId, context, degraded)
    if (count(split.text) <= available) {
      return { ...split, degradedCount: degraded, degradable }
    }
  }
  // Everything degradable is degraded. Whether that fits or not, this is the floor.
  const { split } = walk(chapters, activeId, blockId, context, degradable)
  return { ...split, degradedCount: degradable, degradable }
}

/**
 * The one walk both exports share: they cannot disagree about which Blocks are in scope or where
 * the caret splits the active Chapter.
 *
 * `degraded` is how many Blocks from the start of the Story send their instructions instead of their
 * prose. Only Blocks in Chapters before the active one are counted or eligible, which is what keeps
 * the active Chapter whole.
 */
function walk(
  chapters: GuideChapter[],
  activeId: number | null,
  blockId: string | null,
  context: BlockContext,
  degraded: number,
): { split: { text: string; trailing: string }; degradable: number } {
  const activeIndex = chapters.findIndex((c) => c.id != null && c.id === activeId)
  const upTo = activeIndex === -1 ? chapters.length - 1 : activeIndex
  const parts: string[] = []
  const after: string[] = []

  // Running index over every Block in the Chapters before the active one. A Block is degraded when
  // its index falls inside the leading `degraded` of them.
  let seen = 0

  chapters.slice(0, upTo + 1).forEach((chapter, i) => {
    const isActive = i === upTo
    const count = isActive ? 0 : chapter.blocks.length
    const from = seen
    seen += count
    // How many of this Chapter's Blocks the ladder has reached.
    const cut = Math.max(0, Math.min(count, degraded - from))
    const off = chapter.guideSend === 'off'
    const wantsSummary = chapter.guideSend === 'summary' || chapter.guideSend === 'both'
    const wantsBeats = chapter.guideSend === 'beats' || chapter.guideSend === 'both'

    // A Chapter with nothing degraded looks like it always has. One with something degraded needs a
    // header naming it, unless it sends nothing at all.
    if (cut > 0 && !off) {
      parts.push(degradedHeader(i, chapter.title, wantsSummary ? chapter.summary : ''))
    } else if (i > 0) {
      // The first Chapter's divider is dropped: a one-Chapter Story looks like plain prose.
      parts.push(chapterDivider(i, chapter.title))
    }

    if (!isActive) {
      chapter.blocks.forEach((block, j) => {
        if (j >= cut) {
          const text = block.content.trim()
          if (text) parts.push(text)
          return
        }
        // Degraded. Every Block is a beat: the only one contributing no line is one the Author
        // has not planned yet. Numbering is the Block's own position: the lines stay in step
        // with the Plot Layout even when an unwritten beat sits between two written ones.
        if (off || !wantsBeats) return
        const instructions = block.beat.trim()
        if (instructions) parts.push(beatLine(j + 1, instructions))
      })
      return
    }

    // The active Chapter, split at the Block. An unknown id lands everything before it, which
    // matches the no-Block fallback rather than silently dropping the Chapter.
    const at = chapter.blocks.findIndex((b) => b.id === blockId)
    const splitAt = at === -1 ? chapter.blocks.length : at
    for (const [j, block] of chapter.blocks.entries()) {
      const text = block.content.trim()
      if (!text || j === splitAt) continue
      ;(j < splitAt ? parts : after).push(text)
    }
  })

  return {
    split: {
      text: context === 'before' || context === 'both' ? parts.join('\n\n') : '',
      trailing: context === 'after' || context === 'both' ? after.join('\n\n') : '',
    },
    degradable: seen,
  }
}
