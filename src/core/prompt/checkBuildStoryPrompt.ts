// Run: node --experimental-strip-types src/core/prompt/checkBuildStoryPrompt.ts
import assert from 'node:assert'
import type { PromptBlock, PromptStack } from '../storage/types'
import type { Budget } from './budget.ts'
import {
  buildStoryPrompt,
  castText,
  fitEndBackward,
  fitStartForward,
  maxTrailingTokens,
  storyScanText,
} from './buildStoryPrompt.ts'

let n = 0
function block(b: Partial<PromptBlock>): PromptBlock {
  return { id: `b${++n}`, label: 'b', source: 'text', role: 'system', content: '', ...b }
}
function stack(active: PromptBlock[]): PromptStack {
  return { ownerId: 'local', name: 's', kind: 'story', active }
}

// A default-shaped Story stack: system, cast, story context, beat.
const defaultish = () =>
  stack([
    block({ label: 'sys', content: 'You are a co-writer.' }),
    block({ label: 'cast', source: 'cast' }),
    block({ label: 'story', source: 'storyContext' }),
    block({ label: 'beat', role: 'user', content: 'Write this next: {{beat}}' }),
  ])

// --- castText flattens enabled members --------------------------------------
{
  const t = castText([
    { name: 'Mark', description: 'a tired clerk', personality: 'anxious' },
    { name: 'Dom', description: 'a bard' },
  ])
  assert.ok(t.includes('Name: Mark'))
  assert.ok(t.includes('a tired clerk'))
  assert.ok(t.includes('anxious'))
  assert.ok(t.includes('Name: Dom'))
}

// --- fixed prefix + Direction land, Direction is last -----------------------
{
  const out = buildStoryPrompt({
    stack: defaultish(),
    castText: 'Name: Mark',
    tokens: {},
    storyText: 'The rain fell.',
    direction: 'Write two paragraphs.',
  }).messages
  // system merges (sys + cast, both system), then the story (system), then the user Direction.
  assert.deepStrictEqual(out.at(-1), { role: 'user', content: 'Write two paragraphs.' })
  assert.ok(out.some((m) => m.content.includes('Name: Mark')))
  assert.ok(out.some((m) => m.content.includes('The rain fell.')))
  // The beat block has no beat behind it: its one line drops and it produces no turn.
  assert.ok(!out.some((m) => m.content.includes('undefined')))
}

// --- cold start: empty Story still generates --------------------------------
{
  const built = buildStoryPrompt({
    stack: defaultish(),
    castText: 'Name: Mark',
    tokens: {},
    storyText: '',
    direction: 'Open the story.',
  })
  assert.strictEqual(built.storyIncluded, '')
  assert.deepStrictEqual(built.messages.at(-1), { role: 'user', content: 'Open the story.' })
  assert.ok(built.messages.some((m) => m.content.includes('Name: Mark')))
}

// --- Direction is never merged into the prose, even with no cast ------------
{
  const out = buildStoryPrompt({
    stack: stack([block({ source: 'storyContext' })]),
    castText: '',
    tokens: {},
    storyText: 'once upon a time',
    direction: 'continue',
  }).messages
  assert.strictEqual(out.length, 2) // story (system) + direction (user)
  assert.strictEqual(out[0].role, 'system')
  assert.strictEqual(out[0].content, 'once upon a time')
  assert.deepStrictEqual(out[1], { role: 'user', content: 'continue' })
}

// --- scrolling context: end-backward, newest kept, oldest dropped -----------
{
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
  const budget: Budget = { contextLimit: 200, maxTokens: 50, safetyMarginPct: 0 }
  const built = buildStoryPrompt(
    {
      stack: stack([block({ content: 'sys' }), block({ source: 'storyContext' })]),
      castText: '',
      tokens: {},
      storyText: lines,
      direction: 'go',
    },
    budget,
  )
  assert.ok(built.droppedChars > 0, 'a tight budget drops the top of the Story')
  assert.ok(built.storyIncluded.includes('line 199'), 'the newest prose is kept')
  assert.ok(!built.storyIncluded.includes('line 0'), 'the oldest prose falls off first')
  // Everything that survived is a contiguous tail: no reordering.
  const kept = built.storyIncluded.split('\n')
  assert.strictEqual(kept.at(-1), 'line 199')
}

