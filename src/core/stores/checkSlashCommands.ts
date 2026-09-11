import assert from 'node:assert/strict'
import { completeWith, menuFor, parseCommand, stripEscape } from './slashCommands.ts'

const roster = [
  { id: 1, name: 'Anna' },
  { id: 2, name: 'Anna Belle' },
  { id: 3, name: 'Nadia' },
]
const names = roster.map((r) => r.name)

// --- parseCommand --------------------------------------------------------

assert.equal(parseCommand('hello there', names), null, 'plain text is not a command')
assert.equal(parseCommand(' /noreply hi', names), null, 'a slash must be in the first column')
assert.equal(parseCommand('/bogus x', names), null, 'unknown command sends verbatim')
assert.equal(parseCommand('//sendas Anna hi', names), null, 'double slash escapes')
assert.equal(stripEscape('//sendas Anna hi'), '/sendas Anna hi')
assert.equal(stripEscape('plain'), 'plain')

assert.deepEqual(parseCommand('/noreply hi there', names), { name: 'noreply', text: 'hi there' })
assert.deepEqual(parseCommand('/noreply', names), { name: 'noreply', text: '' })
assert.deepEqual(parseCommand('/NoReply hi', names), { name: 'noreply', text: 'hi' })
assert.deepEqual(parseCommand('/br', names), { name: 'break', text: '' }, 'an alias reports the canonical name')
assert.deepEqual(parseCommand('/break', names), { name: 'break', text: '' })

// /continue takes no argument at all: anything typed after it is ignored by the caller, not
// parsed as a target.
assert.deepEqual(parseCommand('/continue', names), { name: 'continue', text: '' })
assert.deepEqual(parseCommand('/continue please', names), { name: 'continue', text: 'please' })

// The longest matching roster name wins, so a two-word name is not cut in half by the one-word
// name it starts with.
assert.deepEqual(parseCommand('/sendas Anna Belle waves.', names), {
  name: 'sendas',
  target: 'Anna Belle',
  text: 'waves.',
})
assert.deepEqual(parseCommand('/sendas Anna waves.', names), {
  name: 'sendas',
  target: 'Anna',
  text: 'waves.',
})
// A name must end on a word boundary: "Ann" is not "Anna".
assert.deepEqual(parseCommand('/sendas Annabelle waves.', names), {
  name: 'sendas',
  target: 'Annabelle',
  text: 'waves.',
})
// No match falls back to the first token, so the caller can name it in the error.
assert.deepEqual(parseCommand('/sendas Zed hi', names), {
  name: 'sendas',
  target: 'Zed',
  text: 'hi',
})
assert.deepEqual(parseCommand('/sendas Anna', names), {
  name: 'sendas',
  target: 'Anna',
  text: '',
})
assert.deepEqual(parseCommand('/sendas', names), { name: 'sendas', target: '', text: '' })

// --- menuFor -------------------------------------------------------------

assert.equal(menuFor('hello', roster), null)
assert.equal(menuFor('//x', roster), null)

const all = menuFor('/', roster)
assert.equal(all?.kind, 'commands')
assert.equal(all?.items.length, 4, 'a bare slash lists everything')

const continues = menuFor('/c', roster)
assert.deepEqual(
  continues?.kind === 'commands' ? continues.items.map((c) => c.name) : [],
  ['continue'],
)

const narrowed = menuFor('/n', roster)
assert.equal(narrowed?.kind, 'commands')
assert.deepEqual(
  narrowed?.kind === 'commands' ? narrowed.items.map((c) => c.name) : [],
  ['noreply'],
  'typing narrows the list',
)
assert.equal(menuFor('/zz', roster), null, 'no match closes the menu')

// Once the name is settled the menu switches to the roster.
const chars = menuFor('/sendas ', roster)
assert.equal(chars?.kind, 'characters')
assert.equal(chars?.items.length, 3)

const filtered = menuFor('/sendas Anna', roster)
assert.deepEqual(
  filtered?.kind === 'characters' ? filtered.items.map((c) => c.name) : [],
  ['Anna', 'Anna Belle'],
  'a prefix that matches two names keeps both',
)
assert.equal(menuFor('/sendas Anna Belle ', roster), null, 'a settled name closes the menu')
assert.equal(menuFor('/noreply hi', roster), null, 'a command with no character argument has no menu')

// --- completeWith --------------------------------------------------------

assert.equal(completeWith('/se', { name: 'sendas', hint: '', usage: '', takesCharacter: true }), '/sendas ')
assert.equal(completeWith('/sendas An', roster[1]), '/sendas Anna Belle ')

console.log('slash commands ok')
