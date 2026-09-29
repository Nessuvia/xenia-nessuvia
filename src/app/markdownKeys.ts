const markers: Record<string, string> = { b: '**', i: '*', u: '__', k: '`', x: '~~' }

/** Ctrl+B/I/U/K and Ctrl+Shift+X: the markdown marker the key wraps a selection in, or null. */
export function markdownMarker(e: { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }): string | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const key = e.key.toLowerCase()
  if (key === 'x') return e.shiftKey ? markers.x : null
  return e.shiftKey ? null : markers[key] ?? null
}

/** The text with [start, end) wrapped in the marker, and where the selection lands inside it. */
export function wrapSelection(text: string, start: number, end: number, marker: string) {
  return {
    text: text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end),
    start: start + marker.length,
    end: end + marker.length,
  }
}
