import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import type { Character } from '../../core/storage/types'
import { displayName } from '../../core/stores/charactersStore'
import TagList from './TagList'

/** The quick-tag menu: right-click (or long-press) a card. Positioned at the pointer. */
export default function TagContextMenu({
  character,
  tags,
  at,
  onChange,
  onClose,
}: {
  character: Character
  /** Every tag in use across the roster. */
  tags: string[]
  at: { x: number; y: number }
  onChange: (tags: string[]) => void
  onClose: () => void
}) {
  const ref = useCloseOnOutside<HTMLDivElement>(true, onClose)
  const current = character.tags ?? []

  const toggle = (tag: string) =>
    onChange(current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag])

  return (
    <div
      ref={ref}
      className="panel tagContextMenu"
      style={{
        left: Math.min(at.x, window.innerWidth - 240),
        top: Math.min(at.y, window.innerHeight - 320),
      }}
    >
      <p className="tagContextName">{displayName(character) || 'Unnamed'}</p>
      <TagList
        tags={tags}
        checked={current}
        onToggle={toggle}
        onCreate={(tag) => onChange([...current, tag])}
        emptyText="No tags yet."
      />
    </div>
  )
}
