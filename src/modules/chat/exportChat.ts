// Chat export: JSON (the records as stored; an importer can remap them later), TXT (prose only),
// and HTML (one standalone file painted from the active palette). The story equivalent lives in
// ../write/exportStory.ts. The two read as one family.
//
// Imports use file extensions. checkExportChat.ts runs the builders under
// `node --experimental-strip-types`, which does not resolve extensionless app imports. The builders
// stay pure. Only the three `export*` wrappers touch `document`.
import { createElement, Fragment } from 'react'
import type { Chat, Message } from '../../core/storage/types.ts'
import type { TagRule } from '../../core/stores/settingsStore'
import type { Palette } from '../../core/palette/palette.ts'
import { effectiveFont, paletteVars } from '../../core/palette/palette.ts'
import { readAloudBar, readAloudCss, readAloudScript } from '../../core/readAloud/readAloud.ts'
import { renderText } from './renderText.ts'

const fileName = (name: string) =>
  name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'chat'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** Same order the chat view reads in: chatStore's `byTime`. */
const byTime = (a: Message, b: Message) => a.createdAt - b.createdAt || (a.id ?? 0) - (b.id ?? 0)

export interface TranscriptTurn {
  name: string
  role: 'user' | 'assistant'
  /** The selected swipe. `Message.content` already mirrors it, see core/stores/swipes.ts. */
  content: string
  /** A `/break` row: the rule only. */
  divider?: boolean
}

export interface Transcript {
  title: string
  turns: TranscriptTurn[]
  /** Only the rules this chat's text actually opens and closes, see usedTagRules. */
  tagRules: TagRule[]
}

/** How a turn is credited. The maps are what the chat view already has on hand. */
export interface Names {
  /** Live card names by id, `displayName(c)` applied. */
  speakers: Map<number, string>
  /** The chat's own character, for assistant turns with no stamped speaker. */
  characterName: string
  /** The active persona, for user turns sent before the name was stamped. */
  personaName?: string
}

/**
 * Who said it, the same resolution ChatView uses. A user turn keeps the name recorded at send
 * time; a deleted persona keeps its credit. An assistant turn takes the live card's display name
 * over the stamped one; a rename shows through.
 */
export function turnName(m: Message, names: Names): string {
  if (m.role === 'user') return m.personaName ?? names.personaName ?? 'User'
  const live = m.speakerId === undefined ? undefined : names.speakers.get(m.speakerId)
  return live ?? m.speakerName ?? names.characterName
}

/** The tag rules this chat's text actually uses. A rule counts as used when some turn opens and
 *  closes it. */
export function usedTagRules(turns: TranscriptTurn[], rules?: TagRule[]): TagRule[] {
  return (rules ?? []).filter((r) => {
    if (!r.open || !r.close) return false
    return turns.some((turn) => {
      const at = turn.content.indexOf(r.open)
      return at >= 0 && turn.content.indexOf(r.close, at + r.open.length) >= 0
    })
  })
}

export function buildTranscript(
  chat: Chat,
  messages: Message[],
  names: Names,
  tagRules?: TagRule[],
): Transcript {
  const turns = [...messages].sort(byTime).map((m) => ({
    name: turnName(m, names),
    role: m.role,
    content: m.content,
    ...(m.divider ? { divider: true as const } : {}),
  }))
  return { title: chat.title.trim() || 'Untitled Chat', turns, tagRules: usedTagRules(turns, tagRules) }
}

export function buildTxt(t: Transcript): string {
  const body = t.turns
    .map((turn) => (turn.divider ? '___' : `${turn.name}: ${turn.content.trim()}`))
    .join('\n\n')
  return `${t.title}\n\n${body}\n`
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A message body as HTML. Renders through the same renderText markers the bubbles use: emphasis,
 * quotes and code match the screen. React escapes text nodes.
 *
 * Tag rules render a `<think>` block as the same collapsed `<details>` used on screen. No
 * replaceRules or hammer options apply.
 *
 * react-dom/server is imported dynamically here: it is 57 KB gzipped, and only an HTML export
 * needs it. A static import would put it in the vendor chunk every visitor downloads.
 */
export async function messageHtml(turn: TranscriptTurn, tagRules?: TagRule[]): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server')
  return renderToStaticMarkup(
    createElement(Fragment, null, ...renderText(turn.content, { role: turn.role, tagRules })),
  )
}

