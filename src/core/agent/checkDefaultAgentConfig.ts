import assert from 'node:assert/strict'
import { defaultPostStackConfig, runStages } from './postStack.ts'
import { explainAgent } from './explain.ts'

const config = runStages(defaultPostStackConfig())

const ops = (text: string) => explainAgent(text, config).sentences.map((s) => s.operation)
const swapped = (text: string) => explainAgent(text, config).swapped

// Swaps.
assert.equal(swapped('"Hi," she said—then left.'), '"Hi," she said, then left.')
assert.equal(swapped('He waited — a long time — for her.'), 'He waited, a long time, for her.')
assert.equal(swapped('She poured the tea with a practiced hand.'), 'She poured the tea.')
assert.equal(swapped('He slammed the door, sending a shiver through her.'), 'He slammed the door.')

// Deletes, including the two-sentence pair.
assert.deepEqual(ops("She didn't cry. She screamed. Rain fell on the roof all night."), ['delete', 'delete', 'keep'])
assert.deepEqual(ops('Not anger, grief. He sat down on the old bench.'), ['delete', 'keep'])
assert.deepEqual(ops('It was a promise, not a threat.'), ['delete'])
assert.deepEqual(ops('The words hung in the air.'), ['delete'])
assert.deepEqual(ops('She tasted the words.'), ['delete'])
assert.deepEqual(ops('She tasted the soup.'), ['keep'])
assert.deepEqual(ops('The words made her chest tighten.'), ['delete'])

// Rewrite spans all three short sentences, so the paragraph is rewritten.
assert.deepEqual(ops('He stood. He turned. He left.'), ['rewriteParagraph', 'rewriteParagraph', 'rewriteParagraph'])
assert.deepEqual(ops('She walked to the window and looked out over the harbour.'), ['keep'])

// Clause cuts from a real reply. More than twelve swap rules have to run.
assert.equal(swapped('Damien sat with both hands on the wheel, watching a bus glide past the deck, its brake lights flaring red.'), 'Damien sat with both hands on the wheel.')
assert.equal(swapped('The cashier rang him up without looking up from her phone.'), 'The cashier rang him up.')
assert.equal(swapped('He bought a protein bar he wouldn\'t finish.'), 'He bought a protein bar.')
assert.equal(swapped('He ordered a biscuit and a sweet tea he didn\'t want.'), 'He ordered a biscuit and a sweet tea.')
assert.equal(swapped('He knew she didn\'t want it.'), 'He knew she didn\'t want it.')
assert.equal(swapped('"Fine," Travis said in a measured tone.'), '"Fine," Travis said.')
assert.equal(swapped('He circled it once, twice, mapping the entrances.'), 'He circled it twice.')
assert.equal(swapped('He sat, listening to a mower, and took the bottle.'), 'He sat, and took the bottle.')
assert.equal(swapped('He did nothing, something he regretted.'), 'He did nothing, something he regretted.')
assert.equal(swapped('She gripped the rail, knuckles pale.'), 'She gripped the rail.')
assert.equal(swapped('He waited, his jaw tight.'), 'He waited.')
assert.equal(swapped('"Go," she said, voice low.'), '"Go," she said.')
assert.equal(swapped('"Fine, he said."'), '"Fine, he said."')
assert.equal(swapped('I saw him, last night.'), 'I saw him, last night.')
// One hit from a wholeParagraph rule sends the whole paragraph.
assert.deepEqual(ops('His stomach was hollow. Not hungry. He knew he should eat.'), ['keep', 'rewriteParagraph', 'keep'])
assert.deepEqual(ops("His stomach was hollow. Not hungry. He knew he should eat. Georgia would have seen the look on his face and dragged him into a diner herself, ordered for him, watched him take bites. He'd promised her he would eat something."), ['keep', 'rewriteParagraph', 'keep', 'rewriteParagraph', 'keep'])
assert.deepEqual(ops('She would have dragged him in herself, ordered for him, watched him eat.'), ['rewriteParagraph'])
assert.deepEqual(ops('He could not stop. Not now.'), ['keep', 'rewriteParagraph'])
assert.deepEqual(ops('He counted the parking decks off his notes. Union. North. He parked the car and waited.'), ['keep', 'delete', 'delete', 'keep'])
assert.deepEqual(ops('Red brick, a bell tower, kids in shorts and backpacks crossing at crosswalks.'), ['rewriteSentence'])
