import { useNavigate } from 'react-router-dom'
import { RiPriceTag3Line } from '@remixicon/react'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import TagList from './TagList'
import type { TagMode } from './tags'

/**
 * Every tag control on the picker, behind one button: filter, Any/All, group by tag, and the way
 * into tag management. Three separate header buttons put tag housekeeping at the same weight as
 * New character, which it's not.
 *
 * State stays in CharacterPicker, this is chrome, not a store.
 */
export default function TagMenu({
  tags,
  selected,
  onToggle,
  onClear,
  mode,
  onMode,
  grouped,
  onGrouped,
  open,
  onOpen,
}: {
  tags: string[]
  selected: string[]
  onToggle: (tag: string) => void
  onClear: () => void
  mode: TagMode
  onMode: (mode: TagMode) => void
  grouped: boolean
  onGrouped: (grouped: boolean) => void
  open: boolean
  onOpen: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const ref = useCloseOnOutside<HTMLSpanElement>(open, () => onOpen(false))
  const active = selected.length > 0 || grouped

  return (
    <span className="importMenu" ref={ref}>
      <button
        type="button"
        className={`importButton${active ? ' active' : ''}`}
        title="Tags"
        onClick={() => onOpen(!open)}
      >
        <RiPriceTag3Line size={16} />
        <span className="btnLabel">
          {selected.length ? `${selected.length} tag${selected.length === 1 ? '' : 's'}` : 'Tags'}
        </span>
      </button>
      {open && (
        <div className="panel importMenuList tagFilterMenu">
          <TagList
            tags={tags}
            checked={selected}
            onToggle={onToggle}
            header={
              <div className="tagFilterHead">
                {/* Any vs All only means something with two tags picked. */}
                {selected.length > 1 && (
                  <span className="tagModeSwitch">
                    <button
                      type="button"
                      className={mode === 'any' ? 'on' : ''}
                      onClick={() => onMode('any')}
                    >
                      Any
                    </button>
                    <button
                      type="button"
                      className={mode === 'all' ? 'on' : ''}
                      onClick={() => onMode('all')}
                    >
                      All
                    </button>
                  </span>
                )}
                {selected.length > 0 && (
                  <button type="button" onClick={onClear}>
                    Clear
                  </button>
                )}
              </div>
            }
          />

          <hr />
          <label className="tagMenuToggle">
            <input
              type="checkbox"
              checked={grouped}
              onChange={(e) => onGrouped(e.target.checked)}
            />
            Sort by tag
          </label>
          <button type="button" onClick={() => navigate('/chat/tags')}>
            Manage tags
          </button>
        </div>
      )}
    </span>
  )
}
