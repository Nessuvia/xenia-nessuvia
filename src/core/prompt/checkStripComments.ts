import assert from 'node:assert'
import { stripComments } from './stripComments.ts'

// The shape an imported ST preset actually carries: a comment, {{trim}}, nothing else on the line.
assert.equal(
  stripComments('Be terse.\n{{//this negates positivity bias}}{{trim}}\nStay in character.'),
  'Be terse.\nStay in character.',
)

// A bare comment on its own line goes the same way.
assert.equal(stripComments('a\n{{// note}}\nb'), 'a\nb')

// Leading whitespace on a comment line is part of the line.
assert.equal(stripComments('a\n   {{// note}}{{trim}}   \nb'), 'a\nb')

// Comments can span lines.
assert.equal(stripComments('a\n{{// one\ntwo}}{{trim}}\nb'), 'a\nb')

// Sharing a line with real text leaves the text.
assert.equal(stripComments('keep {{// drop}} this'), 'keep  this')

// A stray {{trim}} with no comment is still an ST macro with nothing behind it here.
assert.equal(stripComments('hello {{trim}}world'), 'hello world')
assert.equal(stripComments('{{TRIM}}x'), 'x')

// Real tokens and unknown ones are untouched: substitution is swapTokens' job.
assert.equal(stripComments('{{char}} meets {{mystery}}'), '{{char}} meets {{mystery}}')

// Blank lines the author wrote stay blank lines.
assert.equal(stripComments('a\n\nb'), 'a\n\nb')

// Two comments on one line both go.
assert.equal(stripComments('{{//a}}{{//b}}\nx'), 'x')

// Non-greedy: the first }} closes the comment.
assert.equal(stripComments('{{// a}} kept {{// b}} too'), ' kept  too')

// Text with no braces comes back as-is.
assert.equal(stripComments('plain text'), 'plain text')
assert.equal(stripComments(''), '')

// A comment followed by text on its line doesn't reach for a later line's }}.
assert.equal(stripComments('{{// a}} keep\n{{char}}\nx'), ' keep\n{{char}}\nx')

// Jinja comments: own line takes the line, inline leaves the text, and one may hold tokens and }}.
assert.equal(stripComments('a\n{# note #}\nb'), 'a\nb')
assert.equal(stripComments('a\n  {# one\n{{user}} }} two #}\nb'), 'a\nb')
assert.equal(stripComments('keep {# drop #}this'), 'keep this')
assert.equal(stripComments('{# a #} keep\n{# b #}\nx'), ' keep\nx')

console.log('stripComments ok')
