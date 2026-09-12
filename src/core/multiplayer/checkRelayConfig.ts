// Run: node --experimental-strip-types src/core/multiplayer/checkRelayConfig.ts
import assert from 'node:assert'
import {
  inviteLink,
  relayConfigured,
  relayFromLink,
  relayHost,
  validRelayUrl,
} from './relayConfig.ts'

// --- validRelayUrl --------------------------------------------------------

assert.equal(validRelayUrl('wss://relay.example.net/connection/websocket'), true)
assert.equal(validRelayUrl('wss://relay.example.net'), true)
// Plaintext is refused rather than left to fail as mixed content in the browser.
assert.equal(validRelayUrl('ws://localhost:8000/connection/websocket'), false)
assert.equal(validRelayUrl('https://relay.example.net'), false)
assert.equal(validRelayUrl('relay.example.net'), false)
assert.equal(validRelayUrl(''), false)
// Anything at all can arrive on the `r` parameter, and none of it may throw.
assert.equal(validRelayUrl('javascript:alert(1)'), false)
assert.equal(validRelayUrl('wss://'), false)

// --- relayConfigured ------------------------------------------------------

assert.equal(relayConfigured({ url: 'wss://r.example.net' }), true)
assert.equal(relayConfigured({ url: '' }), false)

// --- relayHost ------------------------------------------------------------

assert.equal(relayHost({ url: 'wss://r.example.net:8443/ws' }), 'r.example.net:8443')
assert.equal(relayHost({ url: 'nonsense' }), '')

// --- the invite link round trip -------------------------------------------

const origin = 'https://xenia.nessuvia.com'

const relay = { url: 'wss://r.example.net/connection/websocket' }
const link = inviteLink(origin, 'abc123', relay)
assert.equal(
  link,
  `${origin}/join/abc123?r=wss%3A%2F%2Fr.example.net%2Fconnection%2Fwebsocket`,
)
// What the browser hands JoinView is the decoded parameter. Read it back the same way.
assert.deepEqual(relayFromLink(new URL(link).searchParams.get('r')), relay)

// A URL with a query of its own survives the round trip rather than truncating the link.
const withQuery = { url: 'wss://r.example.net/ws?x=1&y=2' }
const queryLink = inviteLink(origin, 'abc123', withQuery)
assert.deepEqual(relayFromLink(new URL(queryLink).searchParams.get('r')), withQuery)

// An `r` that is missing or not a usable relay is undefined. The guest is told the link is bad,
// not pointed at whatever it said.
assert.equal(relayFromLink(null), undefined)
assert.equal(relayFromLink('ws://localhost:8000'), undefined)
assert.equal(relayFromLink('http://evil.example/'), undefined)

console.log('checkRelayConfig ok')
