// Run: node --experimental-strip-types src/core/multiplayer/checkProtocol.ts
import assert from 'node:assert'
import type { Message } from '../storage/types'
import {
  forGuests,
  maxEventBytes,
  parseEvent,
  protocolVersion,
  withinSizeLimit,
  type HostEvent,
  type GuestEvent,
  type GuestMessage,
  type Message as _Msg,
} from './protocol.ts'

// --- fixtures -------------------------------------------------------------

function guestMessage(patch: Partial<GuestMessage>): GuestMessage {
  return { id: 1, role: 'user', content: 'hi', createdAt: 0, ...patch }
}

const events: (HostEvent | GuestEvent)[] = [
  { v: protocolVersion, type: 'hello', persona: { guestId: 'g1', name: 'V', description: 'd' } },
  { v: protocolVersion, type: 'say', guestId: 'g1', text: 'hi', responderId: -1 },
  { v: protocolVersion, type: 'bye', guestId: 'g1' },
  {
    v: protocolVersion,
    type: 'persona',
    guestId: 'g1',
    persona: { guestId: 'g1', name: 'V2', description: 'd2' },
  },
  {
    v: protocolVersion,
    type: 'state',
    participants: [{ id: 'g1', name: 'V', description: 'd', isHost: false }],
    order: ['g1'],
    turnIndex: 0,
    characters: [{ id: 1, name: 'Damien' }],
    narratorName: 'Narrator',
    settings: { title: 't', characterCount: 1 },
    appearance: {
      font: '',
      fontSize: 15,
      lineHeight: 1.55,
      textColor: '',
      emphasisColor: '',
      boldColor: '',
      quoteColor: '',
      overwriteCharColor: false,
      colorOrder: ['emphasis', 'bold', 'quotes'],
      background: { url: '', fit: 'cover', excludeNav: false, css: '', html: '' },
    },
    messages: [guestMessage({})],
    personaLock: false,
  },
  { v: protocolVersion, type: 'append', message: guestMessage({ role: 'assistant', content: 'yo' }) },
  { v: protocolVersion, type: 'stream', key: 'k1', text: 'so far', speakerName: 'Damien' },
  { v: protocolVersion, type: 'decision', guestId: 'g1', admitted: true },
  { v: protocolVersion, type: 'decision', guestId: 'g1', admitted: false, reason: 'full' },
  { v: protocolVersion, type: 'kick', guestId: 'g1' },
  { v: protocolVersion, type: 'end' },
]

// --- each event type round-trips through JSON and parseEvent --------------
{
  for (const e of events) {
    const back = parseEvent(JSON.parse(JSON.stringify(e)))
    assert.ok(back, `parseEvent rejected a valid ${e.type}`)
    assert.deepStrictEqual(back, e)
  }
  assert.strictEqual(events.length, 11, 'every event type covered')
}

// --- forGuests drops the dangerous fields ---------------------------------
{
  const m: Message = {
    id: 7,
    ownerId: 'local',
    chatId: 3,
    role: 'assistant',
    content: 'body',
    personaId: 9,
    personaName: 'Dom',
    swipes: ['body', 'alt'],
    swipeIndex: 0,
    reasonings: ['thinking'],
    speakerId: 1,
    speakerName: 'Damien',
    createdAt: 42,
  }
  const g = forGuests(m)
  const keys = Object.keys(g).sort()
  // Only the allowed fields; nothing else slips through.
  assert.deepStrictEqual(keys, ['content', 'createdAt', 'id', 'personaName', 'role', 'speakerName'])
  // Each dangerous field is absent as a key, not merely undefined.
  for (const bad of [
    'ownerId',
    'chatId',
    'personaId',
    'speakerId',
    'swipes',
    'swipeIndex',
    'reasonings',
  ]) {
    assert.ok(!(bad in g), `forGuests leaked ${bad}`)
  }
}

// --- forGuests keeps what it should --------------------------------------
{
  const m: Message = {
    id: 7,
    ownerId: 'local',
    chatId: 3,
    role: 'user',
    content: 'body',
    personaName: 'Dom',
    speakerName: 'Damien',
    createdAt: 42,
  }
  const g = forGuests(m)
  assert.strictEqual(g.id, 7)
  assert.strictEqual(g.role, 'user')
  assert.strictEqual(g.content, 'body')
  assert.strictEqual(g.personaName, 'Dom')
  assert.strictEqual(g.speakerName, 'Damien')
  assert.strictEqual(g.createdAt, 42)
}

// --- parseEvent rejects bad input without throwing ------------------------
{
  // wrong version
  assert.strictEqual(parseEvent({ ...events[0], v: 999 }), undefined)
  // unknown type
  assert.strictEqual(parseEvent({ v: protocolVersion, type: 'bogus' }), undefined)
  // missing type
  assert.strictEqual(parseEvent({ v: protocolVersion }), undefined)
  // null
  assert.strictEqual(parseEvent(null), undefined)
  // bare string
  assert.strictEqual(parseEvent('hello'), undefined)
  // an object over the size cap
  const big = events[3] as HostEvent // a state event
  const padded: HostEvent = {
    ...big,
    messages: [guestMessage({ content: 'x'.repeat(maxEventBytes) })],
  }
  assert.ok(!withinSizeLimit(padded), 'padded event should exceed the cap')
  assert.strictEqual(parseEvent(JSON.parse(JSON.stringify(padded))), undefined)
}

// --- withinSizeLimit ------------------------------------------------------
{
  assert.ok(withinSizeLimit(events[0]))
  const big = events[3] as HostEvent
  const padded: HostEvent = {
    ...big,
    messages: [guestMessage({ content: 'x'.repeat(maxEventBytes) })],
  }
  assert.ok(!withinSizeLimit(padded))
}

console.log('ok')
