// Run: node --experimental-strip-types src/core/prompt/checkTextRules.ts
import assert from 'node:assert'
import type { ReplaceRule } from '../stores/settingsStore.ts'
import { allSets, applyReplace, chatSetIds, guessTag, mergeSets } from './textRules.ts'
import { rulesFromScripts } from '../sillytavern/stRegex.ts'

const tag = (id: string, open: string) => ({ id, open, close: open.replace('<', '</'), mode: 'hide' as const })
const rule = (patch: Partial<ReplaceRule>): ReplaceRule => ({
  id: 'r', find: 'a', replace: 'b', regex: false, flags: 'g', target: 'both', enabled: true, ...patch,
})

// Default ids: Global, plus the stack's set only when it has one.
const stack = { id: 3, ownerId: 'local', name: 'Frank', active: [], textRules: { tagRules: [], replaceRules: [] } }
assert.deepEqual(chatSetIds(undefined, stack), ['global', 'stack:3'])
assert.deepEqual(chatSetIds(undefined, { ...stack, textRules: undefined }), ['global'])
assert.deepEqual(chatSetIds({ ruleSetIds: [] } as never, stack), [])

// Top set wins a shared tag; replace rules from both run.
const sets = allSets(
  { tagRules: [tag('g', '<t>')], replaceRules: [rule({ id: 'g' })] },
  [{ ...stack, textRules: { tagRules: [tag('s', '<t>'), tag('s2', '<u>')], replaceRules: [rule({ id: 's' })] } }],
  [],
)
assert.equal(sets[1].name, 'Frank')
const merged = mergeSets(['stack:3', 'global', 'gone'], sets)
assert.deepEqual(merged.tagRules.map((t) => t.id), ['s', 's2'])
assert.deepEqual(merged.replaceRules.map((r) => r.id), ['s', 'g'])

// Prompt side: only prompt/both rules, role-filtered.
assert.equal(applyReplace('aa', [rule({ applies: 'prompt' })], 'user'), 'bb')
assert.equal(applyReplace('aa', [rule({})], 'user'), 'aa')
assert.equal(applyReplace('aa', [rule({ applies: 'both', target: 'assistant' })], 'user'), 'aa')

assert.deepEqual(guessTag('<thinking>([\\s\\S]*?)<\\/thinking>'), { open: '<thinking>', close: '</thinking>' })
assert.equal(guessTag('\\d+'), null)

// SillyTavern scripts.
const { rules, notes } = rulesFromScripts([
  { scriptName: 'Trim', findRegex: '/<x>.*?<\\/x>/gs', replaceString: '', placement: [2], promptOnly: true },
  { scriptName: 'Color', findRegex: '/"(.+?)"/g', replaceString: '<span style="color:red">$1</span>', placement: [1, 2], markdownOnly: true },
  { scriptName: 'Slash', findRegex: '/a/', replaceString: 'b', placement: [3] },
  { findRegex: 'bare', replaceString: '[{{match}}]', placement: [1] },
])
assert.equal(rules.length, 3)
assert.deepEqual([rules[0].find, rules[0].flags, rules[0].applies, rules[0].target], ['<x>.*?<\\/x>', 'gs', 'prompt', 'assistant'])
assert.deepEqual([rules[1].convert, rules[1].enabled, rules[1].applies, rules[1].target], [true, false, 'display', 'both'])
assert.deepEqual([rules[2].find, rules[2].flags, rules[2].replace, rules[2].applies], ['bare', 'g', '[$&]', 'both'])
assert.equal(notes.length, 2)
