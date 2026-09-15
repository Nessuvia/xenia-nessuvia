import assert from 'node:assert/strict'
import { classify, drawAcrostic, firstLetter, shapeOf } from './draw.ts'
import { acrosticWindow } from './window.ts'
import { defaultAcrosticConfig } from '../postStack.ts'

// Classifying: a quotation is dialogue, a whole italic sentence is thought, the rest is action.
assert.equal(classify('"Get out," she said.'), 'dialogue')
assert.equal(classify('*He is lying.*'), 'thought')
assert.equal(classify('_Not again._'), 'thought')
assert.equal(classify('*He is lying*.'), 'thought')
assert.equal(classify('She closed the door.'), 'action')
assert.equal(classify('**Loud** noises came.'), 'action')

assert.deepEqual(shapeOf('One. Two. Three.\n\nFour. Five.'), [3, 2])
assert.equal(firstLetter('"Maybe," he said.'), 'M')

// The window: assistant replies only, oldest first, reasoning cut, stopping at a divider, capped.
const messages = [
  { role: 'assistant', content: 'Before the break.' },
  { role: 'user', content: '/break', divider: true },
  { role: 'assistant', content: '<think>plan</think>After.', reasoningEnd: '<think>plan</think>'.length },
  { role: 'user', content: 'Hi.' },
  { role: 'assistant', content: 'Latest.' },
]
assert.deepEqual(acrosticWindow(messages), ['After.', 'Latest.'])
assert.deepEqual(acrosticWindow(messages, 1), ['Latest.'])

const window = [
  'Mara waited. "You came," she said. *Finally.*\n\nThe rain kept on. He shrugged.',
  'Mara laughed. The fire cracked. "Sit," she said.\n\nHe sat. *Too close.* She noticed.',
]
const previous = shapeOf(window[1])
const config = { ...defaultAcrosticConfig, beatSlots: 1 }

for (let seed = 0; seed < 300; seed++) {
  const t = drawAcrostic(window, config, seed)
  const slots = t.paragraphs.flat()
  assert.notDeepEqual(t.paragraphs.map((p) => p.length), previous, `seed ${seed}: same shape as the previous reply`)
  for (const s of slots) {
    if (s.type === 'dialogue' || s.type === 'beat') assert.equal(s.letter, undefined, `seed ${seed}: ${s.type} has a letter`)
    else assert.ok(s.letter, `seed ${seed}: ${s.type} has no letter`)
  }
  assert.equal(slots.filter((s) => s.type === 'beat').length, 1, `seed ${seed}: beat count`)
  assert.notEqual(slots[slots.length - 1].type, 'beat', `seed ${seed}: beat is last`)
  const firstLettered = slots.find((s) => s.letter)
  if (firstLettered) assert.notEqual(firstLettered.letter, 'M', `seed ${seed}: repeats the previous opening letter`)
  // Clamped to the config.
  assert.ok(t.paragraphs.length >= config.paragraphs[0] && t.paragraphs.length <= config.paragraphs[1])
  for (const p of t.paragraphs) assert.ok(p.length >= config.sentencesPerParagraph[0] && p.length <= config.sentencesPerParagraph[1])
}

// The same seed gives the same template, and ids run paragraph.sentence from 1.
assert.deepEqual(drawAcrostic(window, config, 42), drawAcrostic(window, config, 42))
assert.deepEqual(drawAcrostic(window, config, 42).paragraphs[0].map((s) => s.id).slice(0, 2), ['1.1', '1.2'])

// A config that allows only the previous shape still draws, rather than looping.
const fixed = { ...config, paragraphs: [2, 2] as [number, number], sentencesPerParagraph: [3, 3] as [number, number] }
assert.deepEqual(drawAcrostic(['A. B. C.\n\nD. E. F.'], fixed, 1).paragraphs.map((p) => p.length), [3, 3])

// An empty window draws from the config alone, and never places a beat when there is one slot.
const lone = drawAcrostic([], { ...config, paragraphs: [1, 1], sentencesPerParagraph: [1, 1] }, 3)
assert.equal(lone.paragraphs.flat().length, 1)
assert.notEqual(lone.paragraphs[0][0].type, 'beat')
