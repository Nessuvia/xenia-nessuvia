// Story export: JSON (the records as stored), TXT (prose only) and HTML (one standalone file
// painted from the active palette).
//
// Extension-ful imports on purpose: checkExportStory.ts runs the builders under
// `node --experimental-strip-types`, which can't resolve extensionless app imports. The builders
// stay pure for that reason: only the three `export*` wrappers touch `document`.
import type { Chapter, Story } from '../../core/storage/types.ts'
import type { Palette } from '../../core/palette/palette.ts'
import { effectiveFont, paletteVars } from '../../core/palette/palette.ts'
import { chapterProse } from '../../core/prompt/chapterGuide.ts'
import { readAloudBar, readAloudCss, readAloudScript } from '../../core/readAloud/readAloud.ts'
import { parseProse, type ProsePiece } from './proseMarkup.ts'

const fileName = (name: string) =>
  name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'story'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

const inOrder = (chapters: Chapter[]): Chapter[] => [...chapters].sort((a, b) => a.order - b.order)

/** The chapter break, both formats use it: blank line, `1 - Title`, blank line. */
const breakLine = (index: number, title: string) =>
  `${index + 1}${title.trim() ? ` - ${title.trim()}` : ''}`

export function buildTxt(story: Story, chapters: Chapter[]): string {
  const body = inOrder(chapters)
    .map((c, i) => `\n\n${breakLine(i, c.title)}\n\n${chapterProse(c)}`)
    .join('')
  return `${story.title.trim() || 'Untitled Story'}${body}\n`
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const tagOf: Record<string, [string, string]> = {
  bold: ['<strong>', '</strong>'],
  em: ['<em>', '</em>'],
  boldEm: ['<strong><em>', '</em></strong>'],
  quote: ['<q>', '</q>'],
  code: ['<code>', '</code>'],
}

/**
 * Prose to inline HTML. Real elements, not the editor's marker spans: the round-trip invariant
 * proseMarkup rests on exists for the contenteditable, and a static page has nothing to read back.
 *
 * nesting color goes to the innermost element rather than the palette's
 * `storyColorOrder` ranking. If a bold-inside-quotes run needs to paint quote-colored the way the
 * editor does, port `rankOf` and stamp `data-win` here.
 */
export function proseHtml(text: string): string {
  const render = (pieces: ProsePiece[]): string =>
    pieces
      .map((p) => {
        if ('text' in p) return escapeHtml(p.text)
        const [open, close] = tagOf[p.kind]
        // Backtick contents are literal. They never recurse; parseProse already saw to that.
        return `${open}${render(p.children)}${close}`
      })
      .join('')
  return render(parseProse(text))
}

export function buildHtml(story: Story, chapters: Chapter[], palette: Palette): string {
  const vars = {
    ...paletteVars(palette),
    '--storyTextColor': palette.storyTextColor || 'var(--text)',
    '--storyEmphasisColor': palette.storyEmphasisColor || 'inherit',
    '--storyBoldColor': palette.storyBoldColor || 'inherit',
    '--storyQuoteColor': palette.storyQuoteColor || 'inherit',
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

  const title = escapeHtml(story.title.trim() || 'Untitled Story')

  const ordered = inOrder(chapters)

  const body = ordered
    .map((c, i) => {
      const paras = c.blocks
        .map((b) => b.content.trim())
        .filter(Boolean)
        .map((t) => `<p>${proseHtml(t)}</p>`)
        .join('\n')
      return `<h2 id="ch${i + 1}">${escapeHtml(breakLine(i, c.title))}</h2>\n${paras}`
    })
    .join('\n')

  // Anchor links, no script: `scroll-margin-top` on the headings keeps the sticky bar off them.
  const nav = ordered
    .map(
      (c, i) =>
        `<a href="#ch${i + 1}"${c.title.trim() ? ` title="${escapeHtml(c.title.trim())}"` : ''}>${i + 1}</a>`,
    )
    .join('')

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
  color: var(--storyTextColor);
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
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.25rem;
  margin: 0 -1.25rem;
  padding: 0.4rem 1.25rem;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
nav a {
  padding: 0.15em 0.5em;
  border-radius: 4px;
  color: var(--textSoft, inherit);
  font-size: 0.85em;
  text-decoration: none;
}
nav a:hover { color: var(--accent); background: var(--panel, transparent); }
nav a.active { color: var(--accent); background: var(--panel, transparent); font-weight: 600; }
h2 {
  scroll-margin-top: 3rem;
  font-size: 1.15em;
  font-weight: 600;
  margin: 3rem 0 1.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border);
  color: var(--textSoft, inherit);
}
p { margin: 0 0 1.1em; white-space: pre-wrap; }
strong { color: var(--storyBoldColor); }
em { color: var(--storyEmphasisColor); }
q { quotes: '"' '"'; color: var(--storyQuoteColor); }
code { font-family: ui-monospace, monospace; font-size: 0.92em; color: var(--accent); }
${readAloudCss}
@media (max-width: 700px) {
  body { padding: 1rem 1rem 3rem; }
  nav { margin: 0 -1rem; padding: 0.4rem 1rem; }
  h2 { margin: 2rem 0 1rem; }
}
</style>
</head>
<body>
<nav>${nav}</nav>
<h1>${title}</h1>
${readAloudBar}
${body}
<script>
${readAloudScript('nav, .readAloud')}
</script>
<script>
// Scrollspy: the last heading whose top has passed under the bar wins.
// recomputed on every scroll event, cheap at this document size.
(function () {
  var links = [].slice.call(document.querySelectorAll('nav a'))
  var heads = links.map(function (a) { return document.querySelector(a.getAttribute('href')) })
  function mark() {
    var at = 0
    heads.forEach(function (h, i) { if (h.getBoundingClientRect().top <= 60) at = i })
    links.forEach(function (a, i) { a.classList.toggle('active', i === at) })
  }
  addEventListener('scroll', mark, { passive: true })
  mark()
})()
</script>
</body>
</html>
`
}

export function exportStoryJson(story: Story, chapters: Chapter[]) {
  download(
    new Blob([JSON.stringify({ story, chapters: inOrder(chapters) }, null, 2)], {
      type: 'application/json',
    }),
    `${fileName(story.title)}.json`,
  )
}

export function exportStoryTxt(story: Story, chapters: Chapter[]) {
  download(
    new Blob([buildTxt(story, chapters)], { type: 'text/plain' }),
    `${fileName(story.title)}.txt`,
  )
}

export function exportStoryHtml(story: Story, chapters: Chapter[], palette: Palette) {
  download(
    new Blob([buildHtml(story, chapters, palette)], { type: 'text/html' }),
    `${fileName(story.title)}.html`,
  )
}
