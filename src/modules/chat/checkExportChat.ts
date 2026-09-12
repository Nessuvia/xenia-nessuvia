// Run: node --experimental-strip-types src/modules/chat/checkExportChat.ts
import assert from 'node:assert'
import type { Chat, Message } from '../../core/storage/types.ts'
import { resolvePalette } from '../../core/palette/palette.ts'
import type { TagRule } from '../../core/stores/settingsStore'
import {
  buildHtml,
  buildTranscript,
  buildTxt,
  escapeHtml,
  preview,
  usedTagRules,
  type Names,
} from './exportChat.ts'

const chat: Chat = {
  id: 1,
  ownerId: 'local',
  characterId: 7,
  title: 'Rooftop & <b>rain</b>',
  createdAt: 0,
  updatedAt: 0,
}

const message = (m: Partial<Message> & { role: Message['role']; content: string }): Message => ({
  ownerId: 'local',
  chatId: 1,
  createdAt: 0,
  ...m,
})

const names: Names = {
  speakers: new Map([[7, 'Damien']]),
  characterName: 'Damien',
  personaName: 'Dom',
}

// Order comes from createdAt, then id: the rows arrive from Dexie in whatever order it likes.
const messages = [
  message({ id: 2, role: 'user', content: '"Speech" she said. *Woah!*', createdAt: 20 }),
  message({
    id: 1,
    role: 'assistant',
    content: 'picked',
    swipes: ['first', 'picked'],
    swipeIndex: 1,
    createdAt: 10,
    speakerId: 7,
  }),
]

const t = buildTranscript(chat, messages, names)
assert.deepEqual(
  t.turns.map((x) => `${x.name}:${x.content}`),
  ['Damien:picked', 'Dom:"Speech" she said. *Woah!*'],
)
// content tracks the swipe at swipeIndex (here index 1); that mirror is what we read.
assert.equal(t.turns[0].content, 'picked')

// A live card outranks the stamped name; a stamped name survives the card's deletion.
const stale = buildTranscript(
  chat,
  [message({ id: 1, role: 'assistant', content: 'x', speakerId: 99, speakerName: 'Ghost' })],
  names,
)
assert.equal(stale.turns[0].name, 'Ghost')
// No persona stamp and no active persona still credits someone.
const bare = buildTranscript(chat, [message({ id: 1, role: 'user', content: 'x' })], {
  speakers: new Map(),
  characterName: 'Damien',
})
assert.equal(bare.turns[0].name, 'User')

// TXT: title, then `Name: content` per turn.
assert.equal(
  buildTxt(t),
  'Rooftop & <b>rain</b>\n\nDamien: picked\n\nDom: "Speech" she said. *Woah!*\n',
)
// An empty title still names the file's contents.
assert.ok(buildTxt(buildTranscript({ ...chat, title: '  ' }, messages, names)).startsWith('Untitled Chat'))

// A `/break` row renders as the rule text alone.
assert.ok(
  buildTxt({ title: 'T', tagRules: [], turns: [
    { name: 'Dom', role: 'user', content: 'hi' },
    { name: 'Dom', role: 'user', content: '', divider: true },
  ] }).endsWith('Dom: hi\n\n___\n'),
)

// Jump-menu labels: markers gone, one line, truncated.
assert.equal(preview({ name: 'a', role: 'user', content: '*He\nsaid* "hi"' }), 'He said hi')
assert.equal(preview({ name: 'a', role: 'user', content: 'x'.repeat(80) }), 'x'.repeat(50) + '…')

// Tag rules: only the ones this chat's own text opens *and* closes travel with the transcript.
const think: TagRule = { id: 't', open: '<think>', close: '</think>', mode: 'collapse', label: 'Thoughts' }
const secret: TagRule = { id: 's', open: '[note]', close: '[/note]', mode: 'hide' }
const unused: TagRule = { id: 'u', open: '<plan>', close: '</plan>', mode: 'collapse' }
const tagged = [
  message({ id: 1, role: 'assistant', content: '<think>weighing it</think>Out loud.', createdAt: 10 }),
  message({ id: 2, role: 'user', content: '<plan>never closed', createdAt: 20 }),
]
assert.deepEqual(
  usedTagRules(buildTranscript(chat, tagged, names).turns, [think, secret, unused]).map((r) => r.id),
  ['t'],
)
// An empty open or close is not a rule, however it got into settings.
assert.deepEqual(usedTagRules([{ name: 'a', role: 'user', content: 'x' }], [{ ...think, close: '' }]), [])

const withTags = buildTranscript(chat, tagged, names, [think, secret, unused])
assert.deepEqual(withTags.tagRules.map((r) => r.id), ['t'])

const tagHtml = await buildHtml(withTags, resolvePalette())
// A collapse rule becomes the same <details class="taggedBlock"> the bubbles render.
assert.ok(tagHtml.includes('<details class="taggedBlock"><summary>Thoughts</summary>'))
assert.ok(tagHtml.includes('weighing it'))
assert.ok(tagHtml.includes('.taggedBlock > summary'))
// The label reads the prose. The block itself stays collapsed until the reader expands it.
assert.ok(tagHtml.includes('<option value="m1">1 · Damien: Out loud.</option>'))
// An unclosed opener stays literal text, exactly as renderText treats it.
assert.ok(tagHtml.includes('&lt;plan&gt;never closed'))
// Without the rules the block is plain text. The CSS and the <details> only appear when used.
const plain = await buildHtml(buildTranscript(chat, tagged, names), resolvePalette())
assert.ok(!plain.includes('taggedBlock'))
assert.ok(plain.includes('&lt;think&gt;weighing it&lt;/think&gt;'))

assert.equal(escapeHtml('<script>"&"</script>'), '&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;')

const html = await buildHtml(t, resolvePalette())
assert.ok(html.startsWith('<!doctype html>'))
// Title, speaker name and message body are all untrusted text opened in a browser.
assert.ok(html.includes('<title>Rooftop &amp; &lt;b&gt;rain&lt;/b&gt;</title>'))
assert.ok(!html.includes('<b>rain</b>'))
const hostile = await buildHtml(
  buildTranscript(
    chat,
    [message({ id: 1, role: 'assistant', content: '<script>alert(1)</script> & co', speakerName: '<b>X</b>', speakerId: 99 })],
    names,
  ),
  resolvePalette(),
)
assert.ok(!hostile.includes('<script>alert(1)</script>'))
assert.ok(hostile.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co'))
assert.ok(hostile.includes('<header>&lt;b&gt;X&lt;/b&gt;</header>'))

// One bubble per turn, roles stamped, ids lined up with the menu's option values.
assert.ok(html.includes('<article class="bubble" id="m1" data-role="assistant">'))
assert.ok(html.includes('<article class="bubble" id="m2" data-role="user">'))
assert.equal(html.match(/class="bubble"/g)?.length, 2)
assert.equal(html.match(/<option value="m\d+">/g)?.length, 2)
assert.ok(html.includes('<option value="m1">1 · Damien: picked</option>'))
// Markers render as the same elements the bubbles use.
assert.ok(html.includes('class="emphasisText"'))
assert.ok(html.includes('class="spokenText"'))
assert.ok(html.includes('max-width: 1280px'))
assert.ok(html.includes('@media (max-width: 700px)'))

console.log('checkExportChat ok')
