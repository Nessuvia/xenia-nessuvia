// Run: node --experimental-strip-types src/core/secondPass/checkTextRules.ts
import assert from 'node:assert/strict'
import { compileRule, findTextMatches, standingNotes } from './textRules.ts'
import type { SecondPassRule } from '../stores/settingsStore.ts'

const rule = (over: Partial<SecondPassRule> = {}): SecondPassRule => ({
  id: over.find ?? 'r',
  enabled: true,
  find: 'suddenly',
  regex: false,
  caseSensitive: false,
  scope: 'assistant',
  note: '',
  ...over,
})

// --- a literal find -------------------------------------------------------
{
  const text = 'Suddenly she turned. He waited, and then suddenly left.'
  const notes = findTextMatches(text, [rule()], 'assistant')
  assert.equal(notes.length, 2)
  // Spans index the text handed in: the prompt quotes these slices back to the model.
  for (const n of notes) assert.equal(text.slice(n.span!.start, n.span!.end), n.slice)
  // Case-insensitive by default, and the slice keeps the casing as written.
  assert.equal(notes[0].slice, 'Suddenly')
  assert.equal(notes[1].slice, 'suddenly')
  // Reported in reading order.
  assert.ok(notes[0].span!.start < notes[1].span!.start)

  // Case sensitivity is opt-in.
  assert.equal(findTextMatches(text, [rule({ caseSensitive: true })], 'assistant').length, 1)
}

// --- a literal find is never treated as a pattern -------------------------
{
  // Without escaping, "a.b" would match "axb" too.
  const notes = findTextMatches('a.b and axb', [rule({ find: 'a.b' })], 'assistant')
  assert.equal(notes.length, 1)
  assert.equal(notes[0].slice, 'a.b')
}

// --- regex mode -----------------------------------------------------------
{
  const notes = findTextMatches('It was 1999 and then 2024.', [rule({ find: '\\d{4}', regex: true })], 'assistant')
  assert.equal(notes.length, 2)
  assert.equal(notes[0].slice, '1999')

  // A pattern that does not compile is skipped, not thrown: a half-typed rule must not break a send.
  assert.equal(compileRule(rule({ find: '(', regex: true })), null)
  assert.doesNotThrow(() => findTextMatches('x', [rule({ find: '(', regex: true })], 'assistant'))
  assert.equal(findTextMatches('x', [rule({ find: '(', regex: true })], 'assistant').length, 0)

  // A zero-width match reports nothing: a span with no text in it is a slice the model can't find.
  assert.equal(findTextMatches('hello', [rule({ find: '\\b', regex: true })], 'assistant').length, 0)
}

// --- the authored note is what the model reads ----------------------------
{
  const notes = findTextMatches('Suddenly she turned.', [rule({ note: 'Stop opening on an adverb.' })], 'assistant')
  assert.equal(notes[0].message, 'Stop opening on an adverb.')
  // Blank falls back to a line that at least names the match.
  const fallback = findTextMatches('Suddenly she turned.', [rule()], 'assistant')
  assert.ok(fallback[0].message.includes('Suddenly'), fallback[0].message)
  // Whitespace is not an authored note.
  const blank = findTextMatches('Suddenly she turned.', [rule({ note: '   ' })], 'assistant')
  assert.ok(blank[0].message.includes('Suddenly'))
}

// --- code spans and URLs are not prose ------------------------------------
{
  // The hammer's exclusions are reused, so a find inside inline code or a link target is left alone.
  assert.equal(findTextMatches('Use `suddenly` here.', [rule()], 'assistant').length, 0)
  assert.equal(findTextMatches('See https://x.test/suddenly for more.', [rule()], 'assistant').length, 0)
  assert.equal(findTextMatches('Text.\n```\nsuddenly\n```\n', [rule()], 'assistant').length, 0)
  // The same word in ordinary prose still reports.
  assert.equal(findTextMatches('Use `suddenly` here. Suddenly, no.', [rule()], 'assistant').length, 1)
}

// --- gating ---------------------------------------------------------------
{
  assert.equal(findTextMatches('Suddenly.', [rule({ enabled: false })], 'assistant').length, 0)
  // A blank find is not a matcher: it is a standing rule, and standingNotes owns it.
  assert.equal(findTextMatches('Suddenly.', [rule({ find: '' })], 'assistant').length, 0)
  assert.equal(findTextMatches('Suddenly.', [rule({ scope: 'user' })], 'assistant').length, 0)
  assert.equal(findTextMatches('Suddenly.', [rule({ scope: 'user' })], 'user').length, 1)
  assert.equal(findTextMatches('Suddenly.', [rule({ scope: 'both' })], 'assistant').length, 1)
}

// --- one rule matching everywhere is still one problem --------------------
{
  const many = 'suddenly '.repeat(20)
  assert.equal(findTextMatches(many, [rule()], 'assistant').length, 3)
}

// --- standing rules -------------------------------------------------------
{
  const standing = rule({ find: '', note: 'No metaphors.' })
  const notes = standingNotes([standing], 'assistant')
  assert.equal(notes.length, 1)
  assert.equal(notes[0].message, 'No metaphors.')
  // No span: there is nothing in the passage to point at.
  assert.equal(notes[0].span, undefined)

  // A rule with a find is a matcher, not a standing rule, so it must not appear in both lists.
  assert.equal(standingNotes([rule({ note: 'x' })], 'assistant').length, 0)
  // A rule with neither a find nor a note has nothing to say.
  assert.equal(standingNotes([rule({ find: '', note: '  ' })], 'assistant').length, 0)
  // Disabled and out-of-scope gate the same way they do for matches.
  assert.equal(standingNotes([{ ...standing, enabled: false }], 'assistant').length, 0)
  assert.equal(standingNotes([{ ...standing, scope: 'user' }], 'assistant').length, 0)
  assert.equal(standingNotes([{ ...standing, scope: 'user' }], 'user').length, 1)
}

console.log('checkTextRules OK')
