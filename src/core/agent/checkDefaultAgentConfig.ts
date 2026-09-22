import assert from 'node:assert/strict'
import { defaultPostStackConfig, runStages } from './postStack.ts'
import { explainAgent } from './explain.ts'

const config = runStages(defaultPostStackConfig())

const ops = (text: string) => explainAgent(text, config).sentences.map((s) => s.operation)
const swapped = (text: string) => explainAgent(text, config).swapped

// Swaps.
assert.equal(swapped('"Hi," she said—then left.'), '"Hi," she said, then left.')
assert.equal(swapped('He waited — a long time — for her.'), 'He waited, a long time, for her.')
// Stays a swap: it hits often, and a fold would cost a model call every time. The whole phrase
// goes in code before `default-intent-adjective` gets to `practiced`.
assert.equal(swapped('She poured the tea with a practiced hand.'), 'She poured the tea.')
assert.deepEqual(ops('He slammed the door, sending a shiver through her.'), ['fold'])

// Deletes, including the two-sentence pair.
assert.deepEqual(ops("She didn't cry. She screamed. Rain fell on the roof all night."), ['delete', 'delete', 'keep'])
assert.deepEqual(ops('Not anger, grief. He sat down on the old bench.'), ['delete', 'keep'])
assert.deepEqual(ops('It was a promise, not a threat.'), ['delete'])
assert.deepEqual(ops('The words hung in the air.'), ['delete'])
// `taste`, `pooled`, `made` and `words-physical` are gone: one word must not delete a sentence.
assert.deepEqual(ops('She tasted the words.'), ['keep'])
assert.deepEqual(ops('She tasted the soup.'), ['keep'])
assert.deepEqual(ops('The words made her chest tighten.'), ['keep'])

// `short-triple` and `staccato` are gone: `flatRhythm` and `staccatoRuns` already measure this,
// and they do it with the whole reply in view rather than three sentences in isolation.
assert.deepEqual(ops('He stood. He turned. He left.'), ['keep', 'keep', 'keep'])
assert.deepEqual(ops('She walked to the window and looked out over the harbour.'), ['keep'])

