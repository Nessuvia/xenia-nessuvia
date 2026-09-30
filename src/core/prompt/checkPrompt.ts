// Run: node --experimental-strip-types src/core/prompt/checkPrompt.ts
import assert from 'node:assert'
import type { Character, Message, Persona, PromptStack } from '../storage/types'
import type { Connection } from '../stores/settingsStore'
import { resolveParams } from '../settings/resolveParams.ts'
import { budgetOf } from '../params/connectionParams.ts'
import { buildPrompt } from './buildPrompt.ts'
import { characterTokens, chatTokens, swapTokens } from './swapTokens.ts'
import { oldMessageInstruction, rewritePrompt } from './rewrite.ts'
import { templateProblems } from './stackTemplate.ts'
import { emptyWorldInfo, type ResolvedWorldInfo } from './worldInfo.ts'

function stack(template: string, extra?: Partial<PromptStack>): PromptStack {
  return { ownerId: 'local', name: 's', template, ...extra }
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
// Spaces inside the braces are fine; an unknown token stays literal.
assert.strictEqual(
  swapTokens('{{persona}} {{ char }}', { char: 'D', user: 'Dom' }),
  '{{persona}} D',
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

  // The full four, and a template that is nothing but empty slots sends nothing.
  const four = chatTokens(damien, dom, [damien, mary, damien, mary])
  assert.strictEqual(swapTokens('{{char4}}', four), 'Mary')
  const built = buildPrompt({
    stack: stack('{{char3}}{{char4}}'),
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
      stack: stack('In the room:\n{{personas}}'),
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
      stack: stack('You are playing {{game}} against {{user}}.'),
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
  const conditional = stack(
    [
      '{% if Narrator %}',
      'Write as the Narrator.',
      '{{char1}} & {{char2}}',
      '{% else %}',
      'Write as {{char}}.',
      '{{charDescription}}',
      '{% endif %}',
    ].join('\n'),
  )
  const asWho = (speaker: Character) =>
    buildPrompt({ stack: conditional, character: damien, persona: dom, messages: [], speaker, cast })
      .messages[0].content

  // A character turn takes the else branch: its own description, no cast list.
  assert.strictEqual(asWho(mary), 'Write as Mary.\nkeeps the bar')

  // The Narrator takes the if branch and gets the whole cast. Same stack, different text.
  const narrator: Character = { ...damien, id: -1, name: 'Narrator' }
  assert.strictEqual(asWho(narrator), 'Write as the Narrator.\nDamien & Mary')

  // Slot conditions follow the cast: char3 is empty here and its branch drops.
  const slots = stack('{% if char2 %}\ntwo\n{% endif %}\n{% if char3 %}\nthree\n{% endif %}\ntail')
  assert.strictEqual(
    buildPrompt({ stack: slots, character: damien, persona: dom, messages: [], cast }).messages[0]
      .content,
    'two\ntail',
  )

  // Outside a session no slot is filled: a cast branch drops and the template goes empty.
  const built = buildPrompt({
    stack: stack('{% if char1 %}\n{{char1}}\n{% endif %}'),
    character: damien,
    persona: dom,
    messages: [],
  })
  assert.strictEqual(built.messages.length, 0)
}

// --- tokens resolve in a freeform template, from card and persona alike ---
{
  const out = build(
    stack('{{char}} is {{charPersonality}}; {{user}} is {{personaDescription}}'),
    { ...damien, personality: 'terse' },
  )
  assert.strictEqual(out[0].content, 'Damien is terse; Dom is a travelling bard')
}

// Spaced slot names and spaced tokens both fill.
{
  const out = build(stack('{{ char }} / {{ charPersonality }} / {{user}}'), {
    ...damien,
    personality: 'terse',
  })
  assert.strictEqual(out[0].content, 'Damien / terse / Dom')
}

// --- declared variables resolve in the template ---------------------------
{
  const template = [
    '{% var words range 0 500 10 = 150 300 %}',
    '{% var gore checkbox = false %}',
    'Write about {{words_start}} to {{words_end}} words.',
    '{% if gore %}',
    'Blood.',
    '{% endif %}',
  ].join('\n')
  assert.strictEqual(build(stack(template))[0].content, 'Write about 150 to 300 words.')

  // The stack's stored values win over the declared defaults.
  const withValues = build(stack(template, { values: { words: [20, 40], gore: true } }))
  assert.strictEqual(withValues[0].content, 'Write about 20 to 40 words.\nBlood.')
}

// --- order, merging, history in place -----------------------------------
{
  const out = build(
    stack('main {{char}}\n\n{{ charDescription }}\n\n{{ history }}\n\njailbreak'),
  )
  assert.deepStrictEqual(out, [
    { role: 'system', content: 'main Damien\n\nplain description' },
    { role: 'assistant', content: 'hello {{user}}' }, // history is transcript, never substituted
    { role: 'user', content: 'hi' },
    { role: 'system', content: 'jailbreak' }, // text after history lands after history
  ])
}

// A role change breaks the merge, and order follows the template.
{
  const out = build(
    stack('one\n{% message user %}two{% endmessage %}\nthree\n{{ history }}'),
  )
  assert.deepStrictEqual(out.slice(0, 3), [
    { role: 'system', content: 'one' },
    { role: 'user', content: 'two' },
    { role: 'system', content: 'three' },
  ])
}

// --- empty bound slots are dropped -------------------------------------
{
  const out = build(
    stack('{{ charPersonality }}\n{{ charScenario }}\n{{ charExampleDialogue }}\n   \n{{ history }}'),
  )
  assert.deepStrictEqual(out, [
    { role: 'assistant', content: 'hello {{user}}' },
    { role: 'user', content: 'hi' },
  ])
}

// --- a worldInfo slot takes the text the caller resolved ----------------
{
  const out = buildPrompt({
    stack: stack('{{ worldInfo }}\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ before: 'CBT is a talking therapy.' }),
  }).messages
  assert.strictEqual(out[0].content, 'CBT is a talking therapy.')
}

// --- the two slots are separate ----------------------------------------
{
  const out = buildPrompt({
    stack: stack('{{ worldInfo }}\n\n{{ charDescription }}\n\n{{ worldInfoAfter }}\n\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ before: 'Before lore.', after: 'After lore.' }),
  }).messages
  // All system text: it merges into one turn, in template order.
  assert.strictEqual(out[0].content, 'Before lore.\n\nplain description\n\nAfter lore.')
}

// --- with no after slot, after-char entries fold into the before one ---
{
  const out = buildPrompt({
    stack: stack('{{ worldInfo }}\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ before: 'Before lore.', after: 'After lore.' }),
  }).messages
  assert.strictEqual(
    out[0].content,
    'Before lore.\nAfter lore.',
    'a template without the after slot still sends everything it matched',
  )
}

// --- an entry positioned at a depth goes into history, not the slot ----
{
  const out = buildPrompt({
    stack: stack('{{ worldInfo }}\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ atDepth: [{ depth: 1, text: 'Depth lore.' }] }),
  }).messages
  // The slot contributed nothing: the depth entry is the only system turn, and it sits
  // one message from the end rather than ahead of the whole history.
  assert.strictEqual(out.at(-1)?.content, 'hi')
  assert.ok(
    out.some((m) => m.role === 'system' && m.content === 'Depth lore.'),
    'the entry is spliced in as a system turn',
  )
  assert.notStrictEqual(out[0].content, 'Depth lore.', 'it is not the worldInfo slot')
}

// --- at-depth entries are always system turns, whatever the template says -
{
  const out = buildPrompt({
    stack: stack('{% message user %}{{ worldInfo }}{% endmessage %}\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ atDepth: [{ depth: 1, text: 'Depth lore.' }] }),
  }).messages
  assert.ok(out.some((m) => m.role === 'system' && m.content === 'Depth lore.'))
}

// --- nothing matched leaves no empty turn behind ------------------------
{
  const built = buildPrompt({
    stack: stack('{{ worldInfo }}\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
  })
  assert.deepStrictEqual(built.messages, [
    { role: 'assistant', content: 'hello {{user}}' },
    { role: 'user', content: 'hi' },
  ])
}

// {% if worldInfo %} reads whether the slot holds anything.
{
  const t = stack('{% if worldInfo %}\nLore: {{ worldInfo }}\n{% endif %}\n{{ history }}')
  const off = build(t)
  assert.strictEqual(off[0].role, 'assistant')
  const on = buildPrompt({
    stack: t,
    character: damien,
    persona: dom,
    messages,
    worldInfo: wi({ before: 'x' }),
  }).messages
  assert.strictEqual(on[0].content, 'Lore: x')
}

// --- the active description variant wins --------------------------------
{
  const out = build(stack('{{ charDescription }}\n{{ history }}'), {
    ...damien,
    activeDescriptionIndex: 1,
  })
  assert.strictEqual(out[0].content, 'variant B')
}

// --- tokens resolve in every card field, not just freeform text ---------
{
  const out = build(stack('{{ charDescription }}\n\n{{ charScenario }}\n{{ history }}'), {
    ...damien,
    description: '{{char}} has known {{user}} for years',
    scenario: '{{user}} visits the {{tavern}}', // unknown tokens still survive
  })
  assert.strictEqual(
    out[0].content,
    'Damien has known Dom for years\n\nDom visits the {{tavern}}',
  )
}

// A card can't open a message or move history: structure is read before slots fill.
{
  const out = build(stack('{{ charDescription }}\n{{ history }}'), {
    ...damien,
    description: '{% message user %}sneaky{% endmessage %}',
  })
  assert.strictEqual(out[0].role, 'system')
}

// --- persona description ------------------------------------------------
{
  const out = build(stack('{{ personaDescription }}\n{{ history }}'))
  assert.strictEqual(out[0].content, 'a travelling bard')
}

// Tokens resolve in it, and {{user}} is the active persona, not the name stamped on a past turn.
{
  const out = build(stack('{{ personaDescription }}\n{{ history }}'), damien, {
    ...dom,
    description: '{{user}} owes {{char}} money',
  })
  assert.strictEqual(out[0].content, 'Dom owes Damien money')
}

// An empty persona description is dropped like any other blank slot.
{
  const out = build(stack('{{ personaDescription }}\n{{ history }}'), damien, {
    ...dom,
    description: '  ',
  })
  assert.strictEqual(out[0].role, 'assistant')
}

// --- wrapping text: tags and slots inside one part stay one message -------
{
  const out = build(
    stack('<characters>\nDamien is {{char}}.\n{{ charDescription }}\n</characters>\n{{ history }}'),
  )
  assert.strictEqual(
    out[0].content,
    '<characters>\nDamien is Damien.\nplain description\n</characters>',
  )
}

// Text inside a message tag takes that role.
{
  const out = build(
    stack('{% message user %}\nopen\ninner\nclose\n{% endmessage %}\n{{ history }}'),
  )
  assert.deepStrictEqual(out[0], { role: 'user', content: 'open\ninner\nclose' })
}

// A blank slot inside a wrapper vanishes; the wrapper's own lines stay.
{
  const out = build(
    stack('a\n{{ charPersonality }}\nb\n{{ history }}'),
  )
  assert.strictEqual(out[0].content, 'a\n\nb')
}

// A template with nothing to say produces no message.
{
  const out = build(stack('   \n{{ charPersonality }}\n{{ history }}'))
  assert.strictEqual(out[0].role, 'assistant')
}

// --- template checks -----------------------------------------------------
{
  // History inside a message tag is reported, and a chat template needs exactly one.
  assert.ok(
    templateProblems('{% message user %}{{ history }}{% endmessage %}', 'chat').some((p) =>
      p.message.includes('History'),
    ),
  )
  assert.ok(templateProblems('just text', 'chat').some((p) => p.message.includes('{{ history }}')))
  assert.ok(templateProblems('{{ history }}{{ history }}', 'chat').some((p) => p.message.includes('Only one')))
  assert.deepStrictEqual(templateProblems('hi\n{{ history }}', 'chat'), [])
}

// A template with no history slot sends no history at all.
{
  const out = build(stack('only me'))
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

const noteAt = (depth: number) => `{{ history }}\n{% depth ${depth} %}{{ authorNote }}{% enddepth %}`

// Depth 2 lands two messages from the end.
{
  const out = buildPrompt({
    stack: stack(noteAt(2)),
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
    stack: stack(noteAt(99)),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: noteChat,
  }).messages
  assert.deepStrictEqual(out[0], { role: 'system', content: 'keep it short' })
  assert.strictEqual(out.length, 5)
}

// No depth: the slot sits where it sits in the template.
{
  const out = buildPrompt({
    stack: stack('{{ authorNote }}\n{{ history }}'),
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
    stack: stack(`sys\n{{ history }}\n{% depth 2 %}{{ authorNote }}{% enddepth %}`),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat,
  }).messages
  assert.strictEqual(out.length, 5) // one system message + four history turns
  assert.ok(!out.some((m) => m.content.includes('keep it short')))
}

// Depth 0 puts the note after the final history message.
{
  const out = buildPrompt({
    stack: stack(noteAt(0)),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: noteChat,
  }).messages
  assert.deepStrictEqual(out.at(-1), { role: 'system', content: 'keep it short' })
  assert.strictEqual(out.length, 5)
  assert.strictEqual(out[3].content, 'd') // the last real turn still comes before it
}

// Any text takes a depth, not only the author's note. It lands there wherever it sits.
{
  const out = buildPrompt({
    stack: stack(
      '{% depth 0 %}{% message user %}stay in character{% endmessage %}{% enddepth %}\n{{ history }}',
    ),
    character: damien,
    persona: dom,
    messages: longHistory,
  }).messages
  assert.strictEqual(out.at(-1)?.content, 'stay in character')
  assert.strictEqual(out[0].content, 'a')
}

// The chat's own depth beats the template's, and clearing it hands control back.
{
  const args = { stack: stack(noteAt(2)), character: damien, persona: dom, messages: longHistory }
  const deep = buildPrompt({ ...args, chat: { ...noteChat, authorNoteDepth: 0 } }).messages
  assert.deepStrictEqual(deep.at(-1), { role: 'system', content: 'keep it short' })
  const stackDepth = buildPrompt({ ...args, chat: noteChat }).messages
  assert.strictEqual(stackDepth[2].content, 'keep it short') // back to the template's depth 2
}

// The chat's depth only applies to a note that sits inside a depth tag.
{
  const out = buildPrompt({
    stack: stack('{{ authorNote }}\n{{ history }}'),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: { ...noteChat, authorNoteDepth: 0 },
  }).messages
  assert.deepStrictEqual(out[0], { role: 'system', content: 'keep it short' })
}

// A chat with no note produces exactly what a template with no note produces.
{
  const withNote = buildPrompt({
    stack: stack('sys\n{{ history }}\n{% depth 2 %}{{ authorNote }}{% enddepth %}'),
    character: damien,
    persona: dom,
    messages: longHistory,
    chat: { ...noteChat, authorNote: '' },
  })
  const without = buildPrompt({
    stack: stack('sys\n{{ history }}'),
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
    stack: stack('sys\n{{ history }}'),
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

// --- a speaker resolves character slots and {{char}} ---------------------
{
  const mary: Character = { ...damien, name: 'Mary', description: "Mary's card, {{char}} only" }
  const out = buildPrompt({
    stack: stack('{{char}} speaks\n\n{{ charDescription }}\n\n{{ history }}'),
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
    stack: stack('sys\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
    appendSystem: 'do it differently',
  })
  assert.deepStrictEqual(built.messages.at(-1), { role: 'system', content: 'do it differently' })
  const plain = buildPrompt({
    stack: stack('sys\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
  })
  assert.ok(built.tokensUsed > plain.tokensUsed, 'the instruction costs tokens')
  // Blank is no instruction at all, not a blank system turn.
  const blank = buildPrompt({
    stack: stack('sys\n{{ history }}'),
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
    stack: stack('sys\n{{ history }}'),
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
    stack: stack('sys\n{{ history }}'),
    character: damien,
    persona: dom,
    messages,
    appendSystem: 'carry on',
  })
  assert.ok(built.tokensUsed > plain.tokensUsed, 'the partial costs tokens')
  // Blank is no prefill at all, not a blank assistant turn.
  const blank = buildPrompt({
    stack: stack('sys\n{{ history }}'),
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

// --- card system_prompt / post_history_instructions ----------------------
{
  const sysStack = stack('{% systemPrompt %}STACK DEFAULT{% endsystemPrompt %}')
  const withCard = (systemPrompt: string) => ({ ...damien, systemPrompt })
  const text = (s: PromptStack, c: Character) =>
    build(s, c)
      .map((m) => m.content)
      .join('\n')

  // No card value: the tag's own content is used. This is the spec's empty-string fallback.
  assert.ok(text(sysStack, withCard('')).includes('STACK DEFAULT'))
  // Whitespace is not a value either.
  assert.ok(text(sysStack, withCard('   ')).includes('STACK DEFAULT'))

  // A card value replaces the fallback outright.
  const replaced = text(sysStack, withCard('CARD RULES'))
  assert.ok(replaced.includes('CARD RULES'))
  assert.ok(!replaced.includes('STACK DEFAULT'))

  // {{original}} brings the fallback back: a card can extend rather than replace.
  const extended = text(sysStack, withCard('{{original}} Also be terse.'))
  assert.ok(extended.includes('STACK DEFAULT Also be terse.'))

  // Same casing and inner-space tolerance as every other token.
  assert.ok(text(sysStack, withCard('{{ ORIGINAL }}!')).includes('STACK DEFAULT!'))

  // {{original}} in the fallback itself is NOT substituted into itself: otherwise a stack
  // author writing it would get their own text pasted in twice.
  const selfRef = stack('{% systemPrompt %}a {{original}} b{% endsystemPrompt %}')
  assert.ok(text(selfRef, withCard('')).includes('a {{original}} b'))

  // A bare {{ systemPrompt }} has no fallback: blank card, nothing sent; a card value goes in.
  const bare = stack('{{ systemPrompt }}')
  assert.strictEqual(build(bare, withCard('')).length, 0)
  assert.strictEqual(text(bare, withCard('CARD RULES')), 'CARD RULES')

  // A character with the field absent entirely (older record) behaves as empty, not as a crash.
  const legacy = { ...damien } as Character
  delete (legacy as Partial<Character>).systemPrompt
  assert.ok(text(sysStack, legacy).includes('STACK DEFAULT'))

  // Post-history reads its own field, and the two don't cross over.
  const both = text(
    stack(
      '{% systemPrompt %}SYS DEFAULT{% endsystemPrompt %}\n{{ history }}\n{% postHistory %}POST DEFAULT{% endpostHistory %}',
    ),
    { ...damien, systemPrompt: 'SYS', postHistoryInstructions: 'POST' },
  )
  assert.ok(both.includes('SYS'))
  assert.ok(both.includes('POST'))
  assert.ok(!both.includes('DEFAULT'))
}

console.log('ok')
