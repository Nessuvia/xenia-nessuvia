// Run: node --experimental-strip-types src/core/prompt/checkGroupPrompt.ts
import assert from 'node:assert'
import type { Character, Chat, Message, Persona, PromptBlock, PromptStack } from '../storage/types'
import { autoTurns, isGroup, nextSpeakerId, nextSpeakerIndex, participants } from '../stores/roster.ts'
import { buildPrompt, nextSpeakerHint } from './buildPrompt.ts'

let n = 0
function block(b: Partial<PromptBlock>): PromptBlock {
  return { id: `b${++n}`, label: 'b', source: 'text', role: 'system', content: '', ...b }
}

function stack(active: PromptBlock[]): PromptStack {
  return { ownerId: 'local', name: 's', active }
}

function character(id: number, name: string): Character {
  return {
    id,
    ownerId: 'local',
    name,
    avatar: '',
    description: `${name}'s description`,
    personality: `${name}'s personality`,
    scenario: `${name}'s scenario`,
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
}

const damien = character(1, 'Damien')
const mary = character(2, 'Mary')
const john = character(3, 'John')

const dom: Persona = {
  id: 7,
  ownerId: 'local',
  name: 'Dom',
  avatar: '',
  description: 'a travelling bard',
  createdAt: 0,
  updatedAt: 0,
  colors: { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' },
}

function chatOf(patch: Partial<Chat>): Chat {
  return { ownerId: 'local', characterId: 1, title: 't', createdAt: 0, updatedAt: 0, ...patch }
}

const messages: Message[] = [
  { id: 1, ownerId: 'local', chatId: 1, role: 'assistant', content: 'Evening.', speakerId: 1, speakerName: 'Damien', createdAt: 1 },
  { id: 2, ownerId: 'local', chatId: 1, role: 'user', content: 'Evening both.', personaId: 7, personaName: 'Dom', createdAt: 2 },
  { id: 3, ownerId: 'local', chatId: 1, role: 'assistant', content: 'Hello.', speakerId: 2, speakerName: 'Mary', createdAt: 3 },
]

const cards = stack([
  block({ source: 'characterDescription' }),
  block({ source: 'characterPersonality' }),
  block({ source: 'characterScenario' }),
  block({ source: 'chatHistory' }),
])

// --- the roster ------------------------------------------------------------
// A chat with no participantIds is a roster of one: its own character.
assert.deepStrictEqual(participants(chatOf({})), [1])
assert.deepStrictEqual(participants(chatOf({ participantIds: [] })), [1])
assert.strictEqual(isGroup(chatOf({})), false)
assert.strictEqual(isGroup(chatOf({ participantIds: [1] })), false)
assert.strictEqual(isGroup(chatOf({ participantIds: [1, 2] })), true)

// Round robin wraps at the end of the roster.
{
  const three = { participantIds: [1, 2, 3] }
  assert.strictEqual(nextSpeakerIndex(chatOf(three)), 0) // no cursor yet
  assert.strictEqual(nextSpeakerIndex(chatOf({ ...three, lastSpeakerIndex: 0 })), 1)
  assert.strictEqual(nextSpeakerIndex(chatOf({ ...three, lastSpeakerIndex: 1 })), 2)
  assert.strictEqual(nextSpeakerIndex(chatOf({ ...three, lastSpeakerIndex: 2 })), 0)
  assert.strictEqual(nextSpeakerId(chatOf({ ...three, lastSpeakerIndex: 1 })), 3)
}

// A cursor left pointing past the end (the character it named was removed) wraps rather than
// throwing or naming nobody.
{
  const shrunk = chatOf({ participantIds: [1, 2], lastSpeakerIndex: 5 })
  assert.strictEqual(nextSpeakerIndex(shrunk), 0)
  assert.ok(participants(shrunk).includes(nextSpeakerId(shrunk)))
  // Same for a cursor that somehow went negative.
  assert.strictEqual(nextSpeakerIndex(chatOf({ participantIds: [1, 2], lastSpeakerIndex: -3 })), 0)
}

// --- self-reply -------------------------------------------------------------
{
  const three = { participantIds: [1, 2, 3] }
  // Off is one reply, whatever the count says.
  assert.strictEqual(autoTurns(chatOf(three)), 1)
  assert.strictEqual(autoTurns(chatOf({ ...three, selfReplyCount: 3 })), 1)

  // On, the count is the number of replies: user speaks, then two characters.
  assert.strictEqual(autoTurns(chatOf({ ...three, selfReply: true })), 1) // default count
  assert.strictEqual(autoTurns(chatOf({ ...three, selfReply: true, selfReplyCount: 2 })), 2)
  assert.strictEqual(autoTurns(chatOf({ ...three, selfReply: true, selfReplyCount: 3 })), 3)

  // Capped at the roster: nobody is asked to speak twice in one run.
  assert.strictEqual(autoTurns(chatOf({ ...three, selfReply: true, selfReplyCount: 9 })), 3)
  assert.strictEqual(
    autoTurns(chatOf({ participantIds: [1, 2], selfReply: true, selfReplyCount: 9 })),
    2,
  )
  // A solo chat is a roster of one: self-reply can't make it talk to itself.
  assert.strictEqual(autoTurns(chatOf({ selfReply: true, selfReplyCount: 4 })), 1)

  // Nonsense counts land on one rather than zero or a fraction of a turn.
  for (const selfReplyCount of [0, -2, 0.5]) {
    assert.strictEqual(autoTurns(chatOf({ ...three, selfReply: true, selfReplyCount })), 1)
  }
}

// --- one participant is Phase 1, byte for byte ------------------------------
{
  const phase1 = buildPrompt({ stack: cards, character: damien, persona: dom, messages })
  for (const chat of [chatOf({}), chatOf({ participantIds: [1] })]) {
    const solo = buildPrompt({
      stack: cards,
      character: damien,
      persona: dom,
      messages,
      chat,
      speaker: damien,
    })
    assert.deepStrictEqual(solo.messages, phase1.messages)
    assert.strictEqual(solo.tokensUsed, phase1.tokensUsed)
  }
  // No labels, and no hint turn.
  assert.ok(!phase1.messages.some((m) => m.content.includes('Damien: Evening.')))
  assert.ok(!phase1.messages.some((m) => m.content.includes(nextSpeakerHint('Damien'))))
}

// --- two participants label every history message ---------------------------
{
  const out = buildPrompt({
    stack: cards,
    character: damien,
    persona: dom,
    messages,
    chat: chatOf({ participantIds: [1, 2], lastSpeakerIndex: 1 }),
    speaker: damien,
  }).messages

  const history = out.filter((m) => m.role !== 'system')
  assert.deepStrictEqual(history, [
    { role: 'assistant', content: 'Damien: Evening.' },
    { role: 'user', content: 'Dom: Evening both.' },
    { role: 'assistant', content: 'Mary: Hello.' },
  ])

  // Only the speaker's card is in the prompt, nobody else's.
  const fixed = out[0].content
  assert.ok(fixed.includes("Damien's description"))
  assert.ok(fixed.includes("Damien's personality"))
  assert.ok(fixed.includes("Damien's scenario"))
  for (const other of ["Mary's", "John's"]) {
    assert.ok(!out.some((m) => m.content.includes(other)), `${other} card stayed out`)
  }

  // The hint names who speaks next, and lands last.
  assert.strictEqual(out.at(-1)!.content, nextSpeakerHint('Damien'))
  assert.strictEqual(out.at(-1)!.role, 'system')
}

// The speaker is who the hint and the card follow, not participantIds[0].
{
  const out = buildPrompt({
    stack: cards,
    character: damien,
    persona: dom,
    messages,
    chat: chatOf({ participantIds: [1, 2, 3] }),
    speaker: john,
  }).messages
  assert.ok(out[0].content.includes("John's description"))
  assert.strictEqual(out.at(-1)!.content, nextSpeakerHint('John'))
}

// --- the hint and a rewrite instruction compose -----------------------------
// Both are trailing system turns: the merge concatenates them, and neither is lost.
{
  const out = buildPrompt({
    stack: cards,
    character: damien,
    persona: dom,
    messages,
    chat: chatOf({ participantIds: [1, 2] }),
    speaker: mary,
    appendSystem: 'Less purple prose.',
  }).messages
  const last = out.at(-1)!
  assert.strictEqual(last.role, 'system')
  assert.strictEqual(last.content, `${nextSpeakerHint('Mary')}\n\nLess purple prose.`)
}

// --- a deleted character still gets its label -------------------------------
{
  const orphan: Message[] = [
    { id: 9, ownerId: 'local', chatId: 1, role: 'assistant', content: 'Gone but quoted.', speakerId: 42, speakerName: 'Ghost', createdAt: 9 },
  ]
  const out = buildPrompt({
    stack: stack([block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages: orphan,
    chat: chatOf({ participantIds: [1, 2] }),
    speaker: damien,
  }).messages
  assert.strictEqual(out[0].content, 'Ghost: Gone but quoted.')
}

// An unstamped turn (written before the roster existed) falls back to the chat's character.
{
  const old: Message[] = [
    { id: 8, ownerId: 'local', chatId: 1, role: 'assistant', content: 'From Phase 1.', createdAt: 8 },
    { id: 9, ownerId: 'local', chatId: 1, role: 'user', content: 'Also Phase 1.', createdAt: 9 },
  ]
  const out = buildPrompt({
    stack: stack([block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages: old,
    chat: chatOf({ participantIds: [1, 2] }),
    speaker: mary,
  }).messages
  assert.strictEqual(out[0].content, 'Damien: From Phase 1.')
  assert.strictEqual(out[1].content, 'Dom: Also Phase 1.') // the active persona
}

// --- the prefix is assembled, never stored ----------------------------------
{
  const before = messages.map((m) => m.content)
  buildPrompt({
    stack: cards,
    character: damien,
    persona: dom,
    messages,
    chat: chatOf({ participantIds: [1, 2, 3] }),
    speaker: mary,
  })
  assert.deepStrictEqual(messages.map((m) => m.content), before)
  for (const m of messages) assert.ok(!m.content.startsWith(`${m.speakerName ?? ''}:`))
}

// --- labels are counted: they're in the assembled text --------------
{
  const args = { stack: cards, character: damien, persona: dom, messages, speaker: damien }
  const solo = buildPrompt({ ...args, chat: chatOf({ participantIds: [1] }) })
  const group = buildPrompt({ ...args, chat: chatOf({ participantIds: [1, 2] }) })
  assert.ok(group.tokensUsed > solo.tokensUsed, 'the labels and the hint cost tokens')
}

// --- one-character roster with nameSpeakers produces labels -----------------
{
  const args = { stack: cards, character: damien, persona: dom, messages, speaker: damien }
  const out = buildPrompt({ ...args, chat: chatOf({ participantIds: [1] }), nameSpeakers: true })

  // History gets labelled.
  assert.ok(out.messages.some((m) => m.content.includes('Damien: Evening.')))

  // The hint is present and names the speaker.
  assert.ok(out.messages.some((m) => m.content.includes(nextSpeakerHint('Damien'))))
}

// --- one-character roster without nameSpeakers stays silent ------------------
{
  const args = { stack: cards, character: damien, persona: dom, messages, speaker: damien }
  const out = buildPrompt({ ...args, chat: chatOf({ participantIds: [1] }) })

  // No labels.
  assert.ok(!out.messages.some((m) => m.content.includes('Damien: Evening.')))

  // No hint.
  assert.ok(!out.messages.some((m) => m.content.includes(nextSpeakerHint('Damien'))))
}

// --- a genuine group chat with nameSpeakers:false still labels ---------------
{
  const args = { stack: cards, character: damien, persona: dom, messages, speaker: damien }
  const out = buildPrompt({ ...args, chat: chatOf({ participantIds: [1, 2] }), nameSpeakers: false })

  // isGroup still wins.
  assert.ok(out.messages.some((m) => m.content.includes('Damien: Evening.')))
  assert.ok(out.messages.some((m) => m.content.includes(nextSpeakerHint('Damien'))))
}

// --- a guest turn with personaName but no personaId -------------------------
{
  const guestMessage: Message[] = [
    { id: 10, ownerId: 'local', chatId: 1, role: 'user', content: 'Guest says hello.', personaName: 'Guest', createdAt: 10 },
  ]
  const args = { stack: cards, character: damien, persona: dom, messages: guestMessage, speaker: damien }
  const out = buildPrompt({ ...args, chat: chatOf({ participantIds: [1] }), nameSpeakers: true })

  // The user message is labelled with the personaName.
  assert.ok(out.messages.some((m) => m.content.includes('Guest: Guest says hello.')))
}

// --- chat.nameSpeakers labels without the argument ---------------------------
// How a multiplayer session gets its labels: the field is on the chat record. The send path and
// the preview both pick it up without either being passed a flag.
{
  const args = { stack: cards, character: damien, persona: dom, messages, speaker: damien }
  const out = buildPrompt({ ...args, chat: chatOf({ participantIds: [1], nameSpeakers: true }) })

  assert.ok(out.messages.some((m) => m.content.includes('Damien: Evening.')))
  assert.ok(out.messages.some((m) => m.content.includes(nextSpeakerHint('Damien'))))
}

// --- chat.nameSpeakers:false does not disable a genuine group ----------------
{
  const args = { stack: cards, character: damien, persona: dom, messages, speaker: damien }
  const out = buildPrompt({ ...args, chat: chatOf({ participantIds: [1, 2], nameSpeakers: false }) })

  assert.ok(out.messages.some((m) => m.content.includes('Damien: Evening.')))
}

console.log('ok')
