// Run: node --experimental-strip-types src/core/prompt/checkStoryProseSplit.ts
//
// The split around a Block, and the four context modes. This is the whole of the per-Block context
// feature: buildStoryPrompt already took these two strings, and this is the thing worth covering.
import assert from 'node:assert'
import { chapterProse, storyProse, storyProseSplit, type GuideChapter } from './chapterGuide.ts'
import type { Block } from '../storage/types.ts'

let b = 0
const block = (content: string, beat = ''): Block => ({
  id: `b${++b}`,
  beat,
  weight: 'normal',
  content,
  context: 'both',
})

let n = 0
const ch = (title: string, blocks: Block[]): GuideChapter => ({
  id: ++n,
  title,
  summary: '',
  blocks,
  guideSend: 'both',
})

// --- a Chapter's prose is its Blocks, blank-line joined ----------------------
{
  const c = ch('One', [block('alpha'), block(''), block('  '), block('beta')])
  // Empty and whitespace-only Blocks contribute nothing: an unwritten beat leaves no gap.
  assert.strictEqual(chapterProse(c), 'alpha\n\nbeta')
  assert.strictEqual(chapterProse(ch('Empty', [])), '')
}

// --- the split falls around the Block, and the Block itself is in neither -----
{
  const one = block('first prose')
  const a = block('second A')
  const target = block('the old draft', 'a beat')
  const z = block('second Z')
  const three = block('third prose')
  const chapters = [ch('One', [one]), ch('Two', [a, target, z]), ch('Three', [three])]

  const split = storyProseSplit(chapters, chapters[1].id!, target.id, 'both')
  assert.strictEqual(split.text, 'first prose\n\n- Chapter 2: Two -\n\nsecond A')
  assert.strictEqual(split.trailing, 'second Z')
  // The Block being replaced is excluded from both halves.
  assert.ok(!split.text.includes('the old draft'))
  assert.ok(!split.trailing.includes('the old draft'))

  // The trailing text stops at the end of the active Chapter: later Chapters stay out of both
  // halves. The split is Chapter-bounded.
  assert.ok(!split.trailing.includes('third prose'))
  assert.ok(!split.text.includes('third prose'))

  // --- the four context modes only blank one side or the other ---------------
  const before = storyProseSplit(chapters, chapters[1].id!, target.id, 'before')
  assert.strictEqual(before.text, split.text)
  assert.strictEqual(before.trailing, '')

  const after = storyProseSplit(chapters, chapters[1].id!, target.id, 'after')
  assert.strictEqual(after.text, '')
  assert.strictEqual(after.trailing, split.trailing)

  const none = storyProseSplit(chapters, chapters[1].id!, target.id, 'none')
  assert.strictEqual(none.text, '')
  assert.strictEqual(none.trailing, '')

  // The split falls on the *active* Chapter.
  assert.strictEqual(storyProseSplit(chapters, chapters[0].id!, one.id, 'both').trailing, '')
}

// --- a Block at either end of its Chapter ------------------------------------
{
  const first = block('opening')
  const last = block('closing')
  const chapters = [ch('One', [block('earlier')]), ch('Two', [first, block('middle'), last])]

  // The first Block of the active Chapter: earlier Chapters are still context on the left.
  const atStart = storyProseSplit(chapters, chapters[1].id!, first.id, 'both')
  assert.strictEqual(atStart.text, 'earlier\n\n- Chapter 2: Two -')
  assert.strictEqual(atStart.trailing, 'middle\n\nclosing')

  // The last Block: nothing trails it.
  const atEnd = storyProseSplit(chapters, chapters[1].id!, last.id, 'both')
  assert.strictEqual(atEnd.text, 'earlier\n\n- Chapter 2: Two -\n\nopening\n\nmiddle')
  assert.strictEqual(atEnd.trailing, '')
}

// --- no Block picked, and an id that matches nothing --------------------------
{
  const chapters = [ch('One', [block('first prose')]), ch('Two', [block('second prose')])]

  // No Block is the shape this had before Blocks: the whole prose on the left, nothing trailing.
  const nothing = storyProseSplit(chapters, chapters[1].id!, null, 'both')
  assert.strictEqual(nothing.text, storyProse(chapters, chapters[1].id!))
  assert.strictEqual(nothing.trailing, '')

  // An unknown id lands everything before it rather than silently dropping the Chapter.
  const unknown = storyProseSplit(chapters, chapters[1].id!, 'gone', 'both')
  assert.strictEqual(unknown.text, storyProse(chapters, chapters[1].id!))
  assert.strictEqual(unknown.trailing, '')
}

// --- storyProse is the no-Block split, unchanged ------------------------------
{
  const chapters = [ch('One', [block('prose')]), ch('Two', [])]
  // A Chapter with no prose still contributes its divider: the model sees the boundary.
  assert.strictEqual(storyProse(chapters, chapters[1].id!), 'prose\n\n- Chapter 2: Two -')
  assert.strictEqual(storyProse([ch('One', [])], null), '')
}

console.log('checkStoryProseSplit ok')
