import type { ReactNode } from 'react'
import { spoilerRanges } from '../../core/games/cardSpoilers'
import { sentences } from '../../core/quality/sentences'
import type { Rank } from '../../core/games/deck'
import { useSettings } from '../../core/stores/settingsStore'
import { useGames } from './gamesStore'

/**
 * A character's line with every sentence that names a secret rank covered until clicked. Used by
 * the board's line and the log. A reveal is keyed on the line's text and the sentence's offset:
 * a streamed line only grows, so the key holds from the first chunk to the stored event, and the
 * same line in both places shares one key. There's no way to cover one again.
 */
export default function SpoilerText({ text, secret, streaming = false }: { text: string; secret: Rank[]; streaming?: boolean }) {
  const hideCards = useSettings((s) => s.gameHideCards)
  const revealed = useGames((s) => s.revealed)
  const reveal = useGames((s) => s.reveal)

  // While a reply streams, the sentence still arriving is held back: it can't be judged until it's
  // whole, and showing it early flashes the words before the bar covers them. Only when something
  // could be hidden. Otherwise the stream shows as it comes.
  if (streaming && hideCards && secret.length) {
    const all = sentences(text)
    text = all.length > 1 ? text.slice(0, all[all.length - 2].end) : ''
    if (!text) return <>…</>
  }

  const parts: ReactNode[] = []
  let at = 0
  for (const { start, end } of hideCards ? spoilerRanges(text, secret) : []) {
    const key = `${start}:${text.slice(0, end)}`
    if (revealed.includes(key)) continue
    parts.push(text.slice(at, start))
    parts.push(
      <button key={start} type="button" className="cardTableSpoiler" onClick={() => reveal(key)}>
        {text.slice(start, end)}
      </button>,
    )
    at = end
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}
