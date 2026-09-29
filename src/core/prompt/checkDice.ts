// Run: node --experimental-strip-types src/core/prompt/checkDice.ts
import assert from 'node:assert'
import { rollDice, rollInline } from './dice.ts'
import { resolveTemplate, variableValues } from './template.ts'

const low = () => 0
const high = () => 0.999999

assert.strictEqual(rollDice('1d20', low), 1)
assert.strictEqual(rollDice('1d20', high), 20)
assert.strictEqual(rollDice('d20', high), 20)
assert.strictEqual(rollDice('20', high), 20, 'a bare number is one die, as ST reads it')
assert.strictEqual(rollDice('2d6+3', high), 15)
assert.strictEqual(rollDice(' 3D6 - 2 ', low), 1)
for (const bad of ['', 'abc', '0d6', '1d0', '1000d6', '2d6+', '1d20x']) assert.strictEqual(rollDice(bad), undefined, bad)

// Inline: every occurrence rolls on its own; malformed stays literal.
let n = 0
const counting = () => (n++ % 2 ? high() : low())
assert.strictEqual(rollInline('{{roll::1d20}} {{roll 1d20}} {{roll:1d20}}', counting), '1 20 1')
assert.strictEqual(rollInline('{{roll::nope}}', low), '{{roll::nope}}')

// A dice variable is rolled once: every paste and every branch sees one number.
const vars = variableValues([{ id: 'userRoll', label: 'Roll', kind: 'dice', value: '1d20' }], high)
assert.strictEqual(resolveTemplate('{{userRoll}} {{userRoll}}', {}, vars), '20 20')
assert.strictEqual(resolveTemplate('{% if userRoll >= 18 %}crit{% endif %}', {}, vars), 'crit')
assert.deepStrictEqual(variableValues([{ id: 'x', label: 'x', kind: 'dice', value: 'junk' }]), {})

// A roll inside a dropped branch never lands in the prompt.
assert.strictEqual(resolveTemplate('{% if off %}\n{{roll::1d20}}\n{% endif %}\nkept', {}), 'kept')

// A comment is gone before tags run: its {% if %} can't swallow real text.
assert.strictEqual(resolveTemplate('{{// see {% if x %} }}\nkept', {}), 'kept')
