import assert from 'node:assert'
import type { BeatWeight } from '../storage/types.ts'
import { storyTokens, swapStoryTokens, type StoryTokenArgs } from './storyTokens.ts'

const blk = (id: string, beat = '', weight: BeatWeight = 'normal') => ({ id, beat, weight })

const args: StoryTokenArgs = {
  title: '  The Long Way  ',
  premise: 'A courier takes a job she should have refused.',
  ending: 'She refuses the second one.',
  themes: 'What you carry for other people.',
  castNames: ['Mary', '  ', 'John'],
  chapters: [
    {
      id: 1,
      title: 'Departure',
      summary: 'Mary leaves.',
      targetWords: 0,
      blocks: [blk('a', 'She packs')],
    },
    {
      id: 2,
      title: 'The Road',
      summary: '',
      // Four beats, all normal: each takes a quarter of the target.
      targetWords: 1130,
      blocks: [
        blk('b', 'The checkpoint'),
        blk('c', 'Mary is searched'),
        blk('d', 'She lies about the parcel'),
        blk('e'), // planned but not written yet: no instructions
      ],
    },
    {
      id: 3,
      title: 'Arrival',
      summary: '',
      targetWords: 0,
      blocks: [blk('f', 'The handoff'), blk('g', 'The refusal')],
    },
  ],
  chapterId: 2,
  blockId: 'c',
}

const t = storyTokens(args)

assert.strictEqual(t.storyTitle, 'The Long Way')
assert.strictEqual(t.premise, 'A courier takes a job she should have refused.')
assert.strictEqual(t.ending, 'She refuses the second one.')
// Blank cast names drop out rather than leaving empty lines.
assert.strictEqual(t.castNames, 'Mary, John')

assert.strictEqual(t.chapterNumber, '2')
assert.strictEqual(t.chapterCount, '3')
assert.strictEqual(t.chapterTitle, 'The Road')
assert.strictEqual(t.chapterSummary, '')
assert.strictEqual(t.previousChapterSummary, 'Mary leaves.')
assert.strictEqual(t.nextChapterTitle, 'Arrival')
assert.strictEqual(t.nextChapterBeats, '- The handoff\n- The refusal')

assert.strictEqual(t.beat, 'Mary is searched')
// Derived from the Chapter's target and the weights on read: four equal beats
// over 1130 words, and the rounding leaves this one 282.
assert.strictEqual(t.beatTargetWords, '282')
assert.strictEqual(t.chapterTargetWords, '1130')
// The Block being written is left out, and so is the unwritten one. Order is Chapter order.
assert.strictEqual(t.otherBeats, '- The checkpoint\n- She lies about the parcel')

// A Chapter with no target of its own leaves every beat in it unset, reading blank rather than "0".
const noTarget = storyTokens({ ...args, chapterId: 1, blockId: 'a' })
assert.strictEqual(noTarget.beatTargetWords, '')
assert.strictEqual(noTarget.chapterTargetWords, '')

// No cursor: every chapter- and beat-scoped token blanks, Story-scoped ones still resolve.
const none = storyTokens({ ...args, chapterId: null, blockId: null })
assert.strictEqual(none.chapterNumber, '')
assert.strictEqual(none.chapterTitle, '')
assert.strictEqual(none.previousChapterSummary, '')
assert.strictEqual(none.nextChapterBeats, '')
assert.strictEqual(none.beat, '')
assert.strictEqual(none.otherBeats, '')
assert.strictEqual(none.storyTitle, 'The Long Way')
assert.strictEqual(none.chapterCount, '3')

// First chapter has no previous; last has no next.
assert.strictEqual(storyTokens({ ...args, chapterId: 1, blockId: 'a' }).previousChapterSummary, '')
assert.strictEqual(storyTokens({ ...args, chapterId: 3, blockId: 'f' }).nextChapterTitle, '')

// Swapping: known tokens go, case folds, unknown ones survive untouched.
assert.strictEqual(
  swapStoryTokens('Chapter {{chapterNumber}} of {{CHAPTERCOUNT}}: {{chapterTitle}}', t),
  'Chapter 2 of 3: The Road',
)
assert.strictEqual(swapStoryTokens('{{char}} and {{nonsense}}', t), '{{char}} and {{nonsense}}')
assert.strictEqual(swapStoryTokens('', t), '')

// A line whose only known token is empty is dropped whole, sentence and all.
assert.strictEqual(swapStoryTokens('Recap: {{chapterSummary}}.', t), '')
assert.strictEqual(
  swapStoryTokens('Write this next: {{beat}}\nRecap: {{chapterSummary}}.\nKeep going.', t),
  'Write this next: Mary is searched\nKeep going.',
)
// Mixed line: one token has content. The line stays and the empty one blanks in place.
assert.strictEqual(swapStoryTokens('{{chapterTitle}} / {{chapterSummary}}', t), 'The Road / ')
// Lines with no known tokens are never touched, empty or not.
assert.strictEqual(swapStoryTokens('plain\n\n{{nonsense}}', t), 'plain\n\n{{nonsense}}')

// The default stack's Beat block on a beat with no instructions: that line drops. The target
// line stays: the Chapter has a target and this beat still has a share of it.
const unwritten = storyTokens({ ...args, blockId: 'e' })
assert.strictEqual(unwritten.beat, '')
assert.strictEqual(
  swapStoryTokens('Write this next: {{beat}}\nAim for about {{beatTargetWords}} words.', unwritten),
  'Aim for about 282 words.',
)
// In a Chapter with no target, only the target line goes.
assert.strictEqual(
  swapStoryTokens(
    'Write this next: {{beat}}\nAim for about {{beatTargetWords}} words.',
    noTarget,
  ),
  'Write this next: She packs',
)

console.log('checkStoryTokens ok')
