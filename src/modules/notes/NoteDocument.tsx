// One note's text in CodeMirror, styled like the Write document (its decorations, hoisted CSS in
// app/proseDoc.css), plus `[[links]]`. Ctrl or Cmd+click opens a link. The stored text is exactly
// what was typed.
import { useEffect, useRef } from 'react'
import { Compartment, EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, keymap, placeholder, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { useNotes } from '../../core/stores/notesStore'
import { usePalette } from '../../core/stores/palettesStore'
import { effectiveFont } from '../../core/palette/palette'
import { findLinks } from '../../core/notes/noteLinks'
import { styling, wrapWith } from '../write/StoryDocument'
import '../../app/proseDoc.css'

/** Marks every `[[link]]` in the visible lines, as missing when no note has that title. */
const linkStyling = (titles: Set<string>) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = this.build(view)
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view)
      }
      build(view: EditorView) {
        const ranges: Range<Decoration>[] = []
        for (const { from, to } of view.visibleRanges) {
          for (const link of findLinks(view.state.sliceDoc(from, to))) {
            const className = titles.has(link.title) ? 'notesLink' : 'notesLink notesLinkMissing'
            ranges.push(Decoration.mark({ class: className }).range(from + link.from, from + link.to))
          }
        }
        return Decoration.set(ranges, true)
      }
    },
    { decorations: (p) => p.decorations },
  )

const keys = keymap.of([
  { key: 'Mod-b', run: wrapWith('**') },
  { key: 'Mod-i', run: wrapWith('*') },
  { key: 'Mod-q', run: wrapWith('"') },
])

export default function NoteDocument({ noteId, onOpenLink }: { noteId: number; onOpenLink: (title: string) => void }) {
  const palette = usePalette()
  const titleKey = useNotes((s) => s.notes.map((n) => n.title).join('\n'))
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const styleSlot = useRef(new Compartment())
  const linkSlot = useRef(new Compartment())
  // Read by the editor's setup without making them dependencies: a change reconfigures below instead.
  const latest = useRef({ order: palette.storyColorOrder, onOpenLink })
  latest.current = { order: palette.storyColorOrder, onOpenLink }

  useEffect(() => {
    const note = useNotes.getState().notes.find((n) => n.id === noteId)
    if (!host.current || !note) return
    let saveTimer: number | undefined
    let pending: string | null = null
    const flush = () => {
      window.clearTimeout(saveTimer)
      if (pending !== null) useNotes.getState().saveText(noteId, pending)
      pending = null
    }

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: note.text,
        extensions: [
          history(),
          keys,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ spellcheck: 'true', 'aria-label': 'Note text' }),
          placeholder('Type here. [[Note title]] links to a note.'),
          styleSlot.current.of(styling(latest.current.order, true)),
          linkSlot.current.of(linkStyling(new Set(useNotes.getState().notes.map((n) => n.title)))),
          EditorView.domEventHandlers({
            mousedown(e, v) {
              if (!(e.ctrlKey || e.metaKey)) return false
              const pos = v.posAtCoords({ x: e.clientX, y: e.clientY })
              if (pos === null) return false
              const line = v.state.doc.lineAt(pos)
              const link = findLinks(line.text).find((l) => pos >= line.from + l.from && pos <= line.from + l.to)
              if (!link) return false
              e.preventDefault()
              flush()
              latest.current.onOpenLink(link.title)
              return true
            },
          }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return
            // Debounced: a keystroke isn't a database write. Flushed on close.
            pending = u.state.doc.toString()
            window.clearTimeout(saveTimer)
            saveTimer = window.setTimeout(flush, 500)
          }),
        ],
      }),
    })
    view.current = editor

    return () => {
      flush()
      view.current = null
      editor.destroy()
    }
  }, [noteId])

  useEffect(() => {
    view.current?.dispatch({ effects: styleSlot.current.reconfigure(styling(palette.storyColorOrder, true)) })
  }, [palette.storyColorOrder])

  // A note created, deleted or renamed elsewhere turns links on and off.
  useEffect(() => {
    view.current?.dispatch({ effects: linkSlot.current.reconfigure(linkStyling(new Set(titleKey.split('\n')))) })
  }, [titleKey])

  const proseStyle = {
    fontFamily: effectiveFont(palette) || undefined,
    fontSize: `${palette.fontSize}px`,
    '--storyLineHeight': palette.lineHeight || '',
  } as React.CSSProperties

  return <div ref={host} className="notesDoc proseDoc" style={proseStyle} />
}
