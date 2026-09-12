import { useMemo } from 'react'
import type { ChatMessage } from '../../core/connectors/connectorInterface'
import type { InstructTemplate } from '../../core/params/paramDef'
import { flattenPrompt, sequencesOf } from '../../core/prompt/flattenPrompt'

/** A short stand-in chat, so the preview shows a system turn, both roles, and the open turn. */
const sample: ChatMessage[] = [
  { role: 'system', content: 'You are Xenia.' },
  { role: 'user', content: 'Hello.', name: 'Dom' },
  { role: 'assistant', content: 'Hello yourself.', name: 'Xenia' },
  { role: 'user', content: 'How are you?', name: 'Dom' },
]

/** The prompt split into sequence and content runs, so the sequences can be marked in the output. */
function split(prompt: string, marks: string[]): { text: string; sequence: boolean }[] {
  if (!marks.length) return [{ text: prompt, sequence: false }]
  // Longest first, so `<|im_start|>assistant` is matched before `<|im_start|>`.
  const sorted = [...new Set(marks)].sort((a, b) => b.length - a.length)
  const parts: { text: string; sequence: boolean }[] = []
  let plain = ''
  let at = 0
  while (at < prompt.length) {
    const hit = sorted.find((m) => prompt.startsWith(m, at))
    if (hit) {
      if (plain) parts.push({ text: plain, sequence: false })
      plain = ''
      parts.push({ text: hit, sequence: true })
      at += hit.length
    } else {
      plain += prompt[at]
      at += 1
    }
  }
  if (plain) parts.push({ text: plain, sequence: false })
  return parts
}

/**
 * The prompt this template produces, built by the same `flattenPrompt` the send path uses. Nothing
 * here reimplements the format: a preview that agrees with itself and disagrees with the request is
 * worse than none.
 */
export default function FormatPreview({ template }: { template: InstructTemplate }) {
  const parts = useMemo(() => {
    const prompt = flattenPrompt(sample, template)
    const marks = [...sequencesOf(template), template.firstPrefix ?? ''].filter(Boolean)
    return split(prompt, marks)
  }, [template])

  return (
    <div className="formatPreview">
      <h4 className="formatPreviewTitle">Preview</h4>
      <pre className="formatPreviewBody">
        {parts.map((part, i) =>
          part.sequence ? (
            <mark key={i} className="formatPreviewSequence">
              {part.text}
            </mark>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </pre>
      <p className="formatPreviewHint">A sample chat, not this connection's history.</p>
    </div>
  )
}
