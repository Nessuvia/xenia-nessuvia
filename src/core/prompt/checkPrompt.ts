// Run: node --experimental-strip-types src/core/prompt/checkPrompt.ts
import assert from 'node:assert'
import type { Character, Message, Persona, PromptBlock, PromptStack } from '../storage/types'
import type { Connection } from '../stores/settingsStore'
import { resolveParams } from '../settings/resolveParams.ts'
import { budgetOf } from '../params/connectionParams.ts'
import { buildPrompt } from './buildPrompt.ts'
import { characterTokens, chatTokens, swapTokens } from './swapTokens.ts'
import { oldMessageInstruction, rewritePrompt } from './rewrite.ts'
import { emptyWorldInfo, type ResolvedWorldInfo } from './worldInfo.ts'

let n = 0
function block(b: Partial<PromptBlock>): PromptBlock {
  return { id: `b${++n}`, label: 'b', source: 'text', role: 'system', content: '', ...b }
}

function stack(active: PromptBlock[]): PromptStack {
  return { ownerId: 'local', name: 's', active }
}

/** A ResolvedWorldInfo with only the slots a case cares about filled in. */
function wi(patch: Partial<ResolvedWorldInfo>): ResolvedWorldInfo {
  return { ...emptyWorldInfo, ...patch }
}

