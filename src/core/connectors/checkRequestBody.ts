// Run: node --experimental-strip-types src/core/connectors/checkRequestBody.ts
import assert from 'node:assert'
import type { Connection } from '../stores/settingsStore'
import type { Character, Chat } from '../storage/types'
import type { ParamDef } from '../params/paramDef.ts'
import { builtinParamDefs } from '../params/builtins.ts'
import { resolveParams } from '../settings/resolveParams.ts'
import { buildRequestBody, redact, completionUrl } from './buildRequestBody.ts'

const key = 'sk-super-secret-key'
const defs: ParamDef[] = builtinParamDefs()

const connection: Connection = {
  id: 'c1',
  name: 'local',
  type: 'chat',
  endpointUrl: 'http://localhost:5001/v1',
  apiKey: key,
  model: 'a-model',
  params: [
    { key: 'temperature', value: 0.8 },
    { key: 'top_p', value: 0.9 },
    { key: 'max_tokens', value: 512 },
  ],
  contextLimit: 32768,
  safetyMarginPct: 5,
}

const messages = [{ role: 'user' as const, content: 'hello' }]

// --- the fields every backend gets ----------------------------------------
{
  const body = buildRequestBody(messages, connection, defs)
  assert.deepStrictEqual(body.messages, messages)
  assert.strictEqual(body.model, 'a-model')
  assert.strictEqual(body.stream, true)
  assert.strictEqual(body.temperature, 0.8)
  assert.strictEqual(body.top_p, 0.9)
  assert.strictEqual(body.max_tokens, 512)
}

// --- stop: omitted when empty, included when not --------------------------
{
  assert.ok(!('stop' in buildRequestBody(messages, connection, defs)))
  const withStop = { ...connection, params: [...connection.params, { key: 'stop', value: ['###'] }] }
  assert.deepStrictEqual(buildRequestBody(messages, withStop, defs).stop, ['###'])
  const empty = { ...connection, params: [...connection.params, { key: 'stop', value: [] }] }
  assert.ok(!('stop' in buildRequestBody(messages, empty, defs)))
}

// --- per-request extras sit above the connection's own params -------------
{
  const body = buildRequestBody(messages, connection, defs, { response_format: { type: 'json_object' } })
  assert.deepStrictEqual(body.response_format, { type: 'json_object' })
  assert.strictEqual(body.stream, true) // nothing else is disturbed

  // An empty extras object is the bottom rung: no response_format on the request at all.
  assert.ok(!('response_format' in buildRequestBody(messages, connection, defs, {})))

  // A param the connection carries is overwritten by the per-request extra.
  const overridden = buildRequestBody(messages, connection, defs, { temperature: 0.1 })
  assert.strictEqual(overridden.temperature, 0.1)
}

// --- redact: the key never appears, wherever it was hiding ----------------
{
  const plain = JSON.stringify(redact(buildRequestBody(messages, connection, defs), connection))
  assert.ok(!plain.includes(key), 'key leaked from the Authorization header')
  assert.ok(plain.includes('Bearer ****'))

  // Anywhere in the body, not just the header: a key pasted into a param value is scrubbed too.
  const leaky = { ...connection, params: [...connection.params, { key: 'stop', value: [key] }] }
  const smuggled = JSON.stringify(redact(buildRequestBody(messages, leaky, defs), leaky))
  assert.ok(!smuggled.includes(key), 'key leaked through a param value')

  const inPrompt = [{ role: 'user' as const, content: `my key is ${key}` }]
  const echoed = JSON.stringify(redact(buildRequestBody(inPrompt, connection, defs), connection))
  assert.ok(!echoed.includes(key), 'key leaked through the messages')

  // No key configured: no Authorization header at all.
  const anon = { ...connection, apiKey: '' }
  const out = redact(buildRequestBody(messages, anon, defs), anon)
  assert.ok(!('Authorization' in out.headers))
  assert.strictEqual(out.url, 'http://localhost:5001/v1/chat/completions')
}

// --- completionUrl: a base, a /v1, or a full path, per connection type -----
{
  const chat = 'http://h:5000/v1/chat/completions'
  assert.strictEqual(completionUrl('http://h:5000'), chat)
  assert.strictEqual(completionUrl('http://h:5000/'), chat)
  assert.strictEqual(completionUrl('http://h:5000/v1'), chat)
  assert.strictEqual(completionUrl('http://h:5000/v1/'), chat)
  assert.strictEqual(completionUrl(chat), chat) // full path left alone

  const text = 'http://h:5000/v1/completions'
  assert.strictEqual(completionUrl('http://h:5000', 'text'), text)
  assert.strictEqual(completionUrl('http://h:5000/v1', 'text'), text)
  // A path that already names either endpoint is taken at its word, whatever the type says.
  // Local backends live under paths no rule here could guess.
  assert.strictEqual(completionUrl(text, 'chat'), text)
  assert.strictEqual(completionUrl(chat, 'text'), chat)
  // A base under a prefix keeps the prefix: the tail goes on the /v1 the user typed.
  assert.strictEqual(completionUrl('http://h:5000/api/v1', 'text'), 'http://h:5000/api/v1/completions')
}

// --- text completion: a prompt string, no messages, template stops --------
{
  const text: Connection = { ...connection, type: 'text' }
  const body = buildRequestBody(
    [
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hello' },
    ],
    text,
    defs,
  )
  assert.ok(!('messages' in body))
  assert.strictEqual(typeof body.prompt, 'string')
  assert.ok((body.prompt as string).includes('be brief'))
  assert.deepStrictEqual(body.stop, ['<|im_end|>']) // from the default ChatML template

  // A stop param merges with the template's rather than replacing it. The template's sequence
  // is what stops the model.
  const both = buildRequestBody(messages, { ...text, params: [{ key: 'stop', value: ['###'] }] }, defs)
  assert.deepStrictEqual(both.stop, ['<|im_end|>', '###'])
}

// --- a def deleted out from under a connection is skipped, not sent raw ---
{
  const orphan = { ...connection, params: [...connection.params, { key: 'gone', value: 1 }] }
  const body = buildRequestBody(messages, orphan, defs)
  assert.ok(!('gone' in body))
  assert.strictEqual(body.temperature, 0.8) // the rest still builds
}

// --- resolved overrides are what lands in the body ------------------------
{
  const character: Character = {
    ownerId: 'local',
    name: 'Damien',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: '',
    altDescriptions: [],
    activeDescriptionIndex: -1,
    alternateGreetings: [],
    gallery: [],
    paramOverrides: { params: { temperature: 0.4, max_tokens: 100 } },
    createdAt: 0,
    updatedAt: 0,
    colors: { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' },
  }
  const chat: Chat = {
    ownerId: 'local',
    characterId: 1,
    title: 't',
    paramOverrides: { params: { temperature: 1.5 } },
    createdAt: 0,
    updatedAt: 0,
  }
  const body = buildRequestBody(messages, resolveParams(connection, character, chat), defs)
  assert.strictEqual(body.temperature, 1.5) // chat beats character
  assert.strictEqual(body.max_tokens, 100) // character beats connection
  assert.strictEqual(body.top_p, 0.9) // untouched params fall through
}

console.log('ok')
