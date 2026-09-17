import { useEffect, useRef } from 'react'

/**
 * Standard dropdown dismissal: a mousedown outside the returned ref, or Escape, closes it.
 * Put the ref on the element that wraps both the trigger and the menu. A click on the trigger
 * has to count as inside, or it'd close and reopen on the same press.
 */
export function useCloseOnOutside<T extends HTMLElement = HTMLDivElement>(
  open: boolean,
  close: () => void,
) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}
