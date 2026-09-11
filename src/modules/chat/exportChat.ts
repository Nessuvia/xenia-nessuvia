// Chat export: JSON (the records as stored, shaped so an importer can remap them later), TXT (the
// prose only) and HTML (one standalone file painted from the active palette). The story side of
// this lives in ../write/exportStory.ts and the two are meant to read as one family.
//
// Extension-ful imports on purpose: checkExportChat.ts runs the builders under
// `node --experimental-strip-types`, which can't resolve extensionless app imports. The builders
// stay pure for that reason: only the three `export*` wrappers touch `document`.
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
  /** A `/break` row: no name, no body, just the rule. */
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
 * Who said it, the same resolution ChatView does: a user turn keeps the name recorded at send time
 * so a deleted persona still gets credited, and an assistant turn prefers the live card's display
 * name over the stamped one so a rename shows through.
 */
export function turnName(m: Message, names: Names): string {
  if (m.role === 'user') return m.personaName ?? names.personaName ?? 'User'
  const live = m.speakerId === undefined ? undefined : names.speakers.get(m.speakerId)
  return live ?? m.speakerName ?? names.characterName
}

/**
 * The tag rules this chat actually uses. A rule counts as used when some turn opens and closes it:
 * the same matched-pair test renderText applies, so an unclosed opener is literal text here too and
 * doesn't drag a rule into the export. The user's whole rule list is a global setting; a transcript
 * should only carry the ones its own text triggers.
 */
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
 * A message body as HTML. renderText is the parser the bubbles use, so the export shows the same
 * emphasis, quotes and code the screen does; rendering its elements to a string beats keeping a
 * second copy of that marker table here. React escapes text nodes, which is what keeps untrusted
 * model output safe in a file that gets opened in a browser.
 *
 * Tag rules are passed so a `<think>` block looks like the same collapsed `<details>` it does on
 * screen. No replaceRules or hammer options: those rewrite what was said, and a transcript
 * shouldn't.
 *
 * react-dom/server is imported here rather than at the top of the file because it is 57 KB gzipped
 * and nothing else in the app needs it. A static import puts it in the vendor chunk every visitor
 * downloads, a dynamic one gives it a chunk of its own that only an HTML export fetches.
 */
export async function messageHtml(turn: TranscriptTurn, tagRules?: TagRule[]): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server')
  return renderToStaticMarkup(
    createElement(Fragment, null, ...renderText(turn.content, { role: turn.role, tagRules })),
  )
}

/** Drop each rule's open…close span, so a label doesn't quote text the reader has to expand. */
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

/** Option label for the jump menu: no tag blocks, no markers, no newlines, one line's worth. */
export function preview(turn: TranscriptTurn, tagRules: TagRule[] = [], max = 50): string {
  const flat = withoutTagBlocks(turn.content, tagRules)
    .replace(/[*_`"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

/** Async only because messageHtml loads the renderer on demand; everything else here is pure. */
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

  // Same Fontsource stylesheet useApplyWebfont injects at runtime. The `sans-serif` fallback baked
  // into effectiveFont covers a reader who opens the file offline.
  const fontLink =
    palette.useWebfont && palette.webfontId
      ? `<link rel="stylesheet" href="https://cdn.jsdelivr.net/fontsource/css/${escapeHtml(palette.webfontId)}@latest/index.css">`
      : ''

  const title = escapeHtml(t.title)

  // Only carried when a rule fired: a chat with no tagged blocks shouldn't ship rules for them.
  // Same look as chat.css: <details> holds the open/closed state, so no script is involved.
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

  // Dividers are not bubbles, so they take no number and no menu entry: the jump menu's indices
  // have to line up with the `.bubble` elements the script collects. Hence the separate counter.
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
    // One numbered link per message would run to hundreds of entries, so the bar is a jump menu.
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
// Same scrollspy as the story export: the last bubble whose top has passed under the bar wins,
// driving a menu instead of a row of links, and the arrows step through the same list.
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
