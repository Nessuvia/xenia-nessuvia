// Run: node --experimental-strip-types src/core/prompt/checkBuildStoryPrompt.ts
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import type { PromptStack } from '../storage/types'
import { templateProblems } from './stackTemplate.ts'
import {
  beatValues,
  buildStoryPrompt,
  castText,
  fitEndBackward,
  fitStartForward,
  storyScanText,
  type StoryInputs,
} from './buildStoryPrompt.ts'

const stack = (...lines: string[]): PromptStack => ({ ownerId: 'local', name: 's', kind: 'story', template: lines.join('\n') })

const inputs = (over: Partial<StoryInputs> = {}): StoryInputs => ({
  action: 'continue',
  before: '',
  after: '',
  selection: '',
  instruction: '',
  title: 'T',
  premise: '',
  ending: '',
  beat: '',
  nextBeats: [],
  doneBeats: [],
  note: '',
  cast: '',
  castNames: [],
  ...over,
})

const branched = stack(
  'You co-write "{{title}}".',
  '{% if beat %}',
  'Next: {{beat}}',
  '{% endif %}',
  '{% message assistant %}',
  '{{ before }}',
  '{% endmessage %}',
  '{% message user %}',
  "{% if action = 'rewrite' %}",
  'Rewrite: {{selection}} ({{instruction}})',
  '{% elif action = shorten %}',
  'Shorten: {{selection}}',
  '{% else %}',
  'Continue.{% if after %} Lead into: {{after}}{% endif %}',
  '{% endif %}',
  'Later: {{nextBeats}}',
  '{% endmessage %}',
)

// Continue: values land, empty branches drop, lists render as lines.
{
  const out = buildStoryPrompt(branched, inputs({ before: 'The rain fell.', beat: 'Mara finds the letter', nextBeats: ['a', 'b'] })).messages
  assert.deepStrictEqual(out, [
    { role: 'system', content: 'You co-write "T".\nNext: Mara finds the letter' },
    { role: 'assistant', content: 'The rain fell.' },
    { role: 'user', content: 'Continue.\nLater: - a\n- b' },
  ])
}

// Mid-document continue reaches `after`; actions branch, with or without quotes.
{
  const mid = buildStoryPrompt(branched, inputs({ before: 'x', after: 'She left.' })).messages.at(-1)!.content
  assert.ok(mid.startsWith('Continue. Lead into: She left.'))
  const rw = buildStoryPrompt(branched, inputs({ action: 'rewrite', selection: 'old', instruction: 'darker' })).messages.at(-1)!.content
  assert.ok(rw.startsWith('Rewrite: old (darker)'))
  const sh = buildStoryPrompt(branched, inputs({ action: 'shorten', selection: 'long' })).messages.at(-1)!.content
  assert.ok(sh.startsWith('Shorten: long'))
}

// A {{token}} typed into the document stays as typed.
{
  const out = buildStoryPrompt(branched, inputs({ before: 'He said {{beat}}.', beat: 'X' })).messages
  assert.strictEqual(out[1].content, 'He said {{beat}}.')
}

// Overflow trims `before` from the top and keeps the newest lines.
{
  const before = Array.from({ length: 200 }, (_, i) => `Line ${i} of the long story goes here.`).join('\n')
  const built = buildStoryPrompt(branched, inputs({ before }), { contextLimit: 600, maxTokens: 100, safetyMarginPct: 0 })
  assert.ok(built.droppedChars > 0)
  assert.ok(built.beforeIncluded.endsWith('Line 199 of the long story goes here.'))
  assert.ok(!built.beforeIncluded.includes('Line 0 '))
}

