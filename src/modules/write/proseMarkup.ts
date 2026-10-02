// Inline markers for Story prose. Chat has its own pass (chat/renderText.ts) that builds React
// elements. This one feeds the document editor's decorations and the HTML export. Neither changes
// the text: the editor styles ranges in place and the markers stay in the document.
import type { MarkerKind } from '../../core/stores/settingsStore'

export type ProsePiece =
  | { text: string }
  | { mark: string; kind: MarkKind; children: ProsePiece[] }

export type MarkKind = 'bold' | 'em' | 'boldEm' | 'quote' | 'code'

// Longest first: `**bold**` isn't eaten as a nested `*italic*`, and `***` comes before both.
const markers: { mark: string; kind: MarkKind }[] = [
  // Grave accents first: what they wrap is literal. Nothing inside them is markup.
  { mark: '`', kind: 'code' },
  { mark: '***', kind: 'boldEm' },
  { mark: '___', kind: 'boldEm' },
  { mark: '**', kind: 'bold' },
  { mark: '__', kind: 'bold' },
  { mark: '*', kind: 'em' },
  { mark: '_', kind: 'em' },
  // Straight quotes only, same as chat's table. Curly "..." needs distinct open/close markers, which
  // this symmetric list can't express. Add a separate pair list if models start emitting them.
  { mark: '"', kind: 'quote' },
]

const classOf: Record<MarkKind, string> = {
  bold: 'proseBold',
  em: 'proseEm',
  boldEm: 'proseBold proseEm',
  quote: 'proseQuote',
  code: 'proseCode',
}

// Which color kinds a span competes for. `boldEm` is both. It takes whichever ranks higher.
// Code has no entry in the Story color order. It never claims one and never blocks a nested run
// from claiming: it has a color of its own in write.css.
const kindColors: Record<MarkKind, MarkerKind[]> = {
  bold: ['bold'],
  em: ['emphasis'],
  boldEm: ['bold', 'emphasis'],
  quote: ['quotes'],
  code: [],
}

// Higher = stronger. Text is the implicit baseline at -1, below every marker. Same rule chat's
// renderInline uses: the strongest kind on a run of text wins its color however the markers nest.
function rankOf(kind: MarkerKind, order: MarkerKind[]): number {
  const i = order.indexOf(kind)
  return i < 0 ? 0 : order.length - i
}

/**
 * Split raw prose into a tree of text runs and marked spans. An unmatched or empty marker
 * (`*` with no partner, `**` immediately closed) stays literal text rather than swallowing the
 * rest of the document. Half-typed markup is the normal state of a document being written.
 */
export function parseProse(text: string): ProsePiece[] {
  const out: ProsePiece[] = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) out.push({ text: buffer })
    buffer = ''
  }

  while (i < text.length) {
    const marker = markers.find((m) => text.startsWith(m.mark, i))
    const close = marker ? text.indexOf(marker.mark, i + marker.mark.length) : -1
    if (marker && close > i + marker.mark.length) {
      flush()
      const inner = text.slice(i + marker.mark.length, close)
      out.push({
        mark: marker.mark,
        kind: marker.kind,
        // Grave-wrapped text is literal: an asterisk in there's an asterisk.
        children: marker.kind === 'code' ? [{ text: inner }] : parseProse(inner),
      })
      i = close + marker.mark.length
      continue
    }
    buffer += text[i]
    i += 1
  }

  flush()
  return out
}

/** Concatenate a parsed tree back to its source, markers included. */
export function pieceText(pieces: ProsePiece[]): string {
  return pieces
    .map((p) => ('text' in p ? p.text : p.mark + pieceText(p.children) + p.mark))
    .join('')
}

/**
 * Wrap a selection in a marker, or unwrap it when the marker already sits on both sides of it
 * (inside the selection or just outside it). Returns the edit and the selection to keep on the
 * text, or null for an empty selection.
 */
export function wrapEdit(
  doc: string,
  from: number,
  to: number,
  mark: string,
): { changes: { from: number; to: number; insert: string }[]; anchor: number; head: number } | null {
  if (from === to) return null
  const n = mark.length
  const inner = doc.slice(from, to)
  if (inner.length >= 2 * n && inner.startsWith(mark) && inner.endsWith(mark))
    return {
      changes: [
        { from, to: from + n, insert: '' },
        { from: to - n, to, insert: '' },
      ],
      anchor: from,
      head: to - 2 * n,
    }
  if (doc.slice(from - n, from) === mark && doc.slice(to, to + n) === mark)
    return {
      changes: [
        { from: from - n, to: from, insert: '' },
        { from: to, to: to + n, insert: '' },
      ],
      anchor: from - n,
      head: to - n,
    }
  return {
    changes: [
      { from, to: from, insert: mark },
      { from: to, to, insert: mark },
    ],
    anchor: from + n,
    head: to + n,
  }
}

/** A line starting `# ` is a chapter heading. Only one `#`: `##` is left as typed. */
export const isHeading = (line: string) => /^# \S/.test(line)

/** The document's chapter headings, with where each line starts. */
export function chapterHeadings(text: string): { title: string; offset: number }[] {
  const out: { title: string; offset: number }[] = []
  let offset = 0
  for (const line of text.split('\n')) {
    if (isHeading(line)) out.push({ title: line.slice(2).trim(), offset })
    offset += line.length + 1
  }
  return out
}

/** One styled range in a line, as offsets into it. `win` is the color kind the range paints in. */
export interface ProseMark {
  from: number
  to: number
  className: string
  win?: MarkerKind
}

/**
 * The ranges to style in one line, outermost first: each marked span, plus its two markers. A
 * span stamps `win` only when it outranks every ancestor; a loser inherits the winner's color
 * through the cascade.
 */
export function proseMarks(line: string, order: MarkerKind[] = []): ProseMark[] {
  const out: ProseMark[] = []
  const walk = (pieces: ProsePiece[], at: number, bestRank: number) => {
    for (const piece of pieces) {
      if ('text' in piece) {
        at += piece.text.length
        continue
      }
      const claims = kindColors[piece.kind]
      const winner = claims.length ? claims.reduce((a, b) => (rankOf(b, order) > rankOf(a, order) ? b : a)) : null
      const rank = winner ? rankOf(winner, order) : -1
      const length = pieceText([piece]).length
      out.push({ from: at, to: at + length, className: classOf[piece.kind], ...(winner && rank > bestRank ? { win: winner } : {}) })
      // A quote's own marks are part of the dialogue and stay visible. The others are dimmed.
      const markClass = piece.kind === 'quote' ? 'proseQuoteMark' : 'proseMark'
      const m = piece.mark.length
      out.push({ from: at, to: at + m, className: markClass })
      walk(piece.children, at + m, Math.max(bestRank, rank))
      out.push({ from: at + length - m, to: at + length, className: markClass })
      at += length
    }
  }
  walk(parseProse(line), 0, -1)
  return out
}
