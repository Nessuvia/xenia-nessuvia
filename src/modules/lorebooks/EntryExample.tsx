import { useState } from 'react'
import { RiDeleteBinLine } from '@remixicon/react'
import { CollapseButton } from '../../app/CollapseButton'

/** View state only, so it's not in Dexie and not in a backup. '0' means open. */
const storageKey = 'nessuTavern.lorebooksExample'

/**
 * A dead copy of an entry row, with every control disabled and its placeholder saying what the
 * control does. Same markup and classes as EntryRows on purpose: the point is that the reader can
 * match a field here against the same field one row down.
 */
export default function EntryExample() {
  // Closed until asked for: the rows below explain themselves once you've read this once.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(storageKey) !== '0')

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(storageKey, next ? '1' : '0')
  }

  return (
    <div className="lorebooksExample">
      <div className="lorebooksExampleHeader">
        <span className="lorebooksExampleTitle">What an entry does</span>
        <CollapseButton label="the example entry" collapsed={collapsed} onToggle={toggle} />
      </div>

      {!collapsed && (
        <div className="card lorebooksEntry lorebooksExampleCard">
          <div className="lorebooksEntryRow">
            <input type="checkbox" checked disabled aria-label="Enabled" />
            <input
              className="lorebooksEntryName"
              disabled
              placeholder="Name"
            />
            <input
              className="lorebooksEntryKeys"
              disabled
              placeholder="Strings to match by"
            />
            <label className="lorebooksEntryFlag">
              <input type="checkbox" disabled />
              Always
            </label>
            <input
              className="lorebooksEntryNumber"
              disabled
              aria-label="Scan depth"
              placeholder="4"
              title="Messages searched for the keys. Blank uses the book's setting."
            />
            <button type="button" disabled>
              Text
            </button>
            <button type="button" className="danger iconButton" disabled aria-label="Delete entry">
              <RiDeleteBinLine size={16} />
            </button>
          </div>

          <p className="hint lorebooksExampleNote">
            Always sends the entry every turn and ignores the keys. The number is how many recent
            messages are searched; blank uses the book's scan depth. Text opens the rest.
          </p>

          <div className="lorebooksEntryRow">
            <input
              className="lorebooksEntryKeys"
              disabled
              placeholder="Secondary keys"
            />
            <select disabled aria-label="Secondary key rule">
              <option>Any secondary</option>
            </select>
            <label className="lorebooksEntryFlag">
              <input type="checkbox" disabled />
              Case sensitive
            </label>
            <select disabled aria-label="Position">
              <option>Before character</option>
            </select>
          </div>

          <p className="hint lorebooksExampleNote">
            Position is where the text lands: before or after the character, or a set number of
            messages from the end of the chat.
          </p>

          <textarea
            className="lorebooksEntryText lorebooksExampleText"
            disabled
            placeholder={
              'The text added to the prompt when the entry fires. Write it as fact, the way the ' +
              'character description is written:\n\nThe Sylvani live in the flooded forest east of ' +
              'the capital. They trade in salt and will not enter a house uninvited.'
            }
          />
        </div>
      )}
    </div>
  )
}
