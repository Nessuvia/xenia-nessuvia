import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { exportRules, parseRuleFile } from './ruleJson.ts'

// The bundled file, read rather than imported: node's JSON import needs an attribute Vite doesn't
// want, and `bundledRules.ts` uses the Vite form.
const bundled = parseRuleFile(
  readFileSync(new URL('./bundled/nessuRules.json', import.meta.url), 'utf8'),
)
assert.ok(bundled.rules.length > 0, 'bundled file has no text rules')
assert.ok(bundled.hammer.length > 0, 'bundled file has no hammer rules')
// Every regex rule compiles and every hammer pattern compiles: parseRuleFile throws otherwise, so
// reaching here is the assertion. What it cannot see is a rule that matches nothing at all.
assert.ok(
  bundled.rules.every((r) => r.note.trim()),
  'a bundled rule has no note, so the model would be told nothing',
)

// Round trip, both halves. Ids are reissued on the way in, everything else survives.
const back = parseRuleFile(exportRules(bundled.rules, bundled.hammer))
assert.equal(back.rules.length, bundled.rules.length)
assert.equal(back.hammer.length, bundled.hammer.length)
assert.deepEqual(
  back.rules.map((r) => ({ ...r, id: '' })),
  bundled.rules.map((r) => ({ ...r, id: '' })),
)
assert.deepEqual(
  back.hammer.map((r) => ({ ...r, id: '' })),
  bundled.hammer.map((r) => ({ ...r, id: '' })),
)
assert.ok(back.rules.every((r, i) => r.id !== bundled.rules[i].id))

// A bare array, a single object and a hammer-only file are all accepted.
assert.equal(parseRuleFile('[{"note":"a"},{"note":"b"}]').rules.length, 2)
assert.equal(parseRuleFile('{"note":"just the one"}').rules.length, 1)
const hammerOnly = parseRuleFile('{"hammer":[{"pattern":"[adv] [adj]"}]}')
assert.equal(hammerOnly.hammer.length, 1)
assert.equal(hammerOnly.rules.length, 0)

// Defaults fill in for everything the file left out.
const [d] = parseRuleFile('{"note":"n"}').rules
assert.equal(d.enabled, true)
assert.equal(d.regex, false)
assert.equal(d.caseSensitive, false)
assert.equal(d.scope, 'assistant')
assert.equal(d.label, undefined)

const [h] = parseRuleFile('{"hammer":[{"pattern":"with a [adj] [noun]"}]}').hammer
assert.equal(h.enabled, true)
assert.equal(h.action, 'strip')
assert.equal(h.scope, 'assistant')
assert.equal(h.replacement, undefined) // only a replace action carries one

// A scope that is not one of the three falls back rather than reaching the store.
assert.equal(parseRuleFile('{"note":"n","scope":"nonsense"}').rules[0].scope, 'assistant')
assert.equal(parseRuleFile('{"note":"n","scope":"both"}').rules[0].scope, 'both')
assert.equal(parseRuleFile('{"hammer":[{"pattern":"a","action":"nope"}]}').hammer[0].action, 'strip')

// Rejections, each with the position in the message.
assert.throws(() => parseRuleFile('not json'), /Not JSON/)
assert.throws(() => parseRuleFile('[{"note":"ok"},{"find":"","note":"  "}]'), /Rule 2/)
assert.throws(() => parseRuleFile('[{"find":"([a","regex":true,"note":"n"}]'), /bad regex/)
assert.throws(() => parseRuleFile('[{"note":"ok"},"nope"]'), /Rule 2 is not an object/)
assert.throws(() => parseRuleFile('[]'), /No rules/)
assert.throws(() => parseRuleFile('{"hammer":[{"pattern":""}]}'), /Hammer rule 1 has no pattern/)
assert.throws(() => parseRuleFile('{"hammer":[{"pattern":"[nope]"}]}'), /bad pattern/)
assert.throws(() => parseRuleFile('{"rules":"no"}'), /"rules" is not a list/)

// An unescaped bracket is only a problem when the rule says regex.
assert.equal(parseRuleFile('[{"find":"([a","note":"n"}]').rules[0].find, '([a')

console.log('checkRuleJson ok')
