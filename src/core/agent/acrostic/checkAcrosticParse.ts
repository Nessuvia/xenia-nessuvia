import assert from 'node:assert/strict'
import { parseAcrostic, parsedEnough } from './parse.ts'
import type { AcrosticTemplate } from './draw.ts'

const template: AcrosticTemplate = {
  paragraphs: [
    [{ id: '1.1', type: 'action', letter: 'M' }, { id: '1.2', type: 'dialogue' }],
    [{ id: '2.1', type: 'beat' }, { id: '2.2', type: 'thought', letter: 'R' }],
  ],
}

// Junk between lines is skipped, tags never reach the text, paragraphs get a blank line.
const tagged = [
  'Sure, here is the reply:',
  '[1.1|action|M] Mara set the cup down.',
  '',
  '[1.2|dialogue] "You came back," she said.',
  '(paragraph two)',
  '[2.1|beat] A knock came at the door.',
  '[2.2|thought|R] *Right on time.*',
].join('\n')
let r = parseAcrostic(tagged, template)
assert.equal(r.text, 'Mara set the cup down. "You came back," she said.\n\nA knock came at the door. *Right on time.*')
assert.equal(r.found, 4)
assert.deepEqual(r.fit, { hit: 2, of: 2 })
assert.ok(parsedEnough(r))

// A missing line drops out; a letter that doesn't fit is counted, not enforced.
r = parseAcrostic('[1.1] Later, Mara stood.\n[2.1|beat] The lights died.\n[2.2|thought|R] Run.', template)
assert.equal(r.text, 'Later, Mara stood.\n\nThe lights died. Run.')
assert.equal(r.found, 3)
assert.deepEqual(r.fit, { hit: 1, of: 2 })

// A sentence under a bare tag still counts. A duplicate id keeps the first.
r = parseAcrostic('[1.1|action|M]\nMara froze.\n[1.1] Again.\n[1.2] "No."', template)
assert.equal(r.text, 'Mara froze. "No."')

// A paragraph with no lines left disappears.
r = parseAcrostic('[1.1] Mara left.\n[1.2] "Bye."', template)
assert.equal(r.text, 'Mara left. "Bye."')

// JSON, with text around the object.
r = parseAcrostic('```json\n{ "lines": [{ "id": "1.1", "text": "Mara nodded." }, { "id": "2.2", "text": "Really?" }] }\n```', template)
assert.equal(r.text, 'Mara nodded.\n\nReally?')
assert.equal(r.found, 2)

// Threshold: half is enough, under half is not, and nothing at all is not.
assert.ok(parsedEnough(parseAcrostic('[1.1] A.\n[2.1] B.', template)))
assert.ok(!parsedEnough(parseAcrostic('[1.1] A.', template)))
assert.ok(!parsedEnough(parseAcrostic('Just prose, no tags.', template)))