// --- the whole Story fits when the budget is large --------------------------
{
  const built = buildStoryPrompt(
    {
      stack: stack([block({ source: 'storyContext' })]),
      castText: '',
      tokens: {},
      storyText: 'short story',
      direction: 'go',
    },
    { contextLimit: 4096, maxTokens: 100, safetyMarginPct: 5 },
  )
  assert.strictEqual(built.droppedChars, 0)
  assert.strictEqual(built.storyIncluded, 'short story')
}

// --- fitEndBackward: a single over-budget line keeps nothing ----------------
assert.strictEqual(fitEndBackward('a '.repeat(1000), 5), '')
assert.strictEqual(fitEndBackward('tiny', 100), 'tiny')

// --- disabled blocks contribute nothing -------------------------------------
{
  const out = buildStoryPrompt({
    stack: stack([
      block({ content: 'kept' }),
      block({ content: 'silenced', disabled: true }),
      block({ source: 'storyContext' }),
    ]),
    castText: '',
    tokens: {},
    storyText: 'prose',
    direction: 'go',
  }).messages
  assert.ok(!out.some((m) => m.content.includes('silenced')))
  assert.ok(out.some((m) => m.content.includes('kept')))
}

// --- bound blocks resolve when nested inside a wrapper ----------------------
{
  const built = buildStoryPrompt({
    stack: stack([
      block({
        content: '<character>',
        closeContent: '</character>',
        children: [block({ source: 'cast' })],
      }),
      block({ source: 'storyContext' }),
    ]),
    castText: 'Name: Mark',
    tokens: {},
    storyText: 'prose',
    direction: 'go',
  })
  const wrapped = built.messages.find((m) => m.content.includes('<character>'))!
  assert.ok(wrapped, 'the wrapper block is present')
  assert.ok(wrapped.content.includes('Name: Mark'), 'a nested Cast block contributes its text')
  assert.ok(wrapped.content.indexOf('Name: Mark') < wrapped.content.indexOf('</character>'))
  assert.ok(built.fixedTokens > 0)
}

// --- a nested Story context still trims against the budget ------------------
{
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
  const built = buildStoryPrompt(
    {
      stack: stack([
        block({
          content: '<story>',
          closeContent: '</story>',
          children: [block({ source: 'storyContext' })],
        }),
      ]),
      castText: '',
      tokens: {},
      storyText: lines,
      direction: 'go',
    },
    { contextLimit: 200, maxTokens: 50, safetyMarginPct: 0 },
  )
  assert.ok(built.droppedChars > 0)
  assert.ok(built.storyIncluded.includes('line 199'))
  assert.ok(built.messages[0].content.startsWith('<story>'))
  assert.ok(built.messages[0].content.includes('line 199'))
}

// --- a disabled nested Cast block contributes nothing -----------------------
{
  const out = buildStoryPrompt({
    stack: stack([
      block({
        content: '<character>',
        closeContent: '</character>',
        children: [block({ source: 'cast', disabled: true })],
      }),
      block({ source: 'storyContext' }),
    ]),
    castText: 'Name: Mark',
    tokens: {},
    storyText: 'prose',
    direction: 'go',
  }).messages
  assert.ok(!out.some((m) => m.content.includes('Name: Mark')))
}

