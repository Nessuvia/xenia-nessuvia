import { Fragment, type ReactNode } from 'react'
import { RiSparkling2Line } from '@remixicon/react'
import type { Segment } from './agentSegments'

const markClass = {
  pending: 'chatAgentPending',
  strike: 'chatAgentStrike',
  fresh: 'chatAgentFresh',
  flash: 'chatAgentFlash',
}

/** A streaming reply under the agent's display mode. null segments show a working marker. */
export default function AgentStream({ segments, render }: { segments: Segment[] | null; render: (text: string) => ReactNode[] }) {
  if (!segments) {
    return (
      <p className="passMarker">
        <RiSparkling2Line size={14} />
        Writing
      </p>
    )
  }
  // Keyed by content, not position: a run keeps its element (and its finished animation) while the
  // runs around it change, and a run whose mark changes remounts and starts its own animation.
  const seen = new Map<string, number>()
  return (
    <>
      {segments.map((s) => {
        const id = `${s.mark}:${s.text}`
        const n = seen.get(id) ?? 0
        seen.set(id, n + 1)
        const key = `${id}:${n}`
        return s.mark === 'none' ? (
          <Fragment key={key}>{render(s.text)}</Fragment>
        ) : (
          <span key={key} className={markClass[s.mark]}>
            {render(s.text)}
          </span>
        )
      })}
      <span className="caret">▌</span>
    </>
  )
}
