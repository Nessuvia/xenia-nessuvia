import assert from 'node:assert'
import { analyseText, buildStats } from './analyse.ts'
import { canAddRule, hasRuleFor, ruleFromFinding } from './addRule.ts'
import { resolveDetect, type TextRule } from '../../core/nessuPass/detectSettings.ts'
import { compileRule } from '../../core/nessuPass/textRules.ts'
import type { LexiconEntry } from '../../core/quality/lexicon.ts'

const detect = resolveDetect()

// A fixture, not a shipped list: nothing ships a slop list, so the check writes the entry it is
// asserting about.
const lexicon: LexiconEntry[] = [
  {
    id: 'shiver-spine',
    phrase: 'a shiver (ran|runs) down .{0,12}spine',
    regex: true,
    enabled: true,
    weight: 3,
  },
]

// A passage with a stock phrase, a tricolon and a sentence that will not end.
const passage =
  'A shiver ran down her spine. She was tired of it, she was cold to the bone, she was done ' +
  'arguing. ' +
  'He walked to the window and looked out at the rain and thought about the message and the way ' +
  'she had said it and the way he had answered and whether any of it had mattered at all in the ' +
  'end, and then he sat down again.'

const report = analyseText(passage, detect, lexicon)

// Every group the report can produce is derived from the note source, never guessed.
const groups = new Set(report.findings.map((f) => f.group))
assert.ok(groups.has('slop'), 'the lexicon should catch "a shiver ran down her spine"')
for (const f of report.findings) {
  assert.ok(['hammer', 'text', 'slop', 'standing'].includes(f.group), `unknown group ${f.group}`)
}

// Nothing counts sentences any more: a tricolon and a run-on sentence are not findings.
assert.equal(report.findings.filter((f) => f.group !== 'slop').length, 0)

// Spans index the cleaned text, so a slice cut from it has to match what the finding quoted.
for (const f of report.findings) {
  if (!f.span || !f.slice) continue
  assert.equal(report.cleaned.slice(f.span.start, f.span.end), f.slice, `span for ${f.source}`)
}

// A finding round-trips into a rule that matches the text it came from.
const slop = report.findings.find((f) => f.group === 'slop')
assert.ok(slop && canAddRule(slop))
const rule = ruleFromFinding(slop)
assert.equal(rule.regex, false)
assert.equal(rule.scope, 'assistant')
assert.ok(rule.label && rule.label.length <= 40, 'the label is trimmed to fit a row')
const re = compileRule(rule)
assert.ok(re, 'the built rule compiles')
assert.ok(re!.test(report.cleaned), 'the built rule matches the passage it came from')

// The same phrase is only added once.
const rules: TextRule[] = [rule]
assert.equal(hasRuleFor(rules, slop), true)
assert.equal(hasRuleFor([], slop), false)

// A standing rule has no phrase to capture, so it gets no button.
const standing = ruleFromFinding({ source: 'rule:x', message: 'Always this.', group: 'standing' })
assert.equal(standing.find, '')
assert.equal(canAddRule({ source: 'rule:x', message: 'Always this.', group: 'standing' }), false)

// Stats: words, and the phrases the passage repeats against itself.
assert.equal(buildStats('One two three. Four five.').words, 5)
assert.equal(buildStats('').words, 0)
const echo = 'She held the line. She held the line. She held the line.'
assert.ok(buildStats(echo).repeatedPhrases.length > 0, 'a self-repeated phrase is counted')

console.log('checkAnalyse ok')
