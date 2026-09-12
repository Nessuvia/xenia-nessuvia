import { Avatar } from '../../app/Avatar'
import type { CommandMenu as Menu } from '../../core/stores/slashCommands'

/**
 * The slash-command list, floated above the composer. Purely a list: the composer owns the draft
 * text, the highlight, and what accepting an item does.
 */
export default function CommandMenu({
  menu,
  active,
  onHover,
  onPick,
}: {
  menu: Menu
  /** Index of the highlighted row, moved by the arrow keys. */
  active: number
  onHover: (index: number) => void
  onPick: (index: number) => void
}) {
  return (
    <div className="panel commandMenu">
      {menu.kind === 'commands'
        ? menu.items.map((c, i) => (
            <button
              type="button"
              key={c.name}
              className={`commandRow${i === active ? ' active' : ''}`}
              onMouseEnter={() => onHover(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(i)
              }}
            >
              <span className="commandName">{c.usage}</span>
              <span className="commandHint">{c.hint}</span>
            </button>
          ))
        : menu.items.map((t, i) => (
            <button
              type="button"
              key={t.id}
              className={`commandRow${i === active ? ' active' : ''}`}
              onMouseEnter={() => onHover(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(i)
              }}
            >
              <Avatar
                of={t.avatar ? { avatar: t.avatar } : null}
                name={t.name}
                className="commandAvatar"
              />
              <span className="commandName">{t.name}</span>
            </button>
          ))}
    </div>
  )
}
