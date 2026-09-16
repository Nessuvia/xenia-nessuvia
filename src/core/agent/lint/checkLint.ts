import assert from 'node:assert'
import { applyLint, defaultLintConfig, type LintConfig } from '../lintRules.ts'
import { sceneTemperature, quotedRanges } from '../../quality/temperature.ts'
import { arousalOf, loadVad } from '../../quality/vad.ts'

const fix: LintConfig = { ...defaultLintConfig, enabled: true, mode: 'fix' }
const run = (text: string, over: Partial<LintConfig> = {}) => applyLint(text, { ...fix, ...over })

// Off does nothing.
assert.equal(applyLint('The plan changed completely.', defaultLintConfig).text, 'The plan changed completely.')

// Placement: clause-final intensifier moves in front of the verb, after an auxiliary.
assert.equal(run('The plan changed completely.').text, 'The plan completely changed.')
assert.equal(run('She has changed entirely, and he knew it.').text, 'She has entirely changed, and he knew it.')
// Manner adverbs, a following object, sentence-initial verbs and quotes stay.
assert.equal(run('He spoke quietly.').text, 'He spoke quietly.')
assert.equal(run('It changed completely the plan he had.', { off: ['intensifier-budget'] }).text, 'It changed completely the plan he had.')
assert.equal(run('Changed completely.').text, 'Changed completely.')
assert.equal(run('"It changed completely."').text, '"It changed completely."')
assert.equal(run('He did not change completely.').text, 'He did not change completely.')

// Report mode lists the hit and leaves the text.
const report = run('The plan changed completely.', { mode: 'report' })
assert.equal(report.text, 'The plan changed completely.')
assert.equal(report.hits.length, 1)

// Rules can be turned off by id.
assert.equal(run('The plan changed completely.', { off: ['adverb-placement'] }).text, 'The plan changed completely.')

// Budget: short cold narration gets no free intensifier.
const cold = 'The room was quite dark. The table was truly old and the chairs were utterly plain. He sat down.'
assert.equal(run(cold).text, 'The room was dark. The table was old and the chairs were plain. He sat down.')
// Not after a negator, and never inside quotes.
assert.equal(run('It was not quite right. It was "truly awful" and so on.').text, 'It was not quite right. It was "truly awful" and so on.')
// Sentence openers go with their comma.
assert.equal(run('Honestly, she had no idea what he wanted.').text, 'She had no idea what he wanted.')
assert.equal(run('She was genuinely surprised by the letter.').text, 'She was surprised by the letter.')

// Ambient filler: a distant sound in narration goes, with its whitespace.
assert.equal(
  run('She put the cup down. Somewhere beyond the fence a dog barked twice and went quiet. He looked up.', { off: ['intensifier-budget'] }).text,
  'She put the cup down. He looked up.',
)
assert.equal(
  run('He waited. The pine needles rustled overhead and somewhere a car door slammed in the parking lot.').text,
  'He waited.',
)
// Dialogue and close sounds stay.
assert.equal(run('"Somewhere a dog barked," she said.').text, '"Somewhere a dog barked," she said.')
assert.equal(run('The dog barked at him.').text, 'The dog barked at him.')

// Structural signals alone still rank shouting above narration.
assert.ok(sceneTemperature('"Get out! NOW!" she screamed.') > sceneTemperature('The room was dark.'))

await loadVad()
assert.equal(arousalOf('screamed'), arousalOf('scream'))
assert.ok(arousalOf('scream')! > 0.5 && arousalOf('table')! < 0)

// Temperature: shouted dialogue runs hotter than flat narration.
const hot = sceneTemperature('"Get out! NOW!" she screamed, shaking. "Please, you have to run!"')
const flat = sceneTemperature('The room was dark. The table stood by the window. He sat down and read the letter.')
const calm = sceneTemperature('The meeting was scheduled for Tuesday. She reviewed the documents.')
assert.ok(calm < 0.2, `calm ${calm}`)
assert.ok(hot > 0.5 && flat < 0.2, `hot ${hot}, flat ${flat}`)

// Quote ranges close on the same line only.
assert.deepEqual(quotedRanges('a "b" c'), [[2, 5]])
assert.deepEqual(quotedRanges('a "b\nc" d'), [])
