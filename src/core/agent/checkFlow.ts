import assert from 'node:assert'
import { defaultFlowConfig, defaultFlowStyle, echoes, findFlowHits, keepsSpeech } from './flowRules.ts'
import { runAgent, type Complete } from './runAgent.ts'

const stilted = `Damien's brows pulled together. Then a short breath of laughter came out before he could stop it. He looked down at himself, at the long arms and the shoulders that filled the sleeves.

"Yeah, that guy couldn't have done anything about it." He shook his head. "You would've ended him."

He shifted his weight on the rug.

"You still can," he said. "If you want. Anytime. I'll stand there and take it."`

const rewritten = `He raised an eyebrow, then gave a short laugh. "Hah, well, I'd still let you. Hell, it's probably less 'let' and more 'I couldn't stop you if you wanted.'"

"As for the guy in that picture," he added. "It'd be a bloodbath. You'd wipe the floor with him."`

const find = (text: string, over = {}) => findFlowHits(text, defaultFlowConfig, { ...defaultFlowStyle, ...over })
const spans = (text: string, id: string) => find(text).filter((h) => h.ruleId === id).map((h) => text.slice(h.start, h.end))

// The reference reply trips every detector.
assert.deepEqual(spans(stilted, 'staccato-runs'), ['If you want. Anytime.'])
assert.equal(spans(stilted, 'filler-beats').length, 3)
assert.ok(spans(stilted, 'filler-beats').some((s) => s.includes('He shifted his weight on the rug.')))
assert.deepEqual(spans(stilted, 'repeated-openers'), ['He shifted his weight on the rug.'])
assert.deepEqual(spans(stilted, 'body-beats'), ['He shifted his weight on the rug.'])
assert.equal(spans(stilted, 'narration-ratio').length, 1)
// Fix order: staccato first, the ratio last.
assert.equal(find(stilted)[0].ruleId, 'staccato-runs')
assert.equal(find(stilted).at(-1)!.ruleId, 'narration-ratio')

// The user's own rewrite of it trips none.
assert.deepEqual(find(rewritten), [])

// Style numbers move the thresholds: a description-heavy profile accepts the narration.
assert.equal(find(stilted, { narrationRatio: [0.5, 0.9] }).filter((h) => h.ruleId === 'narration-ratio').length, 0)
assert.equal(find(stilted, { bodyBeatsPerReply: 10 }).filter((h) => h.ruleId === 'body-beats').length, 0)
// No speech at all: the ratio leaves it alone rather than invent dialogue.
assert.deepEqual(find('He walked to the door. The night was cold and long and empty.'), [])

// runAgent: one hit fixed per call, detected again after each fix; off ids are skipped.
const calls: string[] = []
const complete: Complete = async (messages) => {
  calls.push(messages[1].content)
  return 'If you want, anytime.'
}
const r = await runAgent('"You still can," he said. "If you want. Anytime. I\'ll stand there and take it."', {
  maxTries: 2,
  rules: [],
  lexicon: [],
  flow: { off: ['narration-ratio'], style: defaultFlowStyle },
}, complete)
assert.equal(r.text, '"You still can," he said. "If you want, anytime. I\'ll stand there and take it."')
assert.equal(calls.length, 1)
assert.match(calls[0], /Passage:\nIf you want\. Anytime\.\n\nProblems:\n- 2 fragments/)
assert.match(r.summary ?? '', /smoothed 1 passage/)

// A live swipe the first version mangled. Lucille's description is not a Damien beat, tags are not
// openers, and a beat after speech never pulls the speech into its span.
const swipe = `Damien let out a breath through his nose that was almost a laugh.

"There's still time," he said. "I've got a flight Sunday morning."

He pulled his knees up off the mat and sat cross-legged, hands resting loose on his thighs. From the doorway of her bedroom, Lucille looked at him, gray eyes and black hair and the tank top where her shoulders filled it out.

"For the record," he said, "the lanky kid in the photo was a hundred and sixty pounds and couldn't bench two plates. He'd have gone down in a round."

He watched her face.`
const liveStyle = { narrationRatio: [0.4, 0.8] as [number, number], bodyBeatsPerReply: 1, staccatoRun: 2 }
const swipeHits = findFlowHits(swipe, defaultFlowConfig, liveStyle).map((h) => swipe.slice(h.start, h.end))
assert.ok(swipeHits.every((s) => !s.includes('Lucille') && !s.includes('"')), swipeHits.join(' | '))

