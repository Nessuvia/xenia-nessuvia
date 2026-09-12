// Plain .ts, not the spec's .tsx: node --experimental-strip-types can't load .tsx at all, and
// checkRenderText.ts has to import this. The output is <em>/<strong>/text: createElement reads
// fine without JSX.
import { createElement, Fragment } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { MarkerKind, ReplaceRule, TagRule } from '../../core/stores/settingsStore'

// Which color a marker's text takes when several overlap. Text is the implicit baseline below
// all three. `order` is top-first (strongest first); the highest-ranked kind present on a run
// of text wins its color regardless of how the markers nest. See renderInline.
const defaultOrder: MarkerKind[] = ['emphasis', 'bold', 'quotes']
const inheritStyle: CSSProperties = { color: 'inherit' }

const kindOf: Record<string, MarkerKind> = {
  boldText: 'bold',
  emphasisText: 'emphasis',
  spokenText: 'quotes',
}

// Higher = stronger. Not in the order (shouldn't happen) → 0; text baseline is -1, below all.
function rankOf(kind: MarkerKind, order: MarkerKind[]): number {
  const i = order.indexOf(kind)
  return i < 0 ? 0 : order.length - i
}

// Longest markers first so `**bold**` isn't eaten as nested `*italic*`, and `***` before both.
// A className here is a styling hook only: the colour itself is a CSS var, so the parser stays
// pure and checkRenderText keeps testing structure rather than settings.
// `wrap` names an extra tag rendered inside `tag`. `***x***` is <strong><em>x</em></strong>.
// `raw` markers don't recurse: the content is literal text, and they paint their own colors
// instead of joining the precedence negotiation below. Fences come before single backticks.
const markers = [
  { mark: '```', tag: 'pre', className: 'codeBlock', raw: true, keepMark: false },
  { mark: '`', tag: 'code', className: 'codeText', raw: true, keepMark: false },
  { mark: '***', tag: 'strong', wrap: 'em', className: 'boldText', keepMark: false },
  { mark: '___', tag: 'strong', wrap: 'em', className: 'boldText', keepMark: false },
  { mark: '**', tag: 'strong', className: 'boldText', keepMark: false },
  { mark: '__', tag: 'strong', className: 'boldText', keepMark: false },
  { mark: '*', tag: 'em', className: 'emphasisText', keepMark: false },
  { mark: '_', tag: 'em', className: 'emphasisText', keepMark: false },
  // straight quotes only. Curly “…” needs distinct open/close markers, which this
  // symmetric table can't express. Add a separate pair list if models start emitting them.
  { mark: '"', tag: 'span', className: 'spokenText', keepMark: true },
]

export interface RenderOpts {
  tagRules?: TagRule[]
  replaceRules?: ReplaceRule[]
  role?: 'user' | 'assistant'
  /** Color precedence, top-first. Omitted → module default. */
  order?: MarkerKind[]
}

/**
 * Display-only find/replace pass. Rules are skipped if disabled, off-target for this role, or an
 * invalid regex (the panel surfaces the syntax error; render stays quiet). Literal rules escape
 * `find` so nothing in it is treated as a pattern.
 */
export function applyReplaceRules(
  text: string,
  rules?: ReplaceRule[],
  role?: 'user' | 'assistant',
): string {
  if (!rules?.length) return text
  let out = text
  for (const rule of rules) {
    if (!rule.enabled || !rule.find) continue
    if (rule.target !== 'both' && role && rule.target !== role) continue
    const pattern = rule.regex ? rule.find : rule.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      // compiles per render; memoize if a long rule list lags.
      out = out.replace(new RegExp(pattern, rule.flags), rule.replace)
    } catch {
      // Invalid pattern or flags: skip, leaving the text untouched.
    }
  }
  return out
}

/**
 * Display-only pass over stored text. Returns React elements, never HTML, because model output
 * and imported cards are untrusted and this origin holds API keys. The input string is never
 * modified; newlines survive for `white-space: pre-wrap`.
 *
 * Two stages: tag rules split the text into blocks, then each block gets the inline marker scan.
 */
