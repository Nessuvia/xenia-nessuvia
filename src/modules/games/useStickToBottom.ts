import { useEffect, useRef } from 'react'

/**
 * Keeps a box scrolled to its last line while text streams into it.
 *
 * The character's line grows inside a band of fixed height. Under the cap it gets taller,
 * which is the part worth watching; over the cap it scrolls, and without this the tail of the reply
 * would arrive out of sight.
 */
export function useStickToBottom(text: string) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const node = ref.current
    if (node) node.scrollTop = node.scrollHeight
  }, [text])
  return ref
}