// The bundled Story stack renders for every action with no tag or slot left in it, empty plan or
// full. A leftover `{{ name }}` is what the model sees when a slot goes unfilled.
{
  const file = JSON.parse(readFileSync(new URL('../../modules/prompts/defaultStoryStack.json', import.meta.url), 'utf8'))
  const bundled = stack(file.template)
  const full = { before: 'Text.', after: 'More.', selection: 'Old.', instruction: 'Darker.', premise: 'P', ending: 'E', beat: 'B', nextBeats: ['N'], doneBeats: ['D'], note: 'Note', cast: 'Name: Mara', castNames: ['Mara'] }
  for (const action of ['continue', 'rewrite', 'expand', 'shorten'] as const) {
    for (const over of [{}, full]) {
      const text = buildStoryPrompt(bundled, inputs({ action, ...over })).messages.map((m) => m.content).join('\n')
      assert.ok(!/\{\{|\{%|\{#/.test(text), `${action}: leftover tag in\n${text.match(/.*(\{\{|\{%|\{#).*/)?.[0]}`)
    }
  }
  const cont = buildStoryPrompt(bundled, inputs({ ...full, action: 'continue' })).messages.map((m) => m.content).join('\n')
  assert.ok(cont.includes('Aim for about 150 words.') && cont.includes('1. Is it about 150 words?'))
  assert.ok(cont.includes('Follow this direction for this passage: Darker.'))
  const shrink = buildStoryPrompt(bundled, inputs({ ...full, action: 'shorten' })).messages.map((m) => m.content).join('\n')
  assert.ok(shrink.includes('1. Is it about half as long as the old passage?') && !shrink.includes('<length>'))
}

// FF Xenia Edition: clean for every action and every setting of its dropdowns, and the POV falls
// back to the first cast member.
{
  const template = readFileSync(new URL('../../modules/prompts/ffXeniaStory.txt', import.meta.url), 'utf8')
  assert.deepStrictEqual(templateProblems(template, 'story'), [])
  const full = { before: 'Text.', after: 'More.', selection: 'Old.', instruction: 'Darker.', premise: 'P', beat: 'B', note: 'N', cast: 'Name: Mara', castNames: ['Mara', 'Dom'] }
  const settings = [
    {},
    { pov: 'Second', adultMode: 'Realism', reasoning: 'Max', proseStyle: 'Storybook' },
    { pov: 'First', adultMode: 'Freaky', reasoning: 'Micro', povCharacter: 'Dom' },
    { pov: 'Hybrid', reasoning: 'Off' },
  ]
  for (const values of settings) {
    const ff = { ...stack(template), values }
    for (const action of ['continue', 'rewrite', 'expand', 'shorten'] as const) {
      for (const over of [{}, full]) {
        const text = buildStoryPrompt(ff, inputs({ action, ...over })).messages.map((m) => m.content).join('\n')
        assert.ok(!/\{\{|\{%|\{#/.test(text), `FF ${JSON.stringify(values)} ${action}: ${text.match(/.*(\{\{|\{%|\{#).*/)?.[0]}`)
      }
    }
  }
  const pov = (values: Record<string, string>) =>
    buildStoryPrompt({ ...stack(template), values }, inputs(full)).messages[0].content.match(/POV character: (.*)\./)?.[1]
  assert.strictEqual(pov({}), 'Mara')
  assert.strictEqual(pov({ povCharacter: 'Dom' }), 'Dom')
  assert.strictEqual(buildStoryPrompt(stack(template), inputs()).messages[0].content.match(/POV character: (.*)\./)?.[1], 'the main character')
}

// --- helpers ----------------------------------------------------------------
{
  const b = (text: string, done = false) => ({ text, done })
  assert.deepStrictEqual(beatValues([b('a', true), b(' '), b('b'), b('c', true), b('d')]), {
    beat: 'b',
    nextBeats: ['d'],
    doneBeats: ['a', 'c'],
  })
  assert.deepStrictEqual(beatValues([]), { beat: '', nextBeats: [], doneBeats: [] })
}
{
  const t = castText([{ name: 'Mark', description: 'a tired clerk', personality: 'anxious' }, { name: 'Dom', description: 'a bard' }])
  assert.ok(t.includes('Name: Mark') && t.includes('anxious') && t.includes('Name: Dom'))
  assert.strictEqual(fitEndBackward('a '.repeat(1000), 5), '')
  assert.strictEqual(fitEndBackward('tiny', 100), 'tiny')
  const lines = Array.from({ length: 50 }, (_, i) => `tail line ${i}`).join('\n')
  const kept = fitStartForward(lines, 60)
  assert.ok(kept.startsWith('tail line 0') && !kept.includes('tail line 49'))
  assert.deepStrictEqual(storyScanText('one\n\ntwo', ['', 'the beat']), [
    { content: 'one' },
    { content: 'two' },
    { content: 'the beat' },
  ])
}

console.log('checkBuildStoryPrompt ok')
