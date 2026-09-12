// Inline markers for Story prose. Chat has its own pass (chat/renderText.ts) that builds React
// elements; this one can't reuse it. The Story editor is an uncontrolled contenteditable. The
// decoration has to be real DOM that React never owns, and the markers themselves have to survive
// in the DOM text. The editor reads its value back with textContent, and a marker dropped for
// display would be a marker deleted from the Chapter.
//
// Every marker stays a text node. It is only hidden with CSS. Invariant the whole thing rests
// on: decorate(el, text) leaves el.textContent === text, character for character.
import type { MarkerKind } from '../../core/stores/settingsStore'

export type ProsePiece =
  | { text: string }
  | { mark: string; kind: MarkKind; children: ProsePiece[] }

export type MarkKind = 'bold' | 'em' | 'boldEm' | 'quote' | 'code'

// Longest first: `**bold**` is not eaten as a nested `*italic*`, and `***` comes before both.
const markers: { mark: string; kind: MarkKind }[] = [
  // Grave accents first: what they wrap is literal. Nothing inside them is markup.
  { mark: '`', kind: 'code' },
  { mark: '***', kind: 'boldEm' },
  { mark: '___', kind: 'boldEm' },
  { mark: '**', kind: 'bold' },
  { mark: '__', kind: 'bold' },
  { mark: '*', kind: 'em' },
  { mark: '_', kind: 'em' },
  // Straight quotes only, same as chat's table. Curly “…” needs distinct open/close markers, which
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
 * rest of the Chapter. Half-typed markup is the normal state of a document being written.
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
        // Grave-wrapped text is literal: an asterisk in there is an asterisk.
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

/** Concatenate a parsed tree back to its source, markers included. The check script asserts this
 *  round-trips for every input; it's the property the editor's read-back depends on. */
export function pieceText(pieces: ProsePiece[]): string {
  return pieces
    .map((p) => ('text' in p ? p.text : p.mark + pieceText(p.children) + p.mark))
    .join('')
}

/**
 * Replace el's children with the decorated form of `text`. Built with createElement/createTextNode
 * (never innerHTML) because Chapter prose can come from the model and this origin holds API keys.
 * Markers become their own spans so CSS alone can show or hide them.
 */
export function decorateProse(el: HTMLElement, text: string, order: MarkerKind[] = []): void {
  el.textContent = ''
  el.appendChild(buildPieces(parseProse(text), el.ownerDocument, order, -1))
}

/**
 * `bestRank` is the strongest color rank an ancestor already claims. A span stamps `data-win` with
 * the kind it colors for only when it outranks that; a loser stamps nothing and inherits the
 * winner's color through the cascade. The color values themselves are CSS vars. Changing one is
 * a repaint; only reordering needs the DOM rebuilt.
 */
function buildPieces(
  pieces: ProsePiece[],
  doc: Document,
  order: MarkerKind[],
  bestRank: number,
): DocumentFragment {
  const frag = doc.createDocumentFragment()
  for (const piece of pieces) {
    if ('text' in piece) {
      frag.appendChild(doc.createTextNode(piece.text))
      continue
    }
    const span = doc.createElement('span')
    span.className = classOf[piece.kind]
    const claims = kindColors[piece.kind]
    const winner = claims.length
      ? claims.reduce((a, b) => (rankOf(b, order) > rankOf(a, order) ? b : a))
      : null
    const rank = winner ? rankOf(winner, order) : -1
    if (winner && rank > bestRank) span.dataset.win = winner
    // The quote's own marks are part of the dialogue. They stay visible. The others are hidden
    // by CSS: they exist to keep the Chapter from losing a character.
    const markClass = piece.kind === 'quote' ? 'proseQuoteMark' : 'proseMark'
    span.appendChild(markSpan(piece.mark, doc, markClass))
    span.appendChild(buildPieces(piece.children, doc, order, Math.max(bestRank, rank)))
    span.appendChild(markSpan(piece.mark, doc, markClass))
    frag.appendChild(span)
  }
  return frag
}

function markSpan(mark: string, doc: Document, className: string): HTMLElement {
  const span = doc.createElement('span')
  span.className = className
  span.textContent = mark
  return span
}

const blockTags = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

/**
 * One walk serving both the text read-back and the caret offset. They have to agree character for
 * character: a caret counted against a slightly different string drifts. They share a walker
 * rather than two implementations of the same newline rules.
 *
 * The rules exist for one reason: a contenteditable is not a textarea. Pressing Enter makes the
 * browser insert a <br> or wrap lines in <div>s, and textContent renders both as nothing. The
 * newline would vanish the next time the DOM was rebuilt from this string.
 *
 * Passing a `caret` range stops the count at that point; `at` is null if the range was never
 * reached.
 */
function walkProse(
  el: HTMLElement,
  caret?: Range,
): { text: string; at: number | null } {
  let text = ''
  let at: number | null = null

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes)
    for (let i = 0; i < children.length; i++) {
      if (at !== null) return
      // Caret expressed as (element, childIndex): everything before that index is counted.
      if (caret && node === caret.endContainer && i === caret.endOffset) {
        at = text.length
        return
      }
      const child = children[i]
      if (child.nodeType === 3) {
        const data = (child as Text).data
        if (caret && child === caret.endContainer) {
          at = text.length + Math.min(caret.endOffset, data.length)
          return
        }
        text += data
        continue
      }
      if (child.nodeType !== 1) continue
      const tag = (child as HTMLElement).tagName
      if (tag === 'BR') {
        text += '\n'
        continue
      }
      // A block opens a new line unless we're already at the start of one.
      if (blockTags.has(tag) && text && !text.endsWith('\n')) text += '\n'
      walk(child)
    }
    // Caret sitting past the last child of this element.
    if (at === null && caret && node === caret.endContainer && caret.endOffset >= children.length) {
      at = text.length
    }
  }

  walk(el)
  return { text, at }
}

/** Read the editor's prose back out, with contenteditable's line breaks turned back into "\n". */
export function readProse(el: HTMLElement): string {
  return walkProse(el).text
}

/**
 * Caret position as a character offset into readProse(el). It survives the DOM being rebuilt.
 * Returns null when the caret isn't in this element (the Author clicked away mid-debounce).
 */
export function saveCaret(el: HTMLElement): number | null {
  const sel = el.ownerDocument.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.endContainer)) return null
  return walkProse(el, range).at
}

/** Put the caret back at a character offset, walking text nodes until the offset is consumed. */
export function restoreCaret(el: HTMLElement, offset: number): void {
  const doc = el.ownerDocument
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let seen = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length
    if (seen + len >= offset) {
      const range = doc.createRange()
      range.setStart(node, offset - seen)
      range.collapse(true)
      const sel = doc.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      return
    }
    seen += len
    node = walker.nextNode() as Text | null
  }
  // Offset past the end (text shrank under us): park at the end.
  const range = doc.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = doc.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}
