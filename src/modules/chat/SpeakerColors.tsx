import { useEffect, useRef, useState } from 'react'
import ColorStack from '../../app/ColorStack'
import { useCharacters } from '../../core/stores/charactersStore'
import { usePalette } from '../../core/stores/palettesStore'
import { participants } from '../../core/stores/roster'
import type { Chat, CharacterColors } from '../../core/storage/types'
import { emptyColors } from '../../core/storage/types'
import type { MarkerKind } from '../../core/stores/settingsStore'

// Which override each marker kind writes. CharacterColors mirrors the palette's marker fields.
const colorField: Record<MarkerKind, keyof CharacterColors> = {
  emphasis: 'emphasisColor',
  bold: 'boldColor',
  quotes: 'quoteColor',
}

/**
 * The open chat's colors, in the rail. This edits the *character's* overrides rather than the
 * palette's globals: in a chat the colors on screen are that character's. The control nearest
 * to hand should write where the user is looking. The palette's own marker colors are still edited
 * in Settings → Themes.
 *
 * The marker order stays global, `CharacterColors` holds no order of its own, and a per-character
 * precedence order is a bigger idea than this control. Upgrade path if it's ever wanted: an order
 * field on CharacterColors, resolved the same way the colors are.
 */
export default function SpeakerColors({ chat }: { chat: Chat }) {
  const characters = useCharacters((s) => s.characters)
  const save = useCharacters((s) => s.save)
  // The order is read from the palette but not editable here: precedence is not a per-character
  // idea. It stays in Settings → Themes where one list governs every speaker.
  const palette = usePalette()

  const roster = participants(chat)
  const group = roster.length > 1
  const character = characters.find((c) => c.id === roster[0])
  const colors = { ...emptyColors(), ...character?.colors }

  // A color input fires on every frame of a drag. save() is a write plus a full reload: the
  // swatch follows the pointer from local state and the record is written once the drag settles.
  const [draft, setDraft] = useState<CharacterColors | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const shown = draft ?? colors

  const write = (patch: Partial<CharacterColors>) => {
    if (!character) return
    const next = { ...shown, ...patch }
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      save({ ...character, colors: next })
      setDraft(null)
    }, 400)
  }

  return (
    <>
      <h3 className="speakerColorsTitle">{group ? 'Character colors' : `${character?.displayName?.trim() || character?.name || 'Character'} colors`}</h3>
      <ColorStack
        order={palette.colorOrder}
        colorOf={(kind) => shown[colorField[kind]]}
        textColor={shown.textColor}
        disabled={group || !character || palette.overwriteCharColor}
        onColor={(kind, color) => write({ [colorField[kind]]: color })}
        onTextColor={(textColor) => write({ textColor })}
      />
      <p className="hint">
        {palette.overwriteCharColor
          ? 'The theme is overwriting character colors. These are ignored. Turn off Overwrite Char. Color in Settings → Themes to use them.'
          : group
            ? 'Cannot edit character colors in a group chat. Change it manually at each character’s landing page, or return to a 1-on-1 chat to restore it'
            : 'Overrides the palette colors for this character. Empty uses the palette.'}
      </p>
    </>
  )
}
