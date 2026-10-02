// The Story document: one CodeMirror view over the whole text, set up to read as a page of prose
// rather than code. No gutter, no active line, native selection, soft wrap. The stored text is
// exactly what was typed.
//
// Two views. Pretty (the default) styles markdown with its markers hidden and shows the picked
// rule sets' Find & Replace rules. Raw shows every character as stored, markers dimmed.
//
// The store streams a generation as text. This file splices it into the document over the range
// the last generation covers, so the store never needs to know about the editor.
import { useEffect, useRef } from 'react'
import {
  Annotation,
  Compartment,
  EditorState,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type Range,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import type { StoryAction } from '../../core/prompt/buildStoryPrompt'
import type { MarkerKind, ReplaceRule } from '../../core/stores/settingsStore'
import { useWrite } from '../../core/stores/writeStore'
import { usePalette } from '../../core/stores/palettesStore'
import { effectiveFont } from '../../core/palette/palette'
import { hotkeysOn } from '../../app/hotkeys'
import { isHeading, proseMarks, wrapEdit } from './proseMarkup'
import { findAll, ruleMatches } from './findReplace'

// Marks a change as the model's, so it doesn't count as the Author typing.
const generated = Annotation.define<boolean>()

const hidden = Decoration.replace({})

/** Markdown styling for the visible lines. `hide` drops the markers (pretty view); otherwise they
 *  stay, dimmed (raw view). Quote marks are dialogue and always stay. */
function decorate(view: EditorView, order: MarkerKind[], hide: boolean): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      if (isHeading(line.text)) {
        ranges.push(Decoration.line({ class: 'storyDocHeading' }).range(line.from))
        ranges.push((hide ? hidden : Decoration.mark({ class: 'proseMark' })).range(line.from, line.from + 2))
      }
      for (const m of proseMarks(line.text, order)) {
        const deco =
          hide && m.className === 'proseMark'
            ? hidden
            : Decoration.mark({ class: m.className, attributes: m.win ? { 'data-win': m.win } : undefined })
        ranges.push(deco.range(line.from + m.from, line.from + m.to))
      }
      pos = line.to + 1
    }
  }
  return Decoration.set(ranges, true)
}

const onlyHidden = (set: DecorationSet): DecorationSet => {
  const out: Range<Decoration>[] = []
  for (const it = set.iter(); it.value; it.next()) if (it.value === hidden) out.push(it.value.range(it.from, it.to))
  return Decoration.set(out)
}

const styling = (order: MarkerKind[], hide: boolean) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      hiddenOnly: DecorationSet
      constructor(view: EditorView) {
        this.decorations = decorate(view, order, hide)
        this.hiddenOnly = onlyHidden(this.decorations)
      }
      update(u: ViewUpdate) {
        if (!u.docChanged && !u.viewportChanged) return
        this.decorations = decorate(u.view, order, hide)
        this.hiddenOnly = onlyHidden(this.decorations)
      }
    },
    {
      decorations: (p) => p.decorations,
      // The cursor steps over a hidden marker in one press rather than sitting inside it unseen.
      // Only the hidden ones: a styled word stays a word the cursor can move through.
      provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.hiddenOnly ?? Decoration.none),
    },
  )

/** What a Find & Replace rule shows in place of a match. Built as DOM text, never HTML: the
 *  replacement may have come from an imported rule set. */
class Replaced extends WidgetType {
  text: string
  constructor(text: string) {
    super()
    this.text = text
  }
  eq(other: Replaced) {
    return other.text === this.text
  }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'storyReplaced'
    span.textContent = this.text
    return span
  }
}

/**
 * The picked sets' on-screen Find & Replace rules over the whole document: each match shows its
 * replacement, the stored text stays as typed. A StateField rather than a plugin: a regex match
 * can span lines. The raw view leaves it out.
 */
function replaceView(rules: ReplaceRule[]): Extension {
  const build = (state: EditorState): DecorationSet =>
    Decoration.set(
      ruleMatches(state.doc.toString(), rules).map((m) =>
        (m.insert ? Decoration.replace({ widget: new Replaced(m.insert) }) : hidden).range(m.from, m.to),
      ),
    )
  const field = StateField.define<DecorationSet>({
    create: build,
    update: (value, tr) => (tr.docChanged ? build(tr.state) : value),
    provide: (f) => [EditorView.decorations.from(f), EditorView.atomicRanges.of((view) => view.state.field(f))],
  })
  return field
}

/** Everything that differs between the two views. */
const viewExtensions = (raw: boolean, order: MarkerKind[], rules: ReplaceRule[]): Extension =>
  raw ? styling(order, false) : [styling(order, true), replaceView(rules)]