// --- fitStoryText replaces the line chop, and only when a budget exists -------
{
  const long = Array.from({ length: 200 }, (_, i) => `line ${i} of the prose`).join('\n')
  const tight: Budget = { contextLimit: 220, maxTokens: 60, safetyMarginPct: 0 }
  let asked = -1

  const built = buildStoryPrompt(
    {
      stack: stack([block({ source: 'storyContext' })]),
      castText: '',
      tokens: {},
      storyText: long,
      fitStoryText: (available) => {
        asked = available
        return 'Beat 1: he wakes'
      },
      direction: 'go',
    },
    tight,
  )
  const text = built.messages.map((m) => m.content).join('\n')
  assert.strictEqual(text.includes('Beat 1: he wakes'), true)
  assert.ok(!text.includes('line 0 of the prose'))
  // Handed the room left after the fixed prefix, not the whole window.
  assert.ok(asked > 0 && asked < 220)

  // No budget, no fit: the whole prose goes, closure or not.
  const whole = buildStoryPrompt({
    stack: stack([block({ source: 'storyContext' })]),
    castText: '',
    tokens: {},
    storyText: long,
    fitStoryText: () => 'Beat 1: he wakes',
    direction: 'go',
  })
  assert.ok(whole.messages.map((m) => m.content).join('\n').includes('line 0 of the prose'))
}

// --- the trailing "What follows" block ---------------------------------------
{
  const withTrailing = () =>
    stack([
      block({ label: 'story', source: 'storyContext' }),
      block({ label: 'follows', source: 'storyTrailing', content: 'Lead into this:' }),
    ])

  // With a caret, the trailing prose lands, carrying the block's own instruction text.
  const out = buildStoryPrompt({
    stack: withTrailing(),
    castText: '',
    tokens: {},
    storyText: 'He opened the door.',
    storyTrailing: 'She was already gone.',
    direction: 'describe the room',
  })
  const text = out.messages.map((m) => m.content).join('\n')
  assert.ok(text.includes('Lead into this:'))
  assert.ok(text.includes('She was already gone.'))

  // No caret is the common case: the block drops out whole rather than sending its instruction
  // pointing at nothing.
  const none = buildStoryPrompt({
    stack: withTrailing(),
    castText: '',
    tokens: {},
    storyText: 'He opened the door.',
    storyTrailing: '',
    direction: 'describe the room',
  })
  const noneText = none.messages.map((m) => m.content).join('\n')
  assert.ok(!noneText.includes('Lead into this:'))
  // An absent field behaves the same as an empty one.
  assert.deepStrictEqual(
    buildStoryPrompt({
      stack: withTrailing(),
      castText: '',
      tokens: {},
      storyText: 'He opened the door.',
      direction: 'describe the room',
    }).messages,
    none.messages,
  )

  // It is priced as fixed: it costs the Story prose rather than riding free.
  assert.ok(out.fixedTokens > none.fixedTokens)
}