// Damien-shaped: everything lives in `description`, the other bound fields are empty.
const damien: Character = {
  ownerId: 'local',
  name: 'Damien',
  avatar: '',
  description: 'plain description',
  personality: '',
  scenario: '   ',
  firstMessage: '',
  exampleDialogue: '',
  altDescriptions: [
    { title: 'married', content: 'variant A' },
    { title: 'single', content: 'variant B' },
  ],
  activeDescriptionIndex: -1,
  alternateGreetings: [],
  gallery: [],
  createdAt: 0,
  updatedAt: 0,
  colors: { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' },
}

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

const messages: Message[] = [
  { id: 1, ownerId: 'local', chatId: 1, role: 'assistant', content: 'hello {{user}}', createdAt: 1 },
  // Stamped with a persona that no longer exists: the prompt ignores both fields.
  {
    id: 2,
    ownerId: 'local',
    chatId: 1,
    role: 'user',
    content: 'hi',
    personaId: 99,
    personaName: 'Gone',
    createdAt: 2,
  },
]

const build = (s: PromptStack, character = damien, persona = dom) =>
  buildPrompt({ stack: s, character, persona, messages }).messages

// --- swapTokens ---------------------------------------------------------
assert.strictEqual(swapTokens('{{char}} and {{USER}}', { char: 'D', user: 'Dom' }), 'D and Dom')
assert.strictEqual(
  swapTokens('{{persona}} {{ char }}', { char: 'D', user: 'Dom' }),
  '{{persona}} {{ char }}',
)

// --- {{charDescription}} is the active variant, itself token-swapped ------
{
  const withTokens = { ...damien, description: '{{char}} knows {{user}}' }
  assert.strictEqual(
    swapTokens('bio: {{charDescription}}', characterTokens(withTokens, 'Dom')),
    'bio: Damien knows Dom',
  )
  assert.strictEqual(
    swapTokens('{{CHARDESCRIPTION}}', characterTokens({ ...damien, activeDescriptionIndex: 1 }, 'Dom')),
    'variant B',
  )
  // One pass only: a description that names the token leaves it alone rather than looping.
  assert.strictEqual(
    swapTokens('{{charDescription}}', characterTokens({ ...damien, description: 'x {{charDescription}}' }, 'Dom')),
    'x {{charDescription}}',
  )
  // No character means no value. The token stays put rather than blanking the line.
  assert.strictEqual(swapTokens('{{charDescription}}', { char: 'D', user: 'Dom' }), '{{charDescription}}')
}

// --- every bound source has a matching token -----------------------------
{
  const full: Character = {
    ...damien,
    personality: 'terse, {{char}} to a fault',
    scenario: '{{user}} walks in',
    exampleDialogue: '{{char}}: evening.',
  }
  const tokens = chatTokens(full, { ...dom, description: '{{user}} the bard' })
  assert.strictEqual(swapTokens('{{charPersonality}}', tokens), 'terse, Damien to a fault')
  assert.strictEqual(swapTokens('{{charScenario}}', tokens), 'Dom walks in')
  assert.strictEqual(swapTokens('{{CHAREXAMPLEDIALOGUE}}', tokens), 'Damien: evening.')
  assert.strictEqual(swapTokens('{{personaDescription}}', tokens), 'Dom the bard')
  // Empty card fields resolve to empty, not to a leftover token.
  assert.strictEqual(swapTokens('[{{charPersonality}}]', chatTokens(damien, dom)), '[]')
}

// --- multiplayer cast slots ---------------------------------------------
{
  const mary: Character = { ...damien, name: 'Mary', description: '{{char}} keeps the bar' }
  const cast = [damien, mary]
  const tokens = chatTokens(damien, dom, cast)

  // Filled slots give the name and the active description, the description swapped once against
  // its own character rather than the speaker.
  assert.strictEqual(swapTokens('{{char1}} & {{char2}}', tokens), 'Damien & Mary')
  assert.strictEqual(swapTokens('{{char1Desc}}', tokens), 'plain description')
  assert.strictEqual(swapTokens('{{CHAR2DESC}}', tokens), 'Mary keeps the bar')

  // A slot with no character blanks that token and leaves the rest of the line intact.
  assert.strictEqual(swapTokens('[{{char3}}|{{char4Desc}}]', tokens), '[|]')

  // Slot tokens follow the cast, not the speaker: {{char}} is still whoever is up.
  const asMary = chatTokens(mary, dom, cast)
  assert.strictEqual(swapTokens('{{char}} / {{char1}}', asMary), 'Mary / Damien')

  // Outside a session there is no cast: a stray slot token stays visible.
  assert.strictEqual(swapTokens('{{char3}}', chatTokens(damien, dom)), '{{char3}}')

  // The full four, and a block that is nothing but empty slots is dropped rather than sent blank.
  const four = chatTokens(damien, dom, [damien, mary, damien, mary])
  assert.strictEqual(swapTokens('{{char4}}', four), 'Mary')
  const built = buildPrompt({
    stack: stack([block({ content: '{{char3}}{{char4}}' })]),
    character: damien,
    persona: dom,
    messages: [],
    cast,
  }).messages
  assert.strictEqual(built.length, 0)
}

// --- {{personas}}: the people in a session, absent outside one -----------
{
  const people = 'Dom: a bard\nAda: a guest'
  assert.strictEqual(swapTokens('{{personas}}', chatTokens(damien, dom, [damien], people)), people)
  // Case-insensitive, like every other token.
  assert.strictEqual(swapTokens('{{PERSONAS}}', chatTokens(damien, dom, [damien], people)), people)
  // No session, no value: the token stays visible rather than silently blanking the line.
  assert.strictEqual(swapTokens('{{personas}}', chatTokens(damien, dom)), '{{personas}}')
  // An empty room resolves to '', which drops the block rather than sending a bare label.
  assert.strictEqual(swapTokens('{{personas}}', chatTokens(damien, dom, [damien], '')), '')
  // Not confused with {{personaDescription}}, which shares its prefix.
  assert.strictEqual(
    swapTokens('{{personaDescription}}', chatTokens(damien, dom, [damien], people)),
    'a travelling bard',
  )
  // Reaches the built prompt through buildPrompt's own argument.
  assert.strictEqual(
    buildPrompt({
      stack: stack([block({ content: 'In the room:\n{{personas}}' })]),
      character: damien,
      persona: dom,
      messages: [],
      personas: people,
    }).messages[0].content,
    `In the room:\n${people}`,
  )
}

// --- {{game}}: the game's title, absent outside the games module ---------
{
  assert.strictEqual(swapTokens('{{game}}', chatTokens(damien, dom, undefined, undefined, 'Go Fish')), 'Go Fish')
  assert.strictEqual(swapTokens('{{GAME}}', chatTokens(damien, dom, undefined, undefined, 'Blackjack')), 'Blackjack')
  // An ordinary chat has no game: the token stays literal rather than blanking the sentence.
  assert.strictEqual(swapTokens('{{game}}', chatTokens(damien, dom)), '{{game}}')
  assert.strictEqual(
    buildPrompt({
      stack: stack([block({ content: 'You are playing {{game}} against {{user}}.' })]),
      character: damien,
      persona: dom,
      messages: [],
      game: 'Go Fish',
    }).messages[0].content,
    'You are playing Go Fish against Dom.',
  )
}

// --- conditionals branch per turn, in the same stack ---------------------
{
  const mary: Character = { ...damien, name: 'Mary', description: 'keeps the bar' }
  const cast = [damien, mary]
  const conditional = stack([
    block({
      content: [
        '[if Narrator]',
        'Write as the Narrator.',
        '{{char1}} & {{char2}}',
        '[else]',
        'Write as {{char}}.',
        '{{charDescription}}',
        '[endif]',
      ].join('\n'),
    }),
  ])
  const asWho = (speaker: Character) =>
    buildPrompt({ stack: conditional, character: damien, persona: dom, messages: [], speaker, cast })
      .messages[0].content

  // A character turn takes the else branch: its own description, no cast list.
  assert.strictEqual(asWho(mary), 'Write as Mary.\nkeeps the bar')

  // The Narrator takes the if branch and gets the whole cast. Same stack, different text.
  const narrator: Character = { ...damien, id: -1, name: 'Narrator' }
  assert.strictEqual(asWho(narrator), 'Write as the Narrator.\nDamien & Mary')

  // Slot conditions follow the cast: char3 is empty here and its branch drops.
  const slots = stack([
    block({ content: '[if char2]\ntwo\n[endif]\n[if char3]\nthree\n[endif]\ntail' }),
  ])
  assert.strictEqual(
    buildPrompt({ stack: slots, character: damien, persona: dom, messages: [], cast }).messages[0]
      .content,
    'two\ntail',
  )

  // Outside a session no slot is filled: a cast branch drops and the block goes empty.
  const built = buildPrompt({
    stack: stack([block({ content: '[if char1]\n{{char1}}\n[endif]' })]),
    character: damien,
    persona: dom,
    messages: [],
  })
  assert.strictEqual(built.messages.length, 0)
  assert.deepStrictEqual(built.skipped, [{ label: 'b', reason: 'empty' }])

  // A conditional cannot span two blocks: both halves stay literal text.
  const split = buildPrompt({
    stack: stack([block({ content: '[if Narrator]\na' }), block({ content: 'b\n[endif]' })]),
    character: damien,
    persona: dom,
    messages: [],
  }).messages
  assert.strictEqual(split.length, 1, 'both blocks are system turns, merged into one')
  // The blank line is the same-role merge's separator, not the parser's.
  assert.strictEqual(split[0].content, '[if Narrator]\na\n\nb\n[endif]')
}

// --- tokens resolve in a freeform block, from card and persona alike -----
{
  const out = build(
    stack([block({ content: '{{char}} is {{charPersonality}}; {{user}} is {{personaDescription}}' })]),
    { ...damien, personality: 'terse' },
  )
  assert.strictEqual(out[0].content, 'Damien is terse; Dom is a travelling bard')
}

// --- {{blockVal}} / {{blockVal2}} resolve to the two ends ---------------
{
  const out = build(
    stack([
      block({
        content: 'Write about {{blockVal}} to {{blockVal2}} words.',
        input: { kind: 'range', min: 0, max: 500, step: 10, value: 150, value2: 300 },
      }),
    ]),
  )
  assert.strictEqual(out[0].content, 'Write about 150 to 300 words.')
}

// --- a single-value scroll: both tokens resolve to `value` --------------
{
  const out = build(
    stack([
      block({
        content: 'Write about {{blockVal}} to {{blockVal2}} words.',
        input: { kind: 'range', min: 0, max: 500, step: 10, value: 150 },
      }),
    ]),
  )
  assert.strictEqual(out[0].content, 'Write about 150 to 150 words.')
}

// --- order, merging, history in place -----------------------------------
{
  const out = build(
    stack([
      block({ content: 'main {{char}}' }),
      block({ source: 'characterDescription' }),
      block({ source: 'chatHistory' }),
      block({ content: 'jailbreak' }),
    ]),
  )
  assert.deepStrictEqual(out, [
    { role: 'system', content: 'main Damien\n\nplain description' },
    { role: 'assistant', content: 'hello {{user}}' }, // history is transcript, never substituted
    { role: 'user', content: 'hi' },
    { role: 'system', content: 'jailbreak' }, // a block after history lands after history
  ])
}

// A role change breaks the merge, and order follows the array.
{
  const out = build(
    stack([
      block({ content: 'one' }),
      block({ role: 'user', content: 'two' }),
      block({ content: 'three' }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.deepStrictEqual(out.slice(0, 3), [
    { role: 'system', content: 'one' },
    { role: 'user', content: 'two' },
    { role: 'system', content: 'three' },
  ])
}

// --- empty bound blocks are dropped -------------------------------------
{
  const out = build(
    stack([
      block({ source: 'characterPersonality' }),
      block({ source: 'characterScenario' }),
      block({ source: 'characterExampleDialogue' }),
      block({ content: '   ' }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.deepStrictEqual(out, [
    { role: 'assistant', content: 'hello {{user}}' },
    { role: 'user', content: 'hi' },
  ])
}

// --- a World info block takes the text the caller resolved --------------
{
  const out = buildPrompt({
    stack: stack([block({ source: 'worldInfo' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ before: 'CBT is a talking therapy.' }),
  }).messages
  assert.strictEqual(out[0].content, 'CBT is a talking therapy.')
}

// --- the two slots are separate blocks ----------------------------------
{
  const out = buildPrompt({
    stack: stack([
      block({ source: 'worldInfo' }),
      block({ source: 'characterDescription' }),
      block({ source: 'worldInfoAfter' }),
      block({ source: 'chatHistory' }),
    ]),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ before: 'Before lore.', after: 'After lore.' }),
  }).messages
  // All three are system blocks: they merge into one turn, in stack order.
  assert.strictEqual(out[0].content, 'Before lore.\n\nplain description\n\nAfter lore.')
}

// --- with no after block, after-char entries fold into the before one ---
{
  const out = buildPrompt({
    stack: stack([block({ source: 'worldInfo' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ before: 'Before lore.', after: 'After lore.' }),
  }).messages
  assert.strictEqual(
    out[0].content,
    'Before lore.\nAfter lore.',
    'a stack written before the slots split still sends everything it matched',
  )
}

// --- an entry positioned at a depth goes into history, not the block ----
{
  const out = buildPrompt({
    stack: stack([block({ source: 'worldInfo' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ atDepth: [{ depth: 1, text: 'Depth lore.' }] }),
  }).messages
  // The block itself contributed nothing: the depth entry is the only system turn, and it sits
  // one message from the end rather than ahead of the whole history.
  assert.strictEqual(out.at(-1)?.content, 'hi')
  assert.ok(
    out.some((m) => m.role === 'system' && m.content === 'Depth lore.'),
    'the entry is spliced in as a system turn',
  )
  assert.notStrictEqual(out[0].content, 'Depth lore.', 'it is not the World info block')
}

// --- the at-depth block sets the role those entries go in with ----------
{
  const built = buildPrompt({
    stack: stack([
      block({ label: 'depth', source: 'worldInfoDepth', role: 'user' }),
      block({ source: 'chatHistory' }),
    ]),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ atDepth: [{ depth: 1, text: 'Depth lore.' }] }),
  })
  // As a user turn it merges with the user message it was spliced ahead of, which is exactly what
  // any two neighbouring same-role turns do.
  assert.ok(
    built.messages.some((m) => m.role === 'user' && m.content.startsWith('Depth lore.')),
    'the block carries the role, not a hardcoded system',
  )
  assert.ok(
    !built.messages.some((m) => m.role === 'system' && m.content.includes('Depth lore.')),
  )
  // It holds no text of its own: it is never reported as an empty block while entries match.
  assert.deepStrictEqual(built.skipped, [])
}

// --- disabling the at-depth block drops those entries entirely ----------
{
  const built = buildPrompt({
    stack: stack([
      block({ label: 'depth', source: 'worldInfoDepth', disabled: true }),
      block({ source: 'chatHistory' }),
    ]),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ atDepth: [{ depth: 1, text: 'Depth lore.' }] }),
  })
  assert.ok(!built.messages.some((m) => m.content === 'Depth lore.'))
  assert.deepStrictEqual(built.skipped, [{ label: 'depth', reason: 'disabled' }])
}

// --- an at-depth block with nothing to place reports as empty -----------
{
  const built = buildPrompt({
    stack: stack([
      block({ label: 'depth', source: 'worldInfoDepth' }),
      block({ source: 'chatHistory' }),
    ]),
    character: damien,
    persona: dom,
    messages,
  })
  assert.deepStrictEqual(built.skipped, [{ label: 'depth', reason: 'empty' }])
}

// --- nothing matched leaves no empty turn behind ------------------------
{
  const built = buildPrompt({
    stack: stack([block({ label: 'wi', source: 'worldInfo' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
  })
  assert.deepStrictEqual(built.messages, [
    { role: 'assistant', content: 'hello {{user}}' },
    { role: 'user', content: 'hi' },
  ])
  assert.deepStrictEqual(built.skipped, [{ label: 'wi', reason: 'empty' }])
}

// --- the active description variant wins --------------------------------
{
  const out = build(
    stack([block({ source: 'characterDescription' }), block({ source: 'chatHistory' })]),
    { ...damien, activeDescriptionIndex: 1 },
  )
  assert.strictEqual(out[0].content, 'variant B')
}

// --- tokens resolve in every card field, not just freeform blocks -------
{
  const out = build(
    stack([
      block({ source: 'characterDescription' }),
      block({ source: 'characterScenario' }),
      block({ source: 'chatHistory' }),
    ]),
    {
      ...damien,
      description: '{{char}} has known {{user}} for years',
      scenario: '{{user}} visits the {{tavern}}', // unknown tokens still survive
    },
  )
  assert.strictEqual(
    out[0].content,
    'Damien has known Dom for years\n\nDom visits the {{tavern}}',
  )
}

// --- persona description ------------------------------------------------
{
  const out = build(
    stack([block({ source: 'personaDescription' }), block({ source: 'chatHistory' })]),
  )
  assert.strictEqual(out[0].content, 'a travelling bard')
}

// Tokens resolve in it, and {{user}} is the active persona, not the name stamped on a past turn.
{
  const out = build(
    stack([block({ source: 'personaDescription' }), block({ source: 'chatHistory' })]),
    damien,
    { ...dom, description: '{{user}} owes {{char}} money' },
  )
  assert.strictEqual(out[0].content, 'Dom owes Damien money')
}

// An empty persona description is dropped like any other blank bound block.
{
  const out = build(
    stack([block({ source: 'personaDescription' }), block({ source: 'chatHistory' })]),
    damien,
    { ...dom, description: '  ' },
  )
  assert.strictEqual(out[0].role, 'assistant')
}

// --- nesting: a wrapper block wraps its children -------------------------
{
  const out = build(
    stack([
      block({
        content: '<characters>',
        closeContent: '</characters>',
        children: [
          block({ content: 'Damien is {{char}}.' }),
          block({ source: 'characterDescription' }),
        ],
      }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.strictEqual(
    out[0].content,
    '<characters>\nDamien is Damien.\nplain description\n</characters>',
  )
}

// Children inherit the parent's role, whatever their own says.
{
  const out = build(
    stack([
      block({
        role: 'user',
        content: 'open',
        closeContent: 'close',
        children: [block({ role: 'assistant', content: 'inner' })],
      }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.deepStrictEqual(out[0], { role: 'user', content: 'open\ninner\nclose' })
}

// Arbitrary depth, and blank children just vanish.
{
  const out = build(
    stack([
      block({
        content: 'a',
        closeContent: '/a',
        children: [
          block({ content: 'b', closeContent: '/b', children: [block({ content: 'deep' })] }),
          block({ source: 'characterPersonality' }), // empty on this card
          block({ content: '   ' }),
        ],
      }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.strictEqual(out[0].content, 'a\nb\ndeep\n/b\n/a')

  // Display-only indent: two spaces per level, top level flush, blank lines untouched. Same tree.
  const indented = buildPrompt({
    stack: stack([
      block({
        content: 'a',
        closeContent: '/a',
        children: [
          block({ content: 'b', closeContent: '/b', children: [block({ content: 'deep' })] }),
          block({ source: 'characterPersonality' }),
          block({ content: '   ' }),
        ],
      }),
      block({ source: 'chatHistory' }),
    ]),
    character: damien,
    persona: dom,
    messages,
    indent: true,
  }).messages
  assert.strictEqual(indented[0].content, 'a\n  b\n    deep\n  /b\n/a')
}

// An empty container still emits its tags; a bare group emits only its children.
{
  const out = build(
    stack([
      block({ content: '<empty>', closeContent: '</empty>', children: [] }),
      block({ content: '', closeContent: '', children: [block({ content: 'just me' })] }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.strictEqual(out[0].content, '<empty>\n</empty>\n\njust me')
}

// A container with nothing to say at all produces no message.
{
  const out = build(
    stack([
      block({ content: '', closeContent: '', children: [block({ content: ' ' })] }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.strictEqual(out[0].role, 'assistant')
}

// Nested chat history contributes nothing: the editor refuses it, the builder ignores it.
{
  const out = build(
    stack([
      block({ content: 'open', closeContent: 'close', children: [block({ source: 'chatHistory' })] }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.strictEqual(out[0].content, 'open\nclose')
  assert.strictEqual(out.length, 3) // the top-level history block still produced its two turns
}

// --- switched off contributes nothing, at any depth ----------------------
{
  const out = build(
    stack([
      block({ content: 'kept' }),
      block({ content: 'silenced', disabled: true }),
      block({
        content: '<wrap>',
        closeContent: '</wrap>',
        children: [block({ content: 'in' }), block({ content: 'out', disabled: true })],
      }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.strictEqual(out[0].content, 'kept\n\n<wrap>\nin\n</wrap>')
}

// A disabled container takes its children with it, however lively they are.
{
  const out = build(
    stack([
      block({
        content: '<wrap>',
        closeContent: '</wrap>',
        disabled: true,
        children: [block({ content: 'in' })],
      }),
      block({ source: 'chatHistory' }),
    ]),
  )
  assert.strictEqual(out[0].role, 'assistant') // straight to history
}

// A disabled history block sends no history at all.
{
  const out = build(
    stack([block({ content: 'only me' }), block({ source: 'chatHistory', disabled: true })]),
  )
  assert.deepStrictEqual(out, [{ role: 'system', content: 'only me' }])
}

// --- a parked history block produces no history -------------------------
{
  const history = block({ source: 'chatHistory' })
  const out = build(stack([block({ content: 'only me' })], [history]))
  assert.deepStrictEqual(out, [{ role: 'system', content: 'only me' }])
}

// --- author's note by depth ----------------------------------------------
const noteChat = {
  ownerId: 'local',
  characterId: 1,
  title: 't',
  authorNote: 'keep it short',
  createdAt: 0,
  updatedAt: 0,
}

const longHistory: Message[] = ['a', 'b', 'c', 'd'].map((content, i) => ({
  id: i + 1,
  ownerId: 'local',
  chatId: 1,
  role: i % 2 === 0 ? 'user' : 'assistant',
  content,
  createdAt: i,
}))

// Depth 2 lands two messages from the end.
{
  const out = buildPrompt({
    stack: stack([
      block({ source: 'chatHistory' }),
      block({ source: 'authorNote', depth: 2 }),
    ]),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: noteChat,
  }).messages
  assert.deepStrictEqual(out, [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: 'b' },
    { role: 'system', content: 'keep it short' },
    { role: 'user', content: 'c' },
    { role: 'assistant', content: 'd' },
  ])
}

// Depth past the history length clamps to the top rather than throwing.
{
  const out = buildPrompt({
    stack: stack([block({ source: 'chatHistory' }), block({ source: 'authorNote', depth: 99 })]),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: noteChat,
  }).messages
  assert.deepStrictEqual(out[0], { role: 'system', content: 'keep it short' })
  assert.strictEqual(out.length, 5)
}

// No depth: the block sits where it sits in the stack.
{
  const out = buildPrompt({
    stack: stack([block({ source: 'authorNote' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: noteChat,
  }).messages
  assert.deepStrictEqual(out[0], { role: 'system', content: 'keep it short' })
}

// An empty note produces no message at all, at any depth, and with no chat passed.
for (const chat of [{ ...noteChat, authorNote: '  ' }, undefined]) {
  const out = buildPrompt({
    stack: stack([
      block({ content: 'sys' }),
      block({ source: 'chatHistory' }),
      block({ source: 'authorNote', depth: 2 }),
    ]),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat,
  }).messages
  assert.strictEqual(out.length, 5) // one system block + four history turns
  assert.ok(!out.some((m) => m.content.includes('keep it short')))
}

// Depth 0 puts the note after the final history message.
{
  const out = buildPrompt({
    stack: stack([block({ source: 'chatHistory' }), block({ source: 'authorNote', depth: 0 })]),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: noteChat,
  }).messages
  assert.deepStrictEqual(out.at(-1), { role: 'system', content: 'keep it short' })
  assert.strictEqual(out.length, 5)
  assert.strictEqual(out[3].content, 'd') // the last real turn still comes before it
}

// The chat's own depth beats the stack block's, and clearing it hands control back.
{
  const withBlock = stack([
    block({ source: 'chatHistory' }),
    block({ source: 'authorNote', depth: 2 }),
  ])
  const args = { stack: withBlock, character: damien, persona: dom, messages: longHistory }
  const deep = buildPrompt({ ...args, chat: { ...noteChat, authorNoteDepth: 0 } }).messages
  assert.deepStrictEqual(deep.at(-1), { role: 'system', content: 'keep it short' })
  const stackDepth = buildPrompt({ ...args, chat: noteChat }).messages
  assert.strictEqual(stackDepth[2].content, 'keep it short') // back to the block's depth 2
}

// A chat with no note produces exactly what a stack with no authorNote block produces.
{
  const blocks = [block({ content: 'sys' }), block({ source: 'chatHistory' })]
  const withNote = buildPrompt({
    stack: stack([...blocks, block({ source: 'authorNote', depth: 2 })]),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: { ...noteChat, authorNote: '' },
  })
  const without = buildPrompt({
    stack: stack(blocks),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: { ...noteChat, authorNote: '' },
  })
  assert.deepStrictEqual(withNote.messages, without.messages)
  assert.strictEqual(withNote.tokensUsed, without.tokensUsed) // and it costs nothing either
}

// --- resolved params reach buildPrompt ------------------------------------
{
  const connection: Connection = {
    id: 'c1',
    name: 'local',
    endpointUrl: 'http://localhost:5001/v1',
    apiKey: '',
    model: 'm',
    type: 'chat',
    params: [{ key: 'max_tokens', value: 16 }],
    contextLimit: 4096,
    safetyMarginPct: 0,
  }
  const args = {
    stack: stack([block({ content: 'sys' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages: longHistory,
  }

  // The connection's own limit holds all four turns.
  const plain = buildPrompt(args, budgetOf(resolveParams(connection)))
  assert.strictEqual(plain.droppedCount, 0)

  // A chat contextLimit override changes what gets dropped.
  const tight = buildPrompt(
    args,
    budgetOf(resolveParams(connection, damien, { ...noteChat, paramOverrides: { contextLimit: 40 } })),
  )
  assert.ok(tight.droppedCount > 0, 'the chat override tightened the budget')

  // And the chat still beats a character override, through the same one call.
  const both = buildPrompt(
    args,
    budgetOf(
      resolveParams(
        connection,
        { ...damien, paramOverrides: { contextLimit: 40 } },
        { ...noteChat, paramOverrides: { contextLimit: 4096 } },
      ),
    ),
  )
  assert.strictEqual(both.droppedCount, 0)
}

// --- a speaker resolves character blocks and {{char}} --------------------
{
  const mary: Character = { ...damien, name: 'Mary', description: "Mary's card, {{char}} only" }
  const out = buildPrompt({
    stack: stack([
      block({ content: '{{char}} speaks' }),
      block({ source: 'characterDescription' }),
      block({ source: 'chatHistory' }),
    ]),
    character: damien,
    persona: dom,
    messages,
    speaker: mary,
  }).messages
  assert.strictEqual(out[0].content, "Mary speaks\n\nMary's card, Mary only")
}

// --- appendSystem lands last and is counted, never exempted ---------------
{
  const built = buildPrompt({
    stack: stack([block({ content: 'sys' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    appendSystem: 'do it differently',
  })
  assert.deepStrictEqual(built.messages.at(-1), { role: 'system', content: 'do it differently' })
  const plain = buildPrompt({
    stack: stack([block({ content: 'sys' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
  })
  assert.ok(built.tokensUsed > plain.tokensUsed, 'the instruction costs tokens')
  // Blank is no instruction at all, not a blank system turn.
  const blank = buildPrompt({
    stack: stack([block({ content: 'sys' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    appendSystem: '  ',
  })
  assert.deepStrictEqual(blank.messages, plain.messages)
}

// --- appendAssistant is the prefill: last turn, after appendSystem --------
{
  const built = buildPrompt({
    stack: stack([block({ content: 'sys' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    appendSystem: 'carry on',
    appendAssistant: 'half a sen',
  })
  // Last, and its own turn: a prefill the model continues only works as the final message.
  assert.deepStrictEqual(built.messages.at(-1), { role: 'assistant', content: 'half a sen' })
  assert.deepStrictEqual(built.messages.at(-2), { role: 'system', content: 'carry on' })
  const plain = buildPrompt({
    stack: stack([block({ content: 'sys' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    appendSystem: 'carry on',
  })
  assert.ok(built.tokensUsed > plain.tokensUsed, 'the partial costs tokens')
  // Blank is no prefill at all, not a blank assistant turn.
  const blank = buildPrompt({
    stack: stack([block({ content: 'sys' }), block({ source: 'chatHistory' })]),
    character: damien,
    persona: dom,
    messages,
    appendSystem: 'carry on',
    appendAssistant: '  ',
  })
  assert.deepStrictEqual(blank.messages, plain.messages)
}

// --- rewrite instructions -------------------------------------------------
{
  assert.ok(rewritePrompt('old text', '  shorter  ').includes('old text'))
  assert.ok(rewritePrompt('old text', '  shorter  ').includes('following this instruction: shorter'))

  // The last message has nothing after it: there's no old-message default.
  assert.strictEqual(oldMessageInstruction([], 'Damien'), '')

  // Later messages are quoted with who said them: the stamped persona name, and the speaker name
  // in a group chat, falling back to the character.
  const later: Message[] = [
    { id: 3, ownerId: 'local', chatId: 1, role: 'user', content: 'and then?', personaName: 'Dom', createdAt: 3 },
    { id: 4, ownerId: 'local', chatId: 1, role: 'assistant', content: 'I never went back.', createdAt: 4 },
    { id: 5, ownerId: 'local', chatId: 1, role: 'assistant', content: 'Nor did I.', speakerName: 'Mary', createdAt: 5 },
  ]
  const note = oldMessageInstruction(later, 'Damien')
  assert.ok(note.includes('Dom: and then?'))
  assert.ok(note.includes('Damien: I never went back.'))
  assert.ok(note.includes('Mary: Nor did I.'))
  // Verbatim, in order, and no name is invented for a turn that has one.
  assert.ok(note.indexOf('and then?') < note.indexOf('I never went back.'))
}

// --- content options ------------------------------------------------------
{
  const opts = [
    { name: 'Option 1', content: 'hemingway' },
    { name: 'Option 2', content: 'vonnegut' },
  ]
  // Default picks the first option; `content` is ignored when options exist.
  const first = build(stack([block({ content: 'ignored', options: opts })]))
  assert.ok(first.some((m) => m.content.includes('hemingway')))
  assert.ok(!first.some((m) => m.content.includes('vonnegut')))
  assert.ok(!first.some((m) => m.content.includes('ignored')))

  // activeOption selects the other one.
  const second = build(stack([block({ content: 'ignored', options: opts, activeOption: 1 })]))
  assert.ok(second.some((m) => m.content.includes('vonnegut')))

  // Out-of-range index resolves to empty rather than throwing.
  const bad = build(stack([block({ content: 'ignored', options: opts, activeOption: 9 })]))
  assert.ok(!bad.some((m) => m.content.includes('hemingway')))
}

// --- card system_prompt / post_history_instructions ----------------------
{
  const sysBlock = block({ source: 'characterSystemPrompt', content: 'STACK DEFAULT' })
  const withCard = (systemPrompt: string) => ({ ...damien, systemPrompt })
  const text = (s: PromptStack, c: Character) =>
    build(s, c)
      .map((m) => m.content)
      .join('\n')

  // No card value: the block's own content is used. This is the spec's empty-string fallback.
  assert.ok(text(stack([sysBlock]), withCard('')).includes('STACK DEFAULT'))
  // Whitespace is not a value either.
  assert.ok(text(stack([sysBlock]), withCard('   ')).includes('STACK DEFAULT'))

  // A card value replaces the block's content outright.
  const replaced = text(stack([sysBlock]), withCard('CARD RULES'))
  assert.ok(replaced.includes('CARD RULES'))
  assert.ok(!replaced.includes('STACK DEFAULT'))

  // {{original}} brings the block's own content back: a card can extend rather than replace.
  const extended = text(stack([sysBlock]), withCard('{{original}} Also be terse.'))
  assert.ok(extended.includes('STACK DEFAULT Also be terse.'))

  // Same casing and inner-space tolerance as every other token.
  assert.ok(text(stack([sysBlock]), withCard('{{ ORIGINAL }}!')).includes('STACK DEFAULT!'))

  // {{original}} in the block's own content is NOT substituted into itself: otherwise a stack
  // author writing it would get their own text pasted in twice.
  const selfRef = block({ source: 'characterSystemPrompt', content: 'a {{original}} b' })
  assert.ok(text(stack([selfRef]), withCard('')).includes('a {{original}} b'))

  // A character with the field absent entirely (older record) behaves as empty, not as a crash.
  const legacy = { ...damien } as Character
  delete (legacy as Partial<Character>).systemPrompt
  assert.ok(text(stack([sysBlock]), legacy).includes('STACK DEFAULT'))

  // Post-history reads its own field, and the two don't cross over.
  const postBlock = block({ source: 'characterPostHistory', content: 'POST DEFAULT' })
  const both = text(stack([sysBlock, postBlock]), {
    ...damien,
    systemPrompt: 'SYS',
    postHistoryInstructions: 'POST',
  })
  assert.ok(both.includes('SYS'))
  assert.ok(both.includes('POST'))
  assert.ok(!both.includes('DEFAULT'))

  // Disabled means gone, card value or not.
  const off = block({ source: 'characterSystemPrompt', content: 'x', disabled: true })
  assert.ok(!text(stack([off]), withCard('CARD RULES')).includes('CARD RULES'))
}

console.log('ok')
