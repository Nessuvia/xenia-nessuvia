// Run: node --experimental-strip-types src/core/params/checkResolveParams.ts
import assert from 'node:assert'
import type { Connection } from '../stores/settingsStore'
import type { Character, Chat, Story } from '../storage/types'
import { overridableFields, paramSource, paramSourceFor, resolveParams } from './resolveParams.ts'

const connection: Connection = {
  id: 'c1',
  name: 'local',
  type: 'chat',
  endpointUrl: 'http://localhost:5001/v1',
  apiKey: 'secret',
  model: 'a-model',
  params: [
    { key: 'temperature', value: 1 },
    { key: 'top_p', value: 0.9 },
    { key: 'max_tokens', value: 512 },
    { key: 'stop', value: ['###'] },
  ],
  contextLimit: 32768,
  safetyMarginPct: 5,
}

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
  createdAt: 0,
  updatedAt: 0,
  colors: { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' },
}

const chat: Chat = { ownerId: 'local', characterId: 1, title: 't', createdAt: 0, updatedAt: 0 }

const valueOf = (c: Connection, key: string) => c.params.find((p) => p.key === key)?.value

// --- no overrides: the connection, unchanged, same field set --------------
{
  assert.deepStrictEqual(resolveParams(connection), connection)
  assert.deepStrictEqual(resolveParams(connection, character, chat), connection)
}

// --- character override only ---------------------------------------------
{
  const out = resolveParams(
    connection,
    { ...character, paramOverrides: { params: { temperature: 0.4 } } },
    chat,
  )
  assert.strictEqual(valueOf(out, 'temperature'), 0.4)
  assert.strictEqual(valueOf(out, 'top_p'), 0.9) // patch, not replace
  assert.strictEqual(valueOf(out, 'max_tokens'), 512)
}

// --- chat beats character ------------------------------------------------
{
  const out = resolveParams(
    connection,
    { ...character, paramOverrides: { params: { temperature: 0.4, max_tokens: 100 } } },
    { ...chat, paramOverrides: { params: { temperature: 1.5 } } },
  )
  assert.strictEqual(valueOf(out, 'temperature'), 1.5)
  assert.strictEqual(valueOf(out, 'max_tokens'), 100) // character wins where the chat is silent
}

// --- zero is a real value, not "unset" ----------------------------------
{
  const out = resolveParams(
    connection,
    { ...character, paramOverrides: { params: { temperature: 0.7 } } },
    { ...chat, paramOverrides: { params: { temperature: 0 }, safetyMarginPct: 0 } },
  )
  assert.strictEqual(valueOf(out, 'temperature'), 0)
  assert.strictEqual(out.safetyMarginPct, 0)
}

// --- an override for a param the connection doesn't send is ignored -------
// Overrides change what a sampler is set to; which samplers get sent is the connection's call.
{
  const out = resolveParams(
    connection,
    character,
    { ...chat, paramOverrides: { params: { min_p: 0.05 } } },
  )
  assert.strictEqual(valueOf(out, 'min_p'), undefined)
  assert.strictEqual(out.params.length, connection.params.length)
}

// --- the non-param fields follow the same precedence ---------------------
{
  const withChar = { ...character, paramOverrides: { contextLimit: 8192 } }
  assert.strictEqual(resolveParams(connection, withChar, chat).contextLimit, 8192)
  const chatWins = { ...chat, paramOverrides: { contextLimit: 4096 } }
  assert.strictEqual(resolveParams(connection, withChar, chatWins).contextLimit, 4096)
}

// --- stop arrays are replaced, not concatenated ---------------------------
{
  const out = resolveParams(connection, character, {
    ...chat,
    paramOverrides: { params: { stop: ['END'] } },
  })
  assert.deepStrictEqual(valueOf(out, 'stop'), ['END'])
  assert.deepStrictEqual(valueOf(connection, 'stop'), ['###'])
}

// --- paramSource agrees with resolveParams, for fields and for params ----
{
  const char = {
    ...character,
    paramOverrides: {
      contextLimit: 8192,
      params: { temperature: 0.4, top_p: 0.5, stop: ['C'] },
    },
  }
  const c = {
    ...chat,
    paramOverrides: { safetyMarginPct: 10, params: { temperature: 0, max_tokens: 99 } },
  }
  const out = resolveParams(connection, char, c)

  const expectedFields: Record<string, 'chat' | 'character' | 'connection'> = {
    contextLimit: 'character',
    safetyMarginPct: 'chat',
  }
  for (const field of overridableFields) {
    assert.strictEqual(paramSource(field, connection, char, c), expectedFields[field], field)
  }

  const expectedParams: Record<string, 'chat' | 'character' | 'connection'> = {
    temperature: 'chat',
    top_p: 'character',
    max_tokens: 'chat',
    stop: 'character',
  }
  for (const param of connection.params) {
    const source = paramSourceFor(param.key, char, c)
    assert.strictEqual(source, expectedParams[param.key], `source of ${param.key}`)
    const from =
      source === 'chat'
        ? c.paramOverrides.params![param.key]
        : source === 'character'
          ? char.paramOverrides.params![param.key]
          : param.value
    assert.deepStrictEqual(valueOf(out, param.key), from, `value of ${param.key}`)
  }
}

// --- a Story is the innermost layer too, with no character under it -------
// Write passes a Story where a Chat goes: the third argument is structural, and 'chat' names the
// innermost layer whatever record fills it.
{
  const story: Story = {
    ownerId: 'local',
    title: 'A Story',
    cover: '',
    cast: [],
    direction: '',
    createdAt: 0,
    updatedAt: 0,
    paramOverrides: { contextLimit: 16384, params: { temperature: 0.2 } },
  }
  const out = resolveParams(connection, undefined, story)
  assert.strictEqual(valueOf(out, 'temperature'), 0.2)
  assert.strictEqual(valueOf(out, 'top_p'), 0.9) // patch, not replace
  assert.strictEqual(out.contextLimit, 16384)
  assert.strictEqual(out.safetyMarginPct, 5) // untouched fields fall through
  assert.strictEqual(paramSourceFor('temperature', undefined, story), 'chat')
  assert.strictEqual(paramSourceFor('top_p', undefined, story), 'connection')
  assert.strictEqual(paramSource('contextLimit', connection, undefined, story), 'chat')
  assert.strictEqual(paramSource('safetyMarginPct', connection, undefined, story), 'connection')

  // A Story with no overrides changes nothing.
  assert.deepStrictEqual(resolveParams(connection, undefined, { ...story, paramOverrides: undefined }), connection)
}

// --- the connection passed in is never mutated ---------------------------
{
  const before = JSON.stringify(connection)
  resolveParams(
    connection,
    { ...character, paramOverrides: { params: { max_tokens: 1 } } },
    { ...chat, paramOverrides: { params: { temperature: 0.1, stop: ['x'] } } },
  )
  assert.strictEqual(JSON.stringify(connection), before)
}

console.log('ok')