/** Ctrl+B/I/Q: wrap the selection in a marker, or unwrap it. An empty selection does nothing. */
const wrapWith = (mark: string) => (view: EditorView) => {
  // readOnly stops typing but not a dispatch: a generation in flight owns the document.
  if (view.state.readOnly) return true
  const r = view.state.selection.main
  const edit = wrapEdit(view.state.doc.toString(), r.from, r.to, mark)
  if (!edit) return false
  view.dispatch({ changes: edit.changes, selection: { anchor: edit.anchor, head: edit.head } })
  return true
}

// ponytail: one document is open at a time, so the toolbar and the chapter list reach the editor
// through this rather than a context.
let activeView: EditorView | null = null

/** Run an action on the open document: continue at the cursor, or act on the selection. */
export function runAction(action: StoryAction, instruction = '', at?: number): void {
  const view = activeView
  if (!view) return
  const { from, to, head } = view.state.selection.main
  if (action !== 'continue' && from === to) return
  const cursor = at ?? head
  useWrite.getState().generate({
    action,
    doc: view.state.doc.toString(),
    from: action === 'continue' ? cursor : from,
    to: action === 'continue' ? cursor : to,
    instruction,
  })
}

const openAsk = StateEffect.define<number>()
const closeAsk = StateEffect.define<null>()

/**
 * The direction line Ctrl+Enter opens under the cursor's line: type an instruction, Enter continues
 * from where the cursor was, Escape or clicking away drops it. Its text lives in the input, never
 * in the document. One at a time, so every instance compares equal and typing survives a redraw.
 */
class AskLine extends WidgetType {
  eq() {
    return true
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div')
    wrap.className = 'storyAsk'
    const input = document.createElement('input')
    input.className = 'storyAskInput'
    input.placeholder = 'Write an optional instruction and hit "Enter" to continue.'
    input.setAttribute('aria-label', 'Instruction for this continue')
    let done = false
    const close = () => {
      if (done) return
      done = true
      view.dispatch({ effects: closeAsk.of(null) })
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const at = view.state.field(askField)
        close()
        view.focus()
        if (at !== null) runAction('continue', input.value.trim(), at)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close()
        view.focus()
      }
    })
    input.addEventListener('blur', close)
    wrap.append(input)
    requestAnimationFrame(() => input.focus())
    return wrap
  }
}

/** Where the open direction line will continue from, or null. Mapped through edits. */
const askField = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(openAsk)) return e.value
      if (e.is(closeAsk)) return null
    }
    return value === null || !tr.docChanged ? value : tr.changes.mapPos(value)
  },
  // A block widget can't come from a plugin, so this field draws it. It sits at the end of the
  // cursor's line, which puts it under that line; the continue still lands at the cursor.
  provide: (f) =>
    EditorView.decorations.compute([f], (state) => {
      const at = state.field(f)
      if (at === null) return Decoration.none
      const lineEnd = state.doc.lineAt(at).to
      return Decoration.set(Decoration.widget({ widget: new AskLine(), block: true, side: 1 }).range(lineEnd))
    }),
})

/** Open the direction line at the cursor. While a generation runs, Continue says why it can't. */
function askAtCursor(view: EditorView): boolean {
  if (useWrite.getState().streaming) runAction('continue')
  else view.dispatch({ effects: openAsk.of(view.state.selection.main.head) })
  return true
}

/** How many times `find` occurs in the live document. */
export const countInDoc = (find: string, matchCase: boolean): number =>
  activeView ? findAll(activeView.state.doc.toString(), find, matchCase).length : 0

/** Replace every occurrence in one change, so a single undo puts them all back. Returns the count. */
export function replaceInDoc(find: string, replace: string, matchCase: boolean): number {
  const view = activeView
  if (!view || useWrite.getState().streaming) return 0
  const hits = findAll(view.state.doc.toString(), find, matchCase)
  if (hits.length) view.dispatch({ changes: hits.map((from) => ({ from, to: from + find.length, insert: replace })) })
  return hits.length
}

/** Scroll the document to an offset and put the cursor there. */
export function jumpTo(offset: number): void {
  const view = activeView
  if (!view) return
  view.dispatch({ selection: { anchor: offset }, effects: EditorView.scrollIntoView(offset, { y: 'start' }) })
  view.focus()
}