// --- fitStartForward keeps the text nearest the caret -------------------------
{
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i} of the tail`).join('\n')
  const kept = fitStartForward(lines, 60)
  assert.ok(kept.startsWith('line 0 of the tail'), 'keeps the start, not the end')
  assert.ok(!kept.includes('line 199'))
  assert.ok(kept.length < lines.length)
  // Everything fits: unchanged. Nothing fits: empty rather than a partial line.
  assert.strictEqual(fitStartForward('short tail', 1000), 'short tail')
  assert.strictEqual(fitStartForward(lines, 0), '')
}

// --- a huge tail is capped so it can't crowd out the Story context ------------
{
  const huge = Array.from({ length: 4000 }, (_, i) => `tail line ${i}`).join('\n')
  const built = buildStoryPrompt({
    stack: stack([block({ source: 'storyContext' }), block({ source: 'storyTrailing' })]),
    castText: '',
    tokens: {},
    storyText: 'the prose so far',
    storyTrailing: huge,
    direction: 'go',
  })
  const text = built.messages.map((m) => m.content).join('\n')
  assert.ok(text.includes('tail line 0'))
  assert.ok(!text.includes('tail line 3999'))
  assert.ok(built.fixedTokens < maxTrailingTokens + 200, 'the tail is capped, not sent whole')
}

// --- Story tokens reach a block's own text, and only that -------------------
{
  const built = buildStoryPrompt({
    stack: stack([
      block({ label: 'sys', content: 'Chapter {{chapterNumber}} of {{storyTitle}}.' }),
      block({
        label: 'wrap',
        content: '<about {{storyTitle}}>',
        closeContent: '</about {{storyTitle}}>',
        children: [block({ label: 'cast', source: 'cast' })],
      }),
      block({ label: 'story', source: 'storyContext' }),
      block({ label: 'beat', role: 'user', content: 'Write this next: {{beat}}' }),
    ]),
    castText: 'Name: Mark',
    tokens: { storyTitle: 'Last Call', chapterNumber: '2', beat: 'She asks him to leave' },
    // The manuscript writes a token of its own. It is prose, and comes through untouched.
    storyText: 'He said "{{storyTitle}}" and meant it.',
    direction: '',
  })
  const text = built.messages.map((m) => m.content).join('\n')
  assert.ok(text.includes('Chapter 2 of Last Call.'))
  // Both halves of a wrapper get swapped, and the child renders between them unchanged.
  assert.ok(text.includes('<about Last Call>'))
  assert.ok(text.includes('</about Last Call>'))
  assert.ok(text.includes('Write this next: She asks him to leave'))
  assert.ok(text.includes('He said "{{storyTitle}}" and meant it.'), 'prose is never token-swapped')
}

// --- a beat block with no beat behind it drops out entirely -----------------
{
  const built = buildStoryPrompt({
    stack: stack([
      block({ label: 'sys', content: 'You are a co-writer.' }),
      block({ label: 'story', source: 'storyContext' }),
      block({
        label: 'beat',
        role: 'user',
        content: 'Write this next: {{beat}}\nAim for about {{beatTargetWords}} words.',
      }),
    ]),
    castText: '',
    tokens: { beat: '', beatTargetWords: '' },
    storyText: 'the prose so far',
    direction: '',
  })
  // Free prose: no beat, no target, and no user turn at all.
  assert.ok(!built.messages.some((m) => m.role === 'user'))
  assert.ok(!built.messages.some((m) => m.content.includes('Write this next')))
}

// --- world info renders in its block, and drops out when nothing matched ----
{
  const withWorld = () =>
    stack([
      block({ label: 'sys', content: 'You are a co-writer.' }),
      block({
        label: 'world',
        source: 'worldInfo',
        content: '<world>',
        closeContent: '</world>',
      }),
      block({ label: 'story', source: 'storyContext' }),
    ])
  const args = { castText: '', tokens: {}, storyText: 'the prose', direction: '' }

  const on = buildStoryPrompt({
    ...args,
    stack: withWorld(),
    worldInfo: { before: 'Ferren is a port city.', after: '' },
  })
  const text = on.messages.map((m) => m.content).join('\n')
  assert.ok(text.includes('<world>'))
  assert.ok(text.includes('Ferren is a port city.'))
  assert.ok(text.includes('</world>'))

  // Nothing matched: the wrapper goes too, rather than sending empty tags.
  const off = buildStoryPrompt({ ...args, stack: withWorld(), worldInfo: { before: '', after: '' } })
  assert.ok(!off.messages.some((m) => m.content.includes('<world>')))
  // And with no worldInfo argument at all, which is every caller that has no books.
  const none = buildStoryPrompt({ ...args, stack: withWorld() })
  assert.ok(!none.messages.some((m) => m.content.includes('<world>')))

  // World info is priced with the fixed blocks, not taken out of the Story prose's allowance.
  assert.ok(on.fixedTokens > off.fixedTokens)
}

// --- storyScanText: paragraphs stand in for messages, newest last -----------
{
  assert.deepStrictEqual(storyScanText('one\n\ntwo\n\n\n  \n\nthree'), [
    { content: 'one' },
    { content: 'two' },
    { content: 'three' },
  ])
  // Extras land after the prose: a scan depth of 1 sees the beat and not the last paragraph.
  assert.deepStrictEqual(storyScanText('one\n\ntwo', ['', 'the beat']), [
    { content: 'one' },
    { content: 'two' },
    { content: 'the beat' },
  ])
  assert.deepStrictEqual(storyScanText('', []), [])
  // A single paragraph with hard line breaks stays one unit: a blank line is what splits.
  assert.deepStrictEqual(storyScanText('a\nb'), [{ content: 'a\nb' }])
}

console.log('ok')
