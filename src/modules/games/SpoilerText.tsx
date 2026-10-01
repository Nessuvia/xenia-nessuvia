import { Fragment, type ReactNode } from 'react'
import { spoilerRanges } from '../../core/games/cardSpoilers'
import { sentences } from '../../core/quality/sentences'
import type { Rank } from '../../core/games/deck'
import { useSettings } from '../../core/stores/settingsStore'
import { useGames } from './gamesStore'
import { usePalette } from '../../core/stores/palettesStore'
import { renderText } from '../chat/renderText'

/**
 * A character's line with every sentence that names a secret rank covered until clicked. Used by
 * the board's line and the log. A reveal is keyed on the line's text and the sentence's offset:
 * a streamed line only grows, so the key holds from the first chunk to the stored event, and the
 * same line in both places shares one key. There's no way to cover one again.
 *
 * The text between covers gets the chat's markers: "quotes", *emphasis* and **bold** in the
 * character's colors (set as vars on the game's root, GamesView characterText).
 */
export default function SpoilerText({ text, secret, streaming = false }: { text: string; secret: Rank[]; streaming?: boolean }) {
  const hideCards = useSettings((s) => s.gameHideCards)
  const revealed = useGames((s) => s.revealed)
  const reveal = useGames((s) => s.reveal)
  const order = usePalette().colorOrder

  // While a reply streams, the sentence still arriving is held back: it can't be judged until it's
  // whole, and showing it early flashes the words before the bar covers them. Only when something
  // could be hidden. Otherwise the stream shows as it comes.
  if (streaming && hideCards && secret.length) {
    const all = sentences(text)
    text = all.length > 1 ? text.slice(0, all[all.length - 2].end) : ''
    if (!text) return <>…</>
  }

  // ponytail: each stretch between covers is marked up on its own, so a quote running across a
  // covered sentence shows its marks literally on either side. Render the whole line once and
  // splice the covers in by source offset (renderText's map) if that starts to show.
  const marked = (slice: string, key: string) => (
    <Fragment key={key}>{renderText(slice, { order, role: 'assistant', streaming })}</Fragment>
  )
  const parts: ReactNode[] = []
  let at = 0
  for (const { start, end } of hideCards ? spoilerRanges(text, secret) : []) {
    const key = `${start}:${text.slice(0, end)}`
    if (revealed.includes(key)) continue
    parts.push(marked(text.slice(at, start), `t${at}`))
    parts.push(
      <button key={start} type="button" className="cardTableSpoiler" onClick={() => reveal(key)}>
        {text.slice(start, end)}
      </button>,
    )
    at = end
  }
  parts.push(marked(text.slice(at), `t${at}`))
  return <>{parts}</>
}
