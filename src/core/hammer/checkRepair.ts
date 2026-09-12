import assert from 'node:assert/strict'
import { repairAfterCut, repairAll } from './repair.ts'

// Table-driven: each row is (input, cutStart, cutEnd, expected).
const cases: Array<[string, number, number, string]> = [
  // "She runs with graceful" with "with " removed → collapse trailing space.
  ['She runs with graceful elegance.', 8, 13, 'She runs graceful elegance.'],
  // Cut leaves a space before a comma: "apples , and" → "apples, and".
  ['apples , and oranges', 6, 7, 'apples, and oranges'],
  // Cut removes a word, leaving a space before the period: "He ran  ." → "He ran.".
  ['He ran fast .', 7, 12, 'He ran.'],
  // Doubled comma from cutting a clause: "apples, , and" → "apples, and".
  ['apples, , and oranges', 7, 9, 'apples, and oranges'],
  // Dangling ", and ." → ".": the object after the conjunction was stripped elsewhere.
  // A single cut can't represent a prior strip. Covered in repairAll below.
  ['I saw the cat, and the dog', 22, 26, 'I saw the cat, and the'],
  // Cut removes the sentence body, leaving "The ." → "The." (article survives; space before punct fixed).
  ['The quick brown .', 4, 16, 'The.'],
  // Sentence-initial cut capitalizes the following word.
  ['with a quick brown fox jumps', 0, 7, 'Quick brown fox jumps'],
  // No-op when the cut is mid-word with clean surroundings.
  ['Hello world', 5, 6, 'Helloworld'],
]

for (const [input, cs, ce, expected] of cases) {
  const got = repairAfterCut(input, cs, ce)
  assert.equal(got, expected, `repairAfterCut(${JSON.stringify(input)}, ${cs}, ${ce}) => ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`)
}

// repairAll: the same rules applied to a whole string with several seams.
assert.equal(repairAll('She  runs  fast .'), 'She runs fast.')
assert.equal(repairAll('apples, , and oranges'), 'apples, and oranges')
assert.equal(repairAll('He saw it, and . Then left.'), 'He saw it. Then left.')
assert.equal(repairAll('The . Quick brown fox.'), 'The. Quick brown fox.')

// Property: stripped output never contains a double space or space-before-terminal-punct.
const samples = [
  'She  runs with  a grace .',
  'apples , and , oranges .',
  'The quick , brown .',
]
for (const s of samples) {
  const r = repairAll(s)
  assert.ok(!/ {2,}/.test(r), `double space in ${JSON.stringify(r)}`)
  assert.ok(!/ [.;:!?]/.test(r), `space before punct in ${JSON.stringify(r)}`)
}

console.log('checkRepair OK')
