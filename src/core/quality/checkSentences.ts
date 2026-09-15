import assert from 'node:assert'
import { sentences } from './sentences.ts'

const texts = (s: string) => sentences(s).map((x) => x.text)

// Plain prose, with offsets that point back at the source.
const plain = 'She left. He stayed! Why?'
assert.deepEqual(texts(plain), ['She left.', 'He stayed!', 'Why?'])
for (const s of sentences(plain)) assert.equal(plain.slice(s.start, s.end), s.text)

// Dialogue: the closing quote belongs to the sentence, and a lowercase tag continues it.
assert.deepEqual(texts('"Hello." She smiled.'), ['"Hello."', 'She smiled.'])
assert.deepEqual(texts('"Really?" she asked. "Yes."'), ['"Really?" she asked.', '"Yes."'])
assert.deepEqual(texts('"Hi," he said. "Sit down."'), ['"Hi," he said.', '"Sit down."'])
assert.deepEqual(texts('“Go!” He ran.'), ['“Go!”', 'He ran.'])
// A quoted span stays whole. An unclosed quote does not swallow the line.
assert.deepEqual(texts('"I know. You told me." He shrugged.'), ['"I know. You told me."', 'He shrugged.'])
assert.deepEqual(texts('"Wait. Stop," he said. "Now."'), ['"Wait. Stop," he said.', '"Now."'])
assert.deepEqual(texts('She said "Go. Now." Then left.'), ['She said "Go. Now."', 'Then left.'])
assert.deepEqual(texts('"Wait. Stop.\nHe left. Fine.'), ['"Wait.', 'Stop.', 'He left.', 'Fine.'])
assert.deepEqual(texts('“I know. You told me.” He shrugged.'), ['“I know. You told me.”', 'He shrugged.'])
assert.deepEqual(texts('“Wait. Stop,” he said. “Now.”'), ['“Wait. Stop,” he said.', '“Now.”'])
assert.deepEqual(texts("'Fine.' She shrugged."), ["'Fine.'", 'She shrugged.'])

// Asterisk actions.
assert.deepEqual(texts('*She sits down.* Hello there.'), ['*She sits down.*', 'Hello there.'])
assert.deepEqual(texts('*waves* Hello. *grins*'), ['*waves* Hello.', '*grins*'])
assert.deepEqual(texts('She *really* liked it.'), ['She *really* liked it.'])
assert.deepEqual(texts('"Stop!" *He grabs her arm.* "Now."'), ['"Stop!"', '*He grabs her arm.*', '"Now."'])

// Ellipses.
assert.deepEqual(texts('Well... maybe.'), ['Well... maybe.'])
assert.deepEqual(texts('I waited... Nobody came.'), ['I waited...', 'Nobody came.'])
assert.deepEqual(texts('I waited… Nobody came.'), ['I waited…', 'Nobody came.'])
assert.deepEqual(texts('"So..." she trailed off.'), ['"So..." she trailed off.'])
assert.deepEqual(texts('What?! No.'), ['What?!', 'No.'])

// Abbreviations, decimals, newlines, empty input.
assert.deepEqual(texts('Mr. Smith paid 3.5 coins. Dr. Lee left.'), ['Mr. Smith paid 3.5 coins.', 'Dr. Lee left.'])
assert.deepEqual(texts('Line one\nLine two'), ['Line one', 'Line two'])
assert.deepEqual(texts('No ending'), ['No ending'])
assert.deepEqual(sentences(''), [])
assert.deepEqual(sentences('  \n  '), [])
