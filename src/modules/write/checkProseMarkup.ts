// node --experimental-strip-types src/modules/write/checkProseMarkup.ts
// Parser only: decorateProse/saveCaret/restoreCaret need a DOM and are exercised in the browser.
import assert from 'node:assert'
import { parseProse, pieceText } from './proseMarkup.ts'
import type { ProsePiece } from './proseMarkup.ts'

// Shorthand: describe a tree as marks + flat text for readable assertions.
function shape(pieces: ProsePiece[]): string {
  return pieces
    .map((p) => ('text' in p ? p.text : `${p.kind}[${shape(p.children)}]`))
    .join('')
}

// Plain text passes through untouched.
assert.equal(shape(parseProse('He turned away.')), 'He turned away.')
assert.deepEqual(parseProse(''), [])

// The three levels, both marker characters.
assert.equal(shape(parseProse('*soft*')), 'em[soft]')
assert.equal(shape(parseProse('_soft_')), 'em[soft]')
assert.equal(shape(parseProse('**loud**')), 'bold[loud]')
assert.equal(shape(parseProse('__loud__')), 'bold[loud]')
assert.equal(shape(parseProse('***both***')), 'boldEm[both]')
assert.equal(shape(parseProse('___both___')), 'boldEm[both]')

// Longest marker wins: `**x**` is bold, not empty-em + x + empty-em.
assert.equal(shape(parseProse('a **b** c')), 'a bold[b] c')

// Nesting works when the inner marker differs from the outer one.
assert.equal(shape(parseProse('**a _b_ c**')), 'bold[a em[b] c]')
assert.equal(shape(parseProse('*a _b_ c*')), 'em[a em[b] c]')

// Same-character nesting closes on the first matching run. `*a **b** c*` is three emphases
// rather than emphasis-around-bold. Chat's renderText scans the same way; the Story parser
// matches it on purpose. Mixing `*` and `_` for the two levels is the way to nest.
assert.equal(shape(parseProse('*a **b** c*')), 'em[a ]em[b]em[ c]')

// Half-typed markup stays literal. It does not swallow the rest of the Chapter.
assert.equal(shape(parseProse('*unclosed and on we go')), '*unclosed and on we go')
assert.equal(shape(parseProse('**')), '**')
assert.equal(shape(parseProse('****')), '****')
assert.equal(shape(parseProse('5 * 3 = 15')), '5 * 3 = 15')

// Quotes are a marker like the others. Dialogue can take its own color. The quote characters
// stay inside the span: they read as part of the dialogue, unlike an asterisk.
assert.equal(shape(parseProse('"Get down," he said.')), 'quote[Get down,] he said.')
assert.equal(shape(parseProse('"*Now*," she hissed.')), 'quote[em[Now],] she hissed.')
// An unpaired quote is literal, same as a lone asterisk.
assert.equal(shape(parseProse('the 3" pipe')), 'the 3" pipe')
// Markers nest through a quote in either direction.
assert.equal(shape(parseProse('*he said "no"*')), 'em[he said quote[no]]')

// Grave accents mark a literal run: markers inside them stay text.
assert.equal(shape(parseProse('`raw`')), 'code[raw]')
assert.equal(shape(parseProse('use `*ptr* and _x_` here')), 'use code[*ptr* and _x_] here')
assert.equal(shape(parseProse('*a `b` c*')), 'em[a code[b] c]')
assert.equal(shape(parseProse('an unpaired ` accent')), 'an unpaired ` accent')

// Newlines survive for white-space: pre-wrap.
assert.equal(shape(parseProse('one\n\n*two*')), 'one\n\nem[two]')

// The invariant the editor's read-back depends on: parse round-trips character for character.
const samples = [
  '',
  'plain prose',
  '*a* **b** ***c***',
  '**a _b_ c** trailing',
  '*unclosed',
  '5 * 3 = 15 and 4 _ 2',
  '"Quoted *and* emphasised."',
  'line one\nline *two*\n\nline three',
  '___***mixed***___',
  '****',
  '`code` and *em*',
  'lone ` accent',
]
for (const s of samples) {
  assert.equal(pieceText(parseProse(s)), s, `round-trip failed for ${JSON.stringify(s)}`)
}

console.log('checkProseMarkup: ok')
