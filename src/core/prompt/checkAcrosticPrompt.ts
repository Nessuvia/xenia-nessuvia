import assert from 'node:assert/strict'
import { acrosticGrammar, acrosticInstruction, acrosticMessages, slotTag } from './acrosticPrompt.ts'
import type { AcrosticTemplate } from '../agent/acrostic/draw.ts'

const template: AcrosticTemplate = {
  paragraphs: [
    [{ id: '1.1', type: 'action', letter: 'M' }, { id: '1.2', type: 'dialogue' }],
    [{ id: '2.1', type: 'beat' }, { id: '2.2', type: 'thought', letter: 'R' }],
  ],
}

assert.equal(slotTag(template.paragraphs[0][0]), '[1.1|action|M]')
assert.equal(slotTag(template.paragraphs[0][1]), '[1.2|dialogue]')

// Tagged lines in order, the beat hint on the beat, the letter line last.
assert.equal(
  acrosticInstruction(template, false),
  [
    'Write your reply by filling each line. Keep the tag, then the sentence.',
    '[1.1|action|M]',
    '[1.2|dialogue]',
    '[2.1|beat] introduces a new event, choice, or reveal',
    '[2.2|thought|R]',
    'A letter means the sentence starts with that letter.',
  ].join('\n'),
)
assert.match(acrosticInstruction(template, true), /^Write your reply as JSON: \{ "lines"/)
assert.match(acrosticInstruction(template, false, 'Keep the tags.'), /Keep the tags\.$/)

// The instruction is one extra system turn at the end; the prompt itself is untouched.
const prompt = [{ role: 'user' as const, content: 'Hi.' }]
const sent = acrosticMessages(prompt, template, false)
assert.equal(sent.length, 2)
assert.equal(sent[1].role, 'system')
assert.equal(prompt.length, 1)

// Grammar: lines joined by newlines, tags in order, letters forced, unlettered lines free.
const grammar = acrosticGrammar(template, false).split('\n')
assert.equal(grammar[0], 'root ::= line1 "\\n" line2 "\\n" line3 "\\n" line4')
assert.equal(grammar[1], 'line1 ::= "[1.1|action|M] " open "M" rest')
assert.equal(grammar[2], 'line2 ::= "[1.2|dialogue] " text')
assert.equal(grammar[4], 'line4 ::= "[2.2|thought|R] " open "R" rest')

// Prefilled: the first tag is already in the prompt, so line 1 starts at the sentence.
assert.equal(acrosticGrammar(template, true).split('\n')[1], 'line1 ::= " "? open "M" rest')
