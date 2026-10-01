// The code editing shell shared by the stack's Look and the palette's Backgrounds: CodeMirror over
// HTML or CSS, and the Reference popover that sits in the panel's toolbar. Colours come from
// codeEditor.css through classes, so they follow the palette. The template editor reuses the shell
// and the token classes with its own language.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { placeholder as placeholderText } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { tags } from '@lezer/highlight'
import { useCloseOnOutside } from './useCloseOnOutside'
import './codeEditor.css'

const highlight = HighlightStyle.define([
  { tag: [tags.tagName, tags.keyword, tags.atom], class: 'codeTag' },
  { tag: [tags.string, tags.attributeValue, tags.number, tags.unit, tags.color], class: 'codeValue' },
  { tag: [tags.attributeName, tags.propertyName, tags.className, tags.labelName], class: 'codeName' },
  { tag: tags.comment, class: 'codeComment' },
])

export function CodeEditor({
  value,
  lang,
  disabled,
  placeholder,
  onChange,
}: {
  value: string
  lang: 'html' | 'css'
  disabled?: boolean
  placeholder?: string
  onChange: (value: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changed = useRef(onChange)
  changed.current = onChange

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          lang === 'html' ? html() : css(),
          syntaxHighlighting(highlight),
          EditorView.editable.of(!disabled),
          ...(placeholder ? [placeholderText(placeholder)] : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changed.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
    // ponytail: rebuilt per language and when `disabled` flips, which drops undo history across a
    // tab switch. Keep one EditorState per language and swap with setState if that starts to matter.
  }, [lang, disabled, placeholder])

  // The text was replaced from outside (another stack or slot, an Ask reply). An edit typed here
  // already matches and is skipped.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  return <div ref={host} className="codeEditor" />
}

/** The toolbar's Reference button and the popover it opens over the editor. Closes on an outside
 *  click or Escape. */
export function CodeReference({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const wrap = useCloseOnOutside(open, () => setOpen(false))
  return (
    <div className="codeRefWrap" ref={wrap}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Reference
      </button>
      {open && <div className="panel codeRef">{children}</div>}
    </div>
  )
}
