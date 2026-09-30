// The stack template in CodeMirror. Highlighting marks the three tag kinds, and completion offers
// the slots, tokens and declared variables. Problems are listed under the editor by line.
import { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { tags } from '@lezer/highlight'
import { templateProblems, templateVariables } from '../../core/prompt/stackTemplate'
import type { StackKind } from './stackKinds'

// Slots and tokens a template can paste, per kind. The completion list and nothing else reads these.
const names: Record<StackKind, string[]> = {
  chat: [
    'history',
    'charDescription',
    'charPersonality',
    'charScenario',
    'charExampleDialogue',
    'personaDescription',
    'systemPrompt',
    'postHistory',
    'authorNote',
    'worldInfo',
    'worldInfoAfter',
    'char',
    'user',
    'personas',
    'game',
    'char1',
    'char2',
    'char3',
    'char4',
    'char1Desc',
    'char2Desc',
    'char3Desc',
    'char4Desc',
  ],
  story: [
    'storyContext',
    'storyTrailing',
    'cast',
    'worldInfo',
    'worldInfoAfter',
    'storyTitle',
    'premise',
    'ending',
    'themes',
    'castNames',
    'chapterNumber',
    'chapterCount',
    'chapterTitle',
    'chapterSummary',
    'chapterTargetWords',
    'previousChapterSummary',
    'nextChapterTitle',
    'nextChapterBeats',
    'beat',
    'beatTargetWords',
    'otherBeats',
  ],
}

const tagWords: Record<StackKind, string[]> = {
  chat: ['if', 'elif', 'else', 'endif', 'var', 'message', 'endmessage', 'depth', 'enddepth', 'systemPrompt', 'endsystemPrompt', 'postHistory', 'endpostHistory'],
  story: ['if', 'elif', 'else', 'endif', 'var', 'message', 'endmessage'],
}

// Three token kinds. A `{# #}` comment can span lines, so the stream keeps that one bit of state.
const templateLanguage = StreamLanguage.define<{ inComment: boolean }>({
  startState: () => ({ inComment: false }),
  token(stream, state) {
    if (state.inComment || stream.match('{#')) {
      state.inComment = !stream.skipTo('#}')
      if (state.inComment) stream.skipToEnd()
      else stream.match('#}')
      return 'comment'
    }
    if (stream.match(/^\{%[^%]*%\}/)) return 'keyword'
    if (stream.match(/^\{\{[^{}]*\}\}/)) return 'variableName'
    stream.next()
    while (!stream.eol() && stream.peek() !== '{') stream.next()
    return null
  },
})

// Colours come from the stylesheet: classes here, `var(--...)` there.
const highlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'promptsTplTag' },
  { tag: tags.variableName, class: 'promptsTplSlot' },
  { tag: tags.comment, class: 'promptsTplComment' },
])

function completions(kind: StackKind) {
  return (ctx: CompletionContext) => {
    const slot = ctx.matchBefore(/\{\{\s*\w*/)
    if (slot) {
      const vars = templateVariables(ctx.state.doc.toString()).variables.map((v) => v.id)
      const from = slot.from + slot.text.search(/\w*$/)
      return { from, options: [...vars, ...names[kind]].map((label) => ({ label, type: 'variable' })) }
    }
    const tag = ctx.matchBefore(/\{%\s*\w*/)
    if (tag) {
      const from = tag.from + tag.text.search(/\w*$/)
      return { from, options: tagWords[kind].map((label) => ({ label, type: 'keyword' })) }
    }
    return null
  }
}

export default function TemplateEditor({
  value,
  kind,
  onChange,
}: {
  value: string
  kind: StackKind
  onChange: (value: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  // The latest callback, read by the listener the view was built with.
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
          templateLanguage,
          syntaxHighlighting(highlight),
          autocompletion({ override: [completions(kind)] }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changed.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    view.current = v
    return () => v.destroy()
    // Rebuilt per kind: the completion list differs. `value` is synced by the effect below.
  }, [kind])

  // Another stack opened: replace the document. An edit typed here already matches and is skipped.
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  const problems = templateProblems(value, kind)

  const jump = (line: number) => {
    const v = view.current
    if (!v) return
    const at = v.state.doc.line(Math.min(line, v.state.doc.lines)).from
    v.dispatch({ selection: { anchor: at }, scrollIntoView: true })
    v.focus()
  }

  return (
    <>
      <div ref={host} className="promptsTemplateEditor" />
      {problems.length > 0 && (
        <ul className="promptsTemplateProblems">
          {problems.map((p, i) => (
            <li key={i}>
              <button type="button" className="promptsTemplateProblem" onClick={() => jump(p.line)}>
                Line {p.line}: {p.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
