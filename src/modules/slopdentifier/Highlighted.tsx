import { Fragment } from 'react'
import type { Finding } from './analyse'

/** Overlapping spans merged into one run. A phrase caught by two detectors is marked once, not
 *  nested as a highlight inside a highlight. */
export function mergeSpans(findings: Finding[]): [number, number][] {
  const spans = findings
    .filter((f) => f.span && f.span.end > f.span.start)
    .map((f) => [f.span!.start, f.span!.end] as [number, number])
    .sort((a, b) => a[0] - b[0])

  const out: [number, number][] = []
  for (const [start, end] of spans) {
    const last = out[out.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else out.push([start, end])
  }
  return out
}

/**
 * The passage with every found span marked.
 *
 * React elements only. This is model output and imported card text, and the whole point of the
 * screen is looking at the worst of it. It never goes near innerHTML.
 */
export default function Highlighted({ text, findings }: { text: string; findings: Finding[] }) {
  const spans = mergeSpans(findings)
  if (!spans.length) return <p className="slopPassage">{text}</p>

  const parts = []
  let at = 0
  for (const [start, end] of spans) {
    if (start > at) parts.push(<Fragment key={`t${at}`}>{text.slice(at, start)}</Fragment>)
    parts.push(
      <mark className="slopMark" key={`m${start}`}>
        {text.slice(start, end)}
      </mark>,
    )
    at = end
  }
  if (at < text.length) parts.push(<Fragment key={`t${at}`}>{text.slice(at)}</Fragment>)

  return <p className="slopPassage">{parts}</p>
}