/** Drops each rule's open…close span from the text. Used for labels. */
function withoutTagBlocks(text: string, rules: TagRule[]): string {
  let out = text
  for (const r of rules) {
    for (;;) {
      const at = out.indexOf(r.open)
      if (at < 0) break
      const close = out.indexOf(r.close, at + r.open.length)
      if (close < 0) break
      out = out.slice(0, at) + out.slice(close + r.close.length)
    }
  }
  return out
}

/** Option label for the jump menu: flattened to one line, tag blocks and markers stripped. */
export function preview(turn: TranscriptTurn, tagRules: TagRule[] = [], max = 50): string {
  const flat = withoutTagBlocks(turn.content, tagRules)
    .replace(/[*_`"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

/** Async: messageHtml loads the renderer on demand. Everything else here is pure. */
export async function buildHtml(t: Transcript, palette: Palette): Promise<string> {
  const vars = {
    ...paletteVars(palette),
    '--msgTextColor': palette.textColor || 'var(--text)',
    '--msgEmphasisColor': palette.emphasisColor || 'inherit',
    '--msgBoldColor': palette.boldColor || 'inherit',
    '--msgQuoteColor': palette.quoteColor || 'inherit',
  }
  const rootVars = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')

  // Same Fontsource stylesheet useApplyWebfont injects at runtime.
  const fontLink =
    palette.useWebfont && palette.webfontId
      ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/fontsource/css/${escapeHtml(palette.webfontId)}@latest/index.css">`
      : ''

  const title = escapeHtml(t.title)

  // Carried only when a rule fired. Same look as chat.css: <details> holds the open/closed state.
  const tagCss = t.tagRules.some((r) => r.mode === 'collapse')
    ? `.taggedBlock {
  margin: 6px 0;
  padding: 6px 10px;
  border-left: 2px solid var(--border);
  color: var(--textMuted);
  font-size: 0.92em;
}
.taggedBlock > summary {
  cursor: pointer;
  color: var(--textMuted);
  font-size: 0.9em;
  letter-spacing: 0.04em;
}`
    : ''

  const bodies = await Promise.all(
    t.turns.map((turn) => (turn.divider ? Promise.resolve('') : messageHtml(turn, t.tagRules))),
  )

  // Dividers are not bubbles. The counter increments only for bubbles; jump-menu indices line up
  // with the `.bubble` elements the script collects.
  const body: string[] = []
  const options: string[] = []
  let n = 0
  t.turns.forEach((turn, i) => {
    if (turn.divider) {
      body.push('<hr class="chatBreak">')
      return
    }
    n++
    body.push(
      `<article class="bubble" id="m${n}" data-role="${turn.role}">` +
        `<header>${escapeHtml(turn.name)}</header>` +
        `<div class="body">${bodies[i]}</div>` +
        `</article>`,
    )
    options.push(
      `<option value="m${n}">${escapeHtml(`${n} · ${turn.name}: ${preview(turn, t.tagRules)}`)}</option>`,
    )
  })

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${fontLink}
<style>
:root {
${rootVars}
  color-scheme: var(--colorScheme, dark);
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  max-width: 1280px;
  padding: 2rem 1.25rem 4rem;
  background: var(--bg);
  color: var(--msgTextColor);
  font-family: ${effectiveFont(palette) || 'system-ui, sans-serif'};
  font-size: ${palette.fontSize}px;
  line-height: ${palette.lineHeight};
}
h1 { font-size: 1.9em; margin: 0 0 2rem; color: var(--textBright, inherit); }
nav {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 -1.25rem;
  padding: 0.4rem 1.25rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  font-size: 0.85em;
}
nav button {
  padding: 0.15em 0.6em;
  background: var(--panel, transparent);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--textSoft, inherit);
  font: inherit;
  cursor: pointer;
}
nav button:hover { color: var(--accent); }
nav select {
  flex: 1;
  min-width: 0;
  padding: 0.15em 0.4em;
  background: var(--panel, transparent);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--textSoft, inherit);
  font: inherit;
}
nav .at { color: var(--textMuted, inherit); white-space: nowrap; }
.bubble {
  scroll-margin-top: 3.5rem;
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
}
.bubble[data-role='user'] { background: var(--panel, var(--surface)); }
.bubble header {
  margin-bottom: 0.35rem;
  color: var(--textSoft, inherit);
  font-size: 0.85em;
  font-weight: 600;
}
.bubble .body { white-space: pre-wrap; }
.chatBreak { margin: 1rem 0; border: 0; border-top: 1px solid var(--border); }
.boldText { color: var(--msgBoldColor); font-weight: 700; }
.emphasisText { color: var(--msgEmphasisColor); font-style: italic; }
.spokenText { color: var(--msgQuoteColor); }
.codeText, .codeBlock { font-family: ui-monospace, monospace; font-size: 0.92em; color: var(--accent); }
.codeBlock { margin: 0.6em 0; padding: 0.6em 0.8em; background: var(--bg); border-radius: var(--radius); overflow-x: auto; }
${tagCss}
${readAloudCss}
@media (max-width: 700px) {
  body { padding: 1rem 1rem 3rem; }
  nav { margin: 0 -1rem; padding: 0.4rem 1rem; }
}
</style>
</head>
<body>
<nav>
<button id="prev" type="button" aria-label="Previous message">◀</button>
<select id="jump" aria-label="Jump to message">${options.join('')}</select>
<button id="next" type="button" aria-label="Next message">▶</button>
<span class="at" id="at"></span>
</nav>
<h1>${title}</h1>
${readAloudBar}
${body.join('\n')}
<script>
${readAloudScript(`nav, .readAloud, .codeBlock${tagCss ? ', .taggedBlock' : ''}`)}
</script>
<script>
// Same scrollspy as the story export. The last bubble whose top has passed under the bar wins.
// The arrows step through the same list.
(function () {
  var jump = document.getElementById('jump')
  var at = document.getElementById('at')
  var bubbles = [].slice.call(document.querySelectorAll('.bubble'))
  var current = 0
  function mark() {
    var i = 0
    bubbles.forEach(function (b, n) { if (b.getBoundingClientRect().top <= 70) i = n })
    current = i
    jump.selectedIndex = i
    at.textContent = (i + 1) + ' / ' + bubbles.length
  }
  function go(i) {
    current = Math.max(0, Math.min(bubbles.length - 1, i))
    bubbles[current].scrollIntoView()
  }
  jump.addEventListener('change', function () { go(jump.selectedIndex) })
  document.getElementById('prev').addEventListener('click', function () { go(current - 1) })
  document.getElementById('next').addEventListener('click', function () { go(current + 1) })
  addEventListener('scroll', mark, { passive: true })
  mark()
})()
</script>
</body>
</html>
`
}

/**
 * The records as stored. Tagged and versioned because reading this back is a migration, not a
 * parse: an importer has to drop the autoincrement ids and remap `chatId` onto the new chat.
 */
export function buildJson(chat: Chat, messages: Message[]): string {
  // Lorebook ids are row ids in this browser's database and name nothing on another device, so
  // they are dropped rather than exported as numbers that would resolve to someone else's books.
  const { lorebookIds: _lorebookIds, ...rest } = chat
  return JSON.stringify(
    {
      format: 'xeniaNessuvia.chat',
      version: 1,
      exportedAt: new Date().toISOString(),
      chat: rest,
      messages: [...messages].sort(byTime),
    },
    null,
    2,
  )
}

export function exportChatJson(chat: Chat, messages: Message[]) {
  download(new Blob([buildJson(chat, messages)], { type: 'application/json' }), `${fileName(chat.title)}.json`)
}

export function exportChatTxt(t: Transcript) {
  download(new Blob([buildTxt(t)], { type: 'text/plain' }), `${fileName(t.title)}.txt`)
}

export async function exportChatHtml(t: Transcript, palette: Palette) {
  const html = await buildHtml(t, palette)
  download(new Blob([html], { type: 'text/html' }), `${fileName(t.title)}.html`)
}
