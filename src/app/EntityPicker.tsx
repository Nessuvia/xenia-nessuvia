import { useState } from 'react'
import { Avatar } from './Avatar'
import type { AvatarCrop } from '../core/storage/types'
import './entityPicker.css'

/** One row in the picker. `key` is the caller's: ids only identify within a kind. */
export interface PickerItem {
  key: string
  label: string
  avatar?: string
  avatarCrop?: AvatarCrop
  /** Shown at the end of the row in small caps, 'character', 'persona'. Omit for a single-kind list. */
  kind?: string
}

/**
 * The search-and-pick list: Write's cast, Ask's character select, the multiplayer roster pick.
 * Filtering and the search box live here; what the items are and what picking one does belong to
 * the caller.
 *
 * Two shapes, from the same rows. Without `selectedKeys` it is a one-shot list, click a row and
 * the caller closes it. With `selectedKeys` it stays put and rows carry their own on/off state,
 * which is what a multi-select wants.
 */
export default function EntityPicker({
  items,
  placeholder = 'Search',
  emptyText = 'No matches.',
  selectedKeys,
  disabledKeys,
  rows = 4,
  onPick,
  onCancel,
}: {
  items: PickerItem[]
  placeholder?: string
  emptyText?: string
  /** Keys currently on. Given at all, rows become toggles and keep a selected background. */
  selectedKeys?: string[]
  /** Keys that cannot be picked right now, a selection cap already met, say. */
  disabledKeys?: string[]
  /** Rows visible before the list scrolls. */
  rows?: number
  onPick: (item: PickerItem) => void
  /** Omit in a list that stays on screen: no Cancel button, and the search box does not steal focus. */
  onCancel?: () => void
}) {
  const [search, setSearch] = useState('')
  const query = search.trim().toLowerCase()
  const matches = query ? items.filter((i) => i.label.toLowerCase().includes(query)) : items
  const selectable = selectedKeys !== undefined

  return (
    <div className="panel entityPicker">
      <input
        type="search"
        className="entityPickerSearch"
        value={search}
        placeholder={placeholder}
        autoFocus={!!onCancel}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel?.()
        }}
      />
      <ul className="entityPickerList" style={{ '--pickerRows': rows } as React.CSSProperties}>
        {matches.map((item) => {
          const on = selectedKeys?.includes(item.key) ?? false
          const off = disabledKeys?.includes(item.key) ?? false
          return (
            <li key={item.key}>
              <button
                type="button"
                className={on ? 'selected' : undefined}
                aria-pressed={selectable ? on : undefined}
                disabled={off}
                onClick={() => onPick(item)}
              >
                <Avatar
                  of={{ avatar: item.avatar ?? '', avatarCrop: item.avatarCrop }}
                  name={item.label || '?'}
                />
                <span className="entityPickerName">{item.label || 'Unnamed'}</span>
                {item.kind && <span className="entityPickerKind">{item.kind}</span>}
              </button>
            </li>
          )
        })}
        {matches.length === 0 && <li className="placeholder">{emptyText}</li>}
      </ul>
      {onCancel && (
        <button type="button" className="entityPickerCancel" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  )
}
