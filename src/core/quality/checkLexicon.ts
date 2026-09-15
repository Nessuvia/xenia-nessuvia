import assert from 'node:assert'
import { applyLexicon, type LexiconEntry } from './lexicon.ts'

const entry = (phrase: string, replacement: string, enabled = true): LexiconEntry => ({ id: phrase, phrase, replacement, enabled })

assert.equal(applyLexicon('She delved into it.', [entry('delved', 'dug')]), 'She dug into it.')
assert.equal(applyLexicon('Delved deep.', [entry('delved', 'dug')]), 'Dug deep.')
// Word edges: a phrase inside a longer word stays.
assert.equal(applyLexicon('undelvedness', [entry('delved', 'dug')]), 'undelvedness')
// A blank replacement removes the phrase and its leading space.
assert.equal(applyLexicon('It was very big.', [entry('very', '')]), 'It was big.')
// Disabled entries and code spans are skipped.
assert.equal(applyLexicon('very big', [entry('very', '', false)]), 'very big')
assert.equal(applyLexicon('Run `delved` now.', [entry('delved', 'dug')]), 'Run `delved` now.')
