import { useRef, useState } from 'react'
import { useDraft } from '../../core/stores/draftStore'
import { useSettings } from '../../core/stores/settingsStore'
import { markdownMarker, wrapSelection } from '../../app/markdownKeys'
import { completeWith, menuFor } from '../../core/stores/slashCommands'
import type { CharacterTarget } from '../../core/stores/slashCommands'
import PersonaSwitcher from '../../app/PersonaSwitcher'
import CommandMenu from './CommandMenu'

export default function Composer({
  streaming,
  disabledReason,
  commandTargets,
  onSend,
  onStop,
  onRegenLast,
}: {
  streaming: boolean
  disabledReason: string
  /** The roster `/sendas` completes against. Omitted means no command menu. */
  commandTargets?: CharacterTarget[]
  onSend: (text: string) => void
  onStop: () => void
  /** Submit with nothing typed: re-roll the last reply with an instruction instead. */
  onRegenLast: () => void
}) {
  const text = useDraft((s) => s.text)
  const setText = useDraft((s) => s.setText)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const blocked = !!disabledReason || streaming
  const onPhone = window.matchMedia('(max-width: 700px)').matches

  const menu = commandTargets && !dismissed ? menuFor(text, commandTargets) : null
  const index = menu ? Math.min(active, menu.items.length - 1) : 0

  function write(next: string) {
    setText(next)
    setActive(0)
    box.current?.focus()
  }

  function pick(i: number) {
    if (!menu) return
    write(completeWith(text, menu.items[i]))
  }

  function submit() {
    if (blocked) return
    if (!text.trim()) {
      onRegenLast()
      return
    }
    onSend(text)
    setText('')
    setActive(0)
  }

  return (
    <div className="composer">
      {menu && <CommandMenu menu={menu} active={index} onHover={setActive} onPick={pick} />}
      <textarea
        ref={box}
        rows={3}
        value={text}
        placeholder={disabledReason || (onPhone ? 'Message…' : 'Message… (Enter sends, Shift+Enter for a newline)')}
        disabled={!!disabledReason}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setDismissed(false)
        }}
        onKeyDown={(e) => {
          if (menu) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const step = e.key === 'ArrowDown' ? 1 : menu.items.length - 1
              setActive((i) => (Math.min(i, menu.items.length - 1) + step) % menu.items.length)
              return
            }
            if (e.key === 'Escape') {
              setDismissed(true)
              return
            }
            if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
              e.preventDefault()
              pick(index)
              return
            }
          }
          const marker = useSettings.getState().hotkeysOff ? null : markdownMarker(e)
          if (marker) {
            e.preventDefault()
            const el = e.currentTarget
            const next = wrapSelection(text, el.selectionStart, el.selectionEnd, marker)
            setText(next.text)
            requestAnimationFrame(() => el.setSelectionRange(next.start, next.end))
            return
          }
          // Ctrl+Enter and Alt+Enter are ChatView's regenerate and continue.
          if (onPhone || e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
          e.preventDefault()
          submit()
        }}
      />
      <div className="composerControls">
        <PersonaSwitcher />
        {streaming ? (
          <button type="button" aria-keyshortcuts="Escape" title="Stop (Escape)" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="button" disabled={blocked || !text.trim()} onClick={submit}>
            Send
          </button>
        )}
      </div>
    </div>
  )
}