export function renderText(input: string, opts?: RenderOpts): ReactNode[] {
  let text = applyReplaceRules(input, opts?.replaceRules, opts?.role)
  const order = opts?.order ?? defaultOrder
  const rules = opts?.tagRules?.filter((r) => r.open && r.close)
  if (!rules?.length) return renderInline(text, order)

  const out: ReactNode[] = []
  // Text runs are wrapped so the keys renderInline hands out stay unique within `out`.
  const pushText = (slice: string) => {
    if (slice) out.push(createElement(Fragment, { key: out.length }, ...renderInline(slice, order)))
  }

  let i = 0
  let last = 0
  // A tag block sits on its own lines; the newlines that separated it from surrounding text pile
  // up as blank space once it collapses. Trim the newlines that directly touch a block so back-to-
  // back blocks don't stack vertical gaps. Display-only: the stored text is untouched.
  let trimLeadingNewline = false
  while (i < text.length) {
    const rule = rules.find((r) => text.startsWith(r.open, i))
    const close = rule ? text.indexOf(rule.close, i + rule.open.length) : -1
    // An unclosed opener is literal text, same as an unmatched `**`.
    if (rule && close >= 0) {
      let before = text.slice(last, i).replace(/\n+$/, '')
      if (trimLeadingNewline) before = before.replace(/^\n+/, '')
      pushText(before)
      trimLeadingNewline = true
      if (rule.mode === 'collapse') {
        const inner = renderInline(text.slice(i + rule.open.length, close), order)
        out.push(
          createElement(
            'details',
            { key: out.length, className: 'taggedBlock' },
            createElement('summary', { key: 'summary' }, rule.label || rule.open),
            ...inner,
          ),
        )
      }
      // 'hide' pushes nothing: the block just doesn't render.
      i = close + rule.close.length
      last = i
      continue
    }
    i += 1
  }
  let tail = text.slice(last)
  if (trimLeadingNewline) tail = tail.replace(/^\n+/, '')
  pushText(tail)
  return out
}

// `bestRank` is the strongest color rank an ancestor marker already claims. A marker only paints
// its own color when it outranks that; otherwise it defers with `color: inherit`, so the strongest
// kind on a run wins no matter the nesting order. Text baseline is -1, below every marker.
function renderInline(text: string, order: MarkerKind[], bestRank = -1): ReactNode[] {
  const out: ReactNode[] = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) out.push(buffer)
    buffer = ''
  }

  while (i < text.length) {
    const marker = markers.find((m) => text.startsWith(m.mark, i))
    const close = marker ? text.indexOf(marker.mark, i + marker.mark.length) : -1
    // An unmatched (or empty) marker is literal text rather than swallowing the rest.
    if (marker && close > i + marker.mark.length) {
      flush()
      if (marker.raw) {
        let content = text.slice(i + marker.mark.length, close)
        // A fence usually opens with a language tag on its own line; drop it, then the newlines
        // that hug the fence so <pre> doesn't render a blank first and last row.
        if (marker.tag === 'pre') content = content.replace(/^[^\s`]*\n/, '').replace(/^\n+|\n+$/g, '')
        out.push(
          createElement(
            marker.tag,
            { key: out.length, className: marker.className },
            marker.tag === 'pre' ? createElement('code', null, content) : content,
          ),
        )
        i = close + marker.mark.length
        continue
      }
      const rank = rankOf(kindOf[marker.className], order)
      const wins = rank > bestRank
      // `wrap` adds a nested emphasis <em>; the content sits inside both, so it competes against
      // whichever of the two ranks higher. if the winning kind's color var is unset the
      // run just inherits text color; skip unset ranks here if that ever surprises.
      const emRank = marker.wrap ? rankOf('emphasis', order) : rank
      const innerBest = Math.max(bestRank, rank, emRank)
      const inner = renderInline(text.slice(i + marker.mark.length, close), order, innerBest)
      // Children as variadic args, not a joined string: inner holds React elements (nested
      // markers), so concatenating would stringify them to "[object Object]". keepMark keeps the
      // literal marker visible around the content (the quote), otherwise just the inner nodes.
      const content = marker.keepMark ? [marker.mark, ...inner, marker.mark] : inner
      // `wrap` nests a second tag inside (bold italics): <strong><em>…</em></strong>.
      const children = marker.wrap
        ? [
            createElement(
              marker.wrap,
              {
                key: 'wrap',
                className: 'emphasisText',
                style: emRank > Math.max(bestRank, rank) ? undefined : inheritStyle,
              },
              ...content,
            ),
          ]
        : content
      out.push(
        createElement(
          marker.tag,
          {
            key: out.length,
            className: marker.className,
            style: wins ? undefined : inheritStyle,
          },
          ...children,
        ),
      )
      i = close + marker.mark.length
      continue
    }
    buffer += text[i]
    i += 1
  }

  flush()
  return out
}
