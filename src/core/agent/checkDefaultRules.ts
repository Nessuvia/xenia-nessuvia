import assert from 'node:assert/strict'
import { findFlags, stripText } from '../hammer/strip.ts'
import { defaultRules } from './agentConfig.ts'
import type { Rule } from './rules.ts'

// Each default converted to Word types, held to the regex it replaced on two sentences. A swap has to
// leave the same text; a delete or rewrite has to flag the same number of spans.
const converted: [id: string, oldRegex: string, samples: [string, string]][] = [
  ['default-dash-single', '\\s*\u2014\\s*', ['She paused \u2014 then left.', 'He waited\u2014nothing came.']],
  ['default-without-looking', '\\s+without looking\\b[^.,!?\\n"]*', ['He poured the wine without looking at her.', 'She signed without looking.']],
  ['default-once-twice', '\\bonce, twice\\b', ['He knocked once, twice.', 'The bell rang once, twice, then stopped.']],
  ['default-less-more', '\\bless \\w+(?: \\w+)?, more \\w+', ['It was less anger, more grief.', 'This is less a plan, more a hope.']],
]

const rules = new Map(defaultRules().map((r) => [r.id, r]))
for (const [id, oldRegex, samples] of converted) {
  const rule = rules.get(id)
  assert.ok(rule, `${id} is missing`)
  assert.equal(rule.match, 'pattern', `${id} is not Word types`)
  const legacy: Rule = { ...rule, match: 'regex', find: oldRegex }
  for (const text of samples) {
    if (rule.action === 'swap') {
      assert.equal(stripText(text, [rule]).text, stripText(text, [legacy]).text, `${id}: ${text}`)
      assert.notEqual(stripText(text, [rule]).text, text, `${id} caught nothing in: ${text}`)
    } else {
      assert.equal(findFlags(text, [rule]).length, findFlags(text, [legacy]).length, `${id}: ${text}`)
      assert.ok(findFlags(text, [rule]).length > 0, `${id} caught nothing in: ${text}`)
    }
  }
}
