import { useRef } from 'react'

/**
 * Touch's stand-in for right-click. Returns props to spread on the element. The timer is cancelled
 * if the finger moves or lifts first: a scroll drag over a card never fires it.
 *
 * touch only. Mouse users already have onContextMenu, and running this for both means
 * a click-and-hold on the desktop opens a menu nobody asked for.
 */
export function useLongPress(onLongPress: (x: number, y: number) => void, ms = 500) {
  const timer = useRef<number | undefined>(undefined)

  const cancel = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return
      const { clientX, clientY } = e
      cancel()
      timer.current = window.setTimeout(() => onLongPress(clientX, clientY), ms)
    },
    onPointerMove: cancel,
    onPointerUp: cancel,
    onPointerCancel: cancel,
  }
}
