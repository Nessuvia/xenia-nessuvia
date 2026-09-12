import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import type { Character, Message } from '../storage/types'
import { countMessages, countTokens, perMessageOverhead } from '../prompt/budget.ts'
import { buildRewritePrompt, rewriteInstruction } from './buildRewritePrompt.ts'
import { defaultRewriteConfig, type RewriteStage } from './pipeline.ts'

const character = {
  name: 'Vera',
  description: '{{char}} speaks in short flat sentences and never explains herself.',
  altDescriptions: [],
  activeDescriptionIndex: -1,
} as unknown as Character

const history: Message[] = Array.from({ length: 8 }, (_, i) => ({
  ownerId: 'local',
  chatId: 1,
  role: i % 2 === 0 ? 'user' : 'assistant',
  content: `turn ${i}`,
  createdAt: i,
}))

const config: RewriteStage['config'] = {
  ...defaultRewriteConfig,
  preset: 'Rewrite as {{char}} talking to {{user}}.',
}

const base = { character, userName: 'Dom', messages: history, text: 'the first pass' }

// The shape: preset first, card second, history, passage last.
const full = buildRewritePrompt({ ...base, config })
assert.equal(full[0].role, 'system')
assert.equal(full[0].content, 'Rewrite as Vera talking to Dom.')
assert.equal(full[1].role, 'system')
assert.match(full[1].content, /^Vera\n/)
// The card's own {{char}} resolves too: a description written with tokens reads correctly.
assert.match(full[1].content, /Vera speaks in short flat sentences/)
assert.equal(full.at(-1)!.role, 'user')
assert.equal(full.at(-1)!.content, `${rewriteInstruction}\n\nthe first pass`)

// historyCount is a count of turns, and it takes them off the end.
for (const historyCount of [0, 1, 3, 5, 8, 20]) {
  const out = buildRewritePrompt({ ...base, config: { ...config, historyCount } })
  const kept = Math.min(historyCount, history.length)
  assert.equal(out.length, 2 + kept + 1, `historyCount ${historyCount}`)
  if (kept) {
    assert.equal(out[2].content, `turn ${history.length - kept}`)
    assert.equal(out.at(-2)!.content, 'turn 7')
  }
}

// History goes in as its own roles, not flattened into one turn.
const roles = buildRewritePrompt({ ...base, config: { ...config, historyCount: 4 } })
  .slice(2, -1)
  .map((m) => m.role)
assert.deepEqual(roles, ['user', 'assistant', 'user', 'assistant'])

// includeCharacter: false drops the card turn and nothing else.
const noCard = buildRewritePrompt({ ...base, config: { ...config, includeCharacter: false } })
assert.equal(noCard.length, full.length - 1)
assert.ok(!noCard.some((m) => m.content.includes('short flat sentences')))

// No character at all is the same window minus the card, not a crash.
const noChar = buildRewritePrompt({ ...base, character: undefined, config })
assert.equal(noChar.length, full.length - 1)
assert.equal(noChar[0].content, 'Rewrite as the character talking to Dom.')

// A card with an empty description contributes no turn rather than a blank one.
const blank = { ...character, description: '' } as Character
assert.equal(buildRewritePrompt({ ...base, character: blank, config }).length, full.length - 1)

// Not armed: no preset, or a presetId naming one that was deleted. Empty array either way, which
// is the caller's signal that nothing should be sent and nothing marked as failed.
assert.deepEqual(buildRewritePrompt({ ...base, config: { ...config, preset: '' } }), [])
assert.deepEqual(buildRewritePrompt({ ...base, config: { ...config, preset: '   ' } }), [])
assert.deepEqual(buildRewritePrompt({ ...base, config: { ...config, preset: '' } }), [])

// The budget trims history and never the window's fixed parts. A context this small leaves room
// for the preset, the card and the passage, and for none of the history.
// Sized off the window itself rather than off a literal: editing the fixture text above cannot
// quietly turn these into no-ops.
const fixedCost = countMessages([full[0], full[1], full.at(-1)!])
const turnCost = countTokens('turn 0') + perMessageOverhead
const roomFor = (turns: number) => ({
  contextLimit: fixedCost + 8 + turnCost * turns + 1,
  maxTokens: 8,
  safetyMarginPct: 0,
})

const tiny = buildRewritePrompt({ ...base, config }, roomFor(0))
assert.equal(tiny.length, 3)
assert.equal(tiny.at(-1)!.content, `${rewriteInstruction}\n\nthe first pass`)
// Room for two turns keeps the two newest, not the two oldest.
const some = buildRewritePrompt({ ...base, config }, roomFor(2))
assert.equal(some.length, 5)
assert.deepEqual(some.slice(2, -1).map((m) => m.content), ['turn 6', 'turn 7'])
// A roomy budget keeps every turn historyCount asked for.
const roomy = buildRewritePrompt({ ...base, config }, roomFor(50))
assert.equal(roomy.length, full.length)

// The banned list is its own system turn, and only when there is a list and the toggle is on.
const banned = ['swallowed hard', 'something unreadable']
const withBanned = buildRewritePrompt({ ...base, config, banned })
const bannedTurn = withBanned.find((m) => m.content.includes('swallowed hard'))
assert.ok(bannedTurn, 'the phrases should be in the prompt')
assert.equal(bannedTurn!.role, 'system')
assert.ok(bannedTurn!.content.includes('something unreadable'))
// It never lands on the preset turn or the passage turn.
assert.ok(!withBanned[0].content.includes('swallowed hard'), 'the preset turn is left alone')
assert.equal(withBanned.at(-1)!.content, `${rewriteInstruction}\n\nthe first pass`)
// Off, or empty, and the turn is not there at all.
assert.equal(
  buildRewritePrompt({ ...base, config: { ...config, promptBannedList: false }, banned }).length,
  buildRewritePrompt({ ...base, config }).length,
)
assert.equal(buildRewritePrompt({ ...base, config, banned: [] }).length, buildRewritePrompt({ ...base, config }).length)

// The slim window is the feature. Reaching for buildPrompt would put the whole chat stack back in.
const source = readFileSync(new URL('./buildRewritePrompt.ts', import.meta.url), 'utf8')
assert.ok(!/from '.*\/buildPrompt/.test(source), 'buildRewritePrompt must not import buildPrompt')
assert.ok(!source.includes('buildPrompt('), 'buildRewritePrompt must not call buildPrompt')

console.log('checkRewritePrompt ok')