// The speech guard: narration may change, dialogue may not.
assert.ok(keepsSpeech('"Morning." He nodded.', '"Morning," he said, nodding.'))
assert.ok(!keepsSpeech('"There\'s still time." He sat.', 'He sat.'))
assert.ok(!keepsSpeech('He sat.', '"Well," he said. He sat.'))
assert.ok(!keepsSpeech('"You could have." He sat.', '"You could\'ve, easily." He sat.'))
assert.ok(keepsSpeech('"You could\'ve. Easily." He sat.', '"You could\'ve, easily." He sat.'))

// Repeated verbs: back-to-back narration only, and not across speech.
const looked = `Damien looked down at his own arms, the sleeves rolled to the elbow. Then he looked up at the doorframe she stood in.`
assert.deepEqual(spans(looked, 'repeated-verbs'), ['Then he looked up at the doorframe she stood in.'])
assert.deepEqual(spans('He looked at her. "Hi." He looked away.', 'repeated-verbs'), [])
assert.deepEqual(spans('He was tired. She was not.', 'repeated-verbs'), [])

// Echo guard: two takes of one sentence, or a copy of the reply around the passage.
assert.ok(echoes('He let out a rough laugh, then rubbed his palm across his jaw. He gave a rough laugh, then ran his palm across his jaw.', ''))
assert.ok(echoes('The joke she had made settled over the room.', 'Later. The joke she had made settled over the quiet room.'))
assert.ok(!echoes('He let out a rough laugh, then rubbed his jaw.', 'The joke she had made settled over the room.'))
assert.ok(!echoes('He sat. He sat.', ''))

// The speech guard reads the whole reply: a staccato span inside a quote can't reword it.
{
  const reply = '"Started lifting after Sarah died. Couldn\'t sleep. Couldn\'t sit still. So I just..." He flexed his hand.'
  const reworded = '"Started lifting after Sarah died. I couldn\'t sleep or sit still, so I just..." He flexed his hand.'
  const punctuated = '"Started lifting after Sarah died. Couldn\'t sleep, couldn\'t sit still, so I just..." He flexed his hand.'
  assert.ok(!keepsSpeech(reply, reworded))
  assert.ok(keepsSpeech(reply, punctuated))
}

// Stylized: a detector fix blurs its passage while it works, then lands fresh; Default blurs the passage's sentences.
{
  const text = '"You still can," he said. "If you want. Anytime. I\'ll stand there and take it."'
  const answer: Complete = async () => 'If you want, anytime.'
  const flow = { off: ['narration-ratio'], style: defaultFlowStyle }
  const stages: string[] = []
  await runAgent(text, { maxTries: 1, rules: [], lexicon: [], flow }, answer, (_, __, stage) => {
    if (stage) stages.push(stage.marks.filter((m) => m.mark !== 'none').map((m) => `${m.mark}:${m.text}`).join('|'))
  }, async () => {})
  assert.ok(stages.includes('pending:If you want. Anytime.'), stages.join(' / '))
  assert.equal(stages.at(-1), 'fresh:want, anytime.')

  const pending: string[][] = []
  await runAgent(text, { maxTries: 1, rules: [], lexicon: [], flow }, answer, (_, p) => pending.push(p))
  assert.ok(pending.some((p) => p.join('|') === 'If you want.|Anytime.'), JSON.stringify(pending))
}

// Cross-paragraph repeats: a content phrase again in a later paragraph, not within one.
{
  const text = 'He looked at the shoulders that filled the sleeves.\n\n"Hi." She saw the shoulders that filled the sleeves too.'
  assert.deepEqual(spans(text, 'cross-repeats'), ['She saw the shoulders that filled the sleeves too.'])
  assert.deepEqual(spans('He filled the sleeves. Then he filled the sleeves again.', 'cross-repeats'), [])
  assert.deepEqual(spans('He went to the door.\n\nShe went to the door.', 'cross-repeats'), [])
}

// Flat rhythm: four sentences of five words or more within three words of each other.
{
  const drone = 'He sat down on the mat. She looked at the photo again. He waited for her to speak. The light hummed above them both.'
  assert.deepEqual(spans(drone, 'flat-rhythm'), [drone])
  assert.deepEqual(spans('He sat down on the mat. She looked at the photo again for a long, quiet while before saying anything. He waited for her to speak. The light hummed above them both.', 'flat-rhythm'), [])
}