// Clause cuts from a real reply. More than twelve swap rules have to run.
assert.deepEqual(ops('Damien sat with both hands on the wheel, watching a bus glide past the deck, its brake lights flaring red.'), ['fold'])
assert.deepEqual(ops('The cashier rang him up without looking up from her phone.'), ['fold'])
assert.deepEqual(ops('He bought a protein bar he wouldn\'t finish.'), ['fold'])
assert.deepEqual(ops('He ordered a biscuit and a sweet tea he didn\'t want.'), ['fold'])
assert.equal(swapped('He knew she didn\'t want it.'), 'He knew she didn\'t want it.')
// Stays a swap for the same reason: the whole phrase goes in code, `measured` included.
assert.equal(swapped('"Fine," Travis said in a measured tone.'), '"Fine," Travis said.')
assert.equal(swapped('He circled it once, twice, mapping the entrances.'), 'He circled it twice, mapping the entrances.')
// Only a trailing -ing tail goes: one followed by ", and" or carrying its own timing stays.
assert.equal(swapped('He sat, listening to a mower, and took the bottle.'), 'He sat, listening to a mower, and took the bottle.')
assert.deepEqual(ops('He set the phone down, rubbing his temples.'), ['fold'])
assert.equal(swapped('He sat up, straightening when he heard footsteps.'), 'He sat up, straightening when he heard footsteps.')
// Reassurance fragments send their paragraph; real sentences and speech don't.
assert.ok(ops('He would keep it small. Nothing that sounded like an opening.').includes('rewriteParagraph'))
assert.ok(ops('He waved. Nothing dramatic.').includes('rewriteParagraph'))
assert.ok(ops('He waved. Just a greeting.').includes('rewriteParagraph'))
assert.deepEqual(ops('Nothing happened.'), ['keep'])
assert.deepEqual(ops('No one answered.'), ['keep'])
assert.deepEqual(ops('"Nothing to see here."'), ['keep'])
// Abstract things hanging in a room, and smiles that creep.
assert.ok(ops('The word asshole hung in the room like smoke.').includes('delete'))
assert.ok(!ops('A smile crept up halfway before he caught it.').includes('keep'))
assert.deepEqual(ops('He crept down the hall.'), ['keep'])
// Short sentences in speech are how people talk.
assert.deepEqual(ops('"Right. Yeah. Sorry." He rubbed his face.'), ['keep', 'keep'])
assert.equal(swapped('He did nothing, something he regretted.'), 'He did nothing, something he regretted.')
// `noun-adj-tail` is gone with the 60-word stoplist that existed only to stop it misfiring,
// so an absolute phrase is left alone now.
assert.deepEqual(ops('She gripped the rail, knuckles pale.'), ['keep'])
assert.deepEqual(ops('He waited, his jaw tight.'), ['keep'])
assert.deepEqual(ops('"Go," she said, voice low.'), ['keep'])
assert.equal(swapped('"Fine, he said."'), '"Fine, he said."')
assert.equal(swapped('I saw him, last night.'), 'I saw him, last night.')
// One hit from a wholeParagraph rule sends the whole paragraph.
assert.deepEqual(ops('His stomach was hollow. Not hungry. He knew he should eat.'), ['keep', 'rewriteParagraph', 'keep'])
assert.deepEqual(ops("His stomach was hollow. Not hungry. He knew he should eat. Georgia would have seen the look on his face and dragged him into a diner herself, ordered for him, watched him take bites. He'd promised her he would eat something."), ['keep', 'rewriteParagraph', 'keep', 'rewriteParagraph', 'keep'])
assert.deepEqual(ops('She would have dragged him in herself, ordered for him, watched him eat.'), ['rewriteParagraph'])
assert.deepEqual(ops('He could not stop. Not now.'), ['keep', 'rewriteParagraph'])
assert.deepEqual(ops('He counted the parking decks off his notes. Union. North. He parked the car and waited.'), ['keep', 'keep', 'keep', 'keep'])
assert.deepEqual(ops('Red brick, a bell tower, kids in shorts and backpacks crossing at crosswalks.'), ['rewriteSentence'])

// Folds. The worked example: an appositive tail restating the sentence, and the adverb plus
// place-setting sitting inside it. Both are rearranged rather than amputated.
assert.deepEqual(ops('The cuff on his wrist pulsed steadily beneath his shirt, a reminder of what they were capable of.'), ['fold'])
assert.deepEqual(ops('It sat heavily against the door frame.'), ['fold'])
// The -ly stoplist and the determiner requirement keep ordinary sentences out.
assert.deepEqual(ops('She only went in the morning.'), ['keep'])
assert.deepEqual(ops('He walked into the room.'), ['keep'])
assert.deepEqual(ops('He tapped it twice on the glass.'), ['keep'])
// An unnamed "something" standing in for the thing itself.
assert.deepEqual(ops('Something deliberate in the way she moved.'), ['fold'])
assert.deepEqual(ops('Something like affection crossed her face.'), ['fold'])
assert.deepEqual(ops('Something was wrong.'), ['keep'])
assert.deepEqual(ops('He said something.'), ['keep'])

// The qualifier genre. Adverbs go in code through the lexicon.
assert.equal(swapped('He nodded deliberately and visibly relaxed.'), 'He nodded and relaxed.')
// The adjective half is attributive only, and the article it leaves wrong is repaired.
assert.equal(swapped('A deliberate slowness. A studied indifference.'), 'A slowness. An indifference.')
assert.equal(swapped('She gave a slight nod.'), 'She gave a nod.')
// Predicative survives: cutting it would leave "the movement was."
assert.equal(swapped('The movement was deliberate.'), 'The movement was deliberate.')
assert.equal(swapped('He was careful and slow.'), 'He was careful and slow.')

// Hedges are never swapped out: "She almost smiled." would become "She smiled." The hedge budget
// handles them, and only before an adjective.
assert.equal(swapped('She almost smiled. He barely made it.'), 'She almost smiled. He barely made it.')
