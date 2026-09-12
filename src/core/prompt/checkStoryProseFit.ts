// Run: node --experimental-strip-types src/core/prompt/checkStoryProseFit.ts
//
// The ladder that degrades Story prose to beat instructions, oldest first. Non-trivial: it decides
// what the model stops being able to see, and it has to stay in step with storyProseSplit.
import assert from 'node:assert'
import { fitStoryProse, storyProseSplit, type GuideChapter } from './chapterGuide.ts'
import type { Block } from '../storage/types.ts'

let b = 0
/** Prose runs to six lines: degrading a Block actually shrinks the text. With prose shorter than
 *  its own instructions the ladder still walks, but every rung costs more than the last. Only
 *  the floor is reachable, and that tests nothing. */
const prose = (tag: string) => [tag, 'x', 'x', 'x', 'x', 'x'].join('\n')
const beat = (instructions: string, tag: string): Block => ({
  id: `b${++b}`,
  beat: instructions,
  weight: 'normal',
  content: prose(tag),
  context: 'both',
})
/** A beat the Author has not planned yet: prose, but nothing to degrade it to. */
const unplanned = (tag: string): Block => beat('', tag)

const chapters = (): GuideChapter[] => [
  {
    id: 1,
    title: 'The Betrayal',
    summary: 'Damien finds out.',
    guideSend: 'both',
    blocks: [beat('He goes to the park', 'PROSE 1A'), beat('He is followed', 'PROSE 1B')],
  },
  {
    id: 2,
    title: 'The Road',
    summary: 'They leave the city.',
    guideSend: 'both',
    blocks: [beat('She packs', 'PROSE 2A'), beat('The checkpoint', 'PROSE 2B')],
  },
  {
    id: 3,
    title: 'Arrival',
    summary: '',
    guideSend: 'both',
    blocks: [beat('The handoff', 'PROSE 3A')],
  },
]

/** One token per line: an allowance is a line count and the cases read as counts. */
const lines = (s: string) => (s === '' ? 0 : s.split('\n').length)
const fit = (allowance: number, cs = chapters()) =>
  fitStoryProse(cs, 3, null, 'both', allowance, lines)

// --- room for everything: byte-identical to the undegraded split -------------
{
  const cs = chapters()
  const out = fit(45, cs)
  assert.strictEqual(out.text, storyProseSplit(cs, 3, null, 'both').text)
  assert.strictEqual(out.degradedCount, 0)
  // Four Blocks sit before the active Chapter; the active Chapter's own is not degradable.
  assert.strictEqual(out.degradable, 4)
}

// --- the oldest Block goes first, and only it --------------------------------
{
  const out = fit(36)
  assert.strictEqual(out.degradedCount, 1)
  assert.ok(!out.text.includes('PROSE 1A'), 'the oldest prose is gone')
  assert.ok(out.text.includes('Beat 1: He goes to the park'), 'replaced by its instructions')
  assert.ok(out.text.includes('PROSE 1B'), 'its neighbour is untouched')
  assert.ok(out.text.includes('PROSE 2A'))
  // The Chapter it belongs to grows a header naming it.
  assert.ok(out.text.includes('Chapter 1 - The Betrayal. Damien finds out.'))
  // And loses the plain divider it would otherwise have had.
  assert.ok(!out.text.includes('- Chapter 1'))
}

// --- a Chapter is finished before the next one is touched --------------------
{
  const out = fit(31)
  assert.strictEqual(out.degradedCount, 2)
  assert.ok(out.text.includes('Beat 1: He goes to the park'))
  assert.ok(out.text.includes('Beat 2: He is followed'))
  // Chapter 2 still has both its prose Blocks and its ordinary divider.
  assert.ok(out.text.includes('PROSE 2A'))
  assert.ok(out.text.includes('PROSE 2B'))
  assert.ok(out.text.includes('- Chapter 2: The Road -'))
}

// --- a fully degraded Story looks like the plan --------------------------------
{
  const out = fit(1)
  assert.strictEqual(out.degradedCount, 4)
  assert.strictEqual(
    out.text,
    [
      'Chapter 1 - The Betrayal. Damien finds out.',
      'Beat 1: He goes to the park',
      'Beat 2: He is followed',
      'Chapter 2 - The Road. They leave the city.',
      'Beat 1: She packs',
      'Beat 2: The checkpoint',
      // The active Chapter keeps its ordinary divider and every line of its prose.
      '- Chapter 3: Arrival -',
      prose('PROSE 3A'),
    ].join('\n\n'),
  )
}

// --- the active Chapter is never degraded ------------------------------------
{
  // Even at an allowance nothing can meet, the passage being written into survives whole.
  const out = fit(0)
  assert.ok(out.text.includes('PROSE 3A'))
  assert.strictEqual(out.degradedCount, out.degradable)
}

// --- guideSend decides what a degraded Chapter gives -------------------------
{
  const send = (mode: GuideChapter['guideSend']) => {
    const cs = chapters()
    cs[0].guideSend = mode
    // The floor: every Chapter is degraded whatever this mode costs. An 'off' Chapter is free
    // once degraded. A middling allowance would stop the ladder before Chapter 2, and the last
    // case here would test nothing.
    return fit(1, cs).text
  }

  const both = send('both')
  assert.ok(both.includes('Chapter 1 - The Betrayal. Damien finds out.'))
  assert.ok(both.includes('Beat 1: He goes to the park'))

  const summary = send('summary')
  assert.ok(summary.includes('Chapter 1 - The Betrayal. Damien finds out.'))
  assert.ok(!summary.includes('He goes to the park'), 'summary only: no beat lines')

  const beats = send('beats')
  assert.ok(beats.includes('Chapter 1 - The Betrayal'), 'beats only: a bare title, no recap')
  assert.ok(!beats.includes('Damien finds out.'))
  assert.ok(beats.includes('Beat 1: He goes to the park'))

  const off = send('off')
  assert.ok(!off.includes('The Betrayal'), 'off: nothing at all')
  assert.ok(!off.includes('He goes to the park'))
  assert.ok(off.includes('Beat 1: She packs'), 'and it does not silence the other Chapters')
}

// --- Blocks with no instructions vanish rather than emitting an empty line ----
{
  const cs = chapters()
  cs[0].blocks = [unplanned('PROSE 1A'), beat('   ', 'PROSE 1B'), beat('He is followed', 'PROSE 1C')]
  const out = fit(1, cs)
  assert.ok(!out.text.includes('PROSE 1A'))
  assert.ok(!out.text.includes('PROSE 1B'))
  assert.ok(!/Beat \d+: *$/m.test(out.text), 'no beat line with nothing after the colon')
  // Numbering is the Block's own position. A beat that contributes no line still holds its
  // place: the third Block is Beat 3.
  assert.ok(out.text.includes('Beat 3: He is followed'))
}

// --- degrading respects the caret split, same as storyProseSplit --------------
{
  const cs = chapters()
  const target = cs[2].blocks[0]
  const out = fitStoryProse(cs, 3, target.id, 'both', 24, lines)
  // The Block being replaced is in neither half, degraded or not.
  assert.ok(!out.text.includes('PROSE 3A'))
  assert.strictEqual(out.trailing, '')
  assert.ok(out.text.includes('Beat 1: He goes to the park'))
}

console.log('checkStoryProseFit ok')