const keys = keymap.of([
  {
    key: 'Mod-Enter',
    run: (view) => hotkeysOn() && askAtCursor(view),
  },
  {
    key: 'Mod-Shift-Enter',
    run: () => {
      if (!hotkeysOn()) return false
      useWrite.getState().retry()
      return true
    },
  },
  { key: 'Mod-b', run: wrapWith('**') },
  { key: 'Mod-i', run: wrapWith('*') },
  { key: 'Mod-q', run: wrapWith('"') },
  // Always handled: unhandled, Alt+Left is the browser's Back.
  { key: 'Alt-ArrowLeft', run: () => (useWrite.getState().swipe(-1), true) },
  { key: 'Alt-ArrowRight', run: () => (useWrite.getState().swipe(1), true) },
  {
    key: 'Escape',
    run: () => {
      if (!useWrite.getState().streaming) return false
      useWrite.getState().stop()
      return true
    },
  },
])

export default function StoryDocument({ raw, replaceRules }: { raw: boolean; replaceRules: ReplaceRule[] }) {
  const story = useWrite((s) => s.story)
  const streaming = useWrite((s) => s.streaming)
  const palette = usePalette()
  const host = useRef<HTMLDivElement>(null)
  const styleSlot = useRef(new Compartment())
  // Read by the editor's setup without making it a dependency: a change reconfigures below instead.
  const latest = useRef({ raw, order: palette.storyColorOrder, replaceRules })
  latest.current = { raw, order: palette.storyColorOrder, replaceRules }
  const id = story?.id

  useEffect(() => {
    const initial = useWrite.getState().story
    if (!host.current || !initial) return
    const lock = new Compartment()
    let saveTimer: number | undefined
    let pending: string | null = null
    const flush = () => {
      window.clearTimeout(saveTimer)
      if (pending === null) return
      useWrite
        .getState()
        .saveText(initial.id!, pending)
        // Typing that arrived while this write was in flight is still unsaved.
        .then(() => pending === null && useWrite.getState().setUnsaved(false))
      pending = null
    }
    const settings = latest.current

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.text,
        extensions: [
          history(),
          askField,
          keys,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Story text' }),
          placeholder('Type here. Ctrl+Enter writes from the cursor.'),
          styleSlot.current.of(viewExtensions(settings.raw, settings.order, settings.replaceRules)),
          lock.of(EditorState.readOnly.of(false)),
          EditorView.updateListener.of((u) => {
            // Commit first. While a generation is live the splice below listens to the store, and
            // a store change it saw mid-update with the range already edited would try to dispatch.
            if (u.docChanged && !u.transactions.some((t) => t.annotation(generated))) useWrite.getState().commitLast()
            if (u.selectionSet || u.docChanged) {
              const r = u.state.selection.main
              useWrite.getState().setCursor(r.from, r.to)
            }
            if (!u.docChanged) return
            // Debounced: a keystroke isn't a database write. Flushed on close.
            useWrite.getState().setUnsaved(true)
            pending = u.state.doc.toString()
            window.clearTimeout(saveTimer)
            saveTimer = window.setTimeout(flush, 500)
          }),
        ],
      }),
    })
    activeView = editor
    const view = editor

    // Splice the last generation into its range whenever what it shows changes: each streamed
    // chunk, then a retry or a swipe. Reset when the generation is committed.
    let shown: { from: number; len: number } | null = null
    const unsubscribe = useWrite.subscribe((s, prev) => {
      if (s.streaming !== prev.streaming) view.dispatch({ effects: lock.reconfigure(EditorState.readOnly.of(s.streaming)) })
      const last = s.last
      if (!last) {
        shown = null
        return
      }
      shown ??= { from: last.from, len: last.selection.length }
      const text = s.streaming ? s.streamingText : last.alternates[last.index]
      const to = shown.from + shown.len
      if (view.state.sliceDoc(shown.from, to) === text) return
      // Before the dispatch: its update listener moves the cursor in the store, which comes back
      // here, and must find the range already matching.
      shown.len = text.length
      view.dispatch({
        changes: { from: shown.from, to, insert: text },
        selection: { anchor: shown.from + text.length },
        annotations: [generated.of(true), Transaction.userEvent.of('input.generate')],
        scrollIntoView: true,
      })
    })

    return () => {
      unsubscribe()
      flush()
      if (activeView === view) activeView = null
      view.destroy()
    }
  }, [id])

  // The view switch, the palette's color order (which kind paints a nested run) and the rules.
  useEffect(() => {
    activeView?.dispatch({
      effects: styleSlot.current.reconfigure(viewExtensions(raw, palette.storyColorOrder, replaceRules)),
    })
  }, [raw, palette.storyColorOrder, replaceRules])

  const proseStyle = {
    fontFamily: effectiveFont(palette) || undefined,
    fontSize: `${palette.fontSize}px`,
    '--storyLineHeight': palette.lineHeight || '',
  } as React.CSSProperties

  return <div ref={host} className="storyDoc" style={proseStyle} aria-busy={streaming} />
}
