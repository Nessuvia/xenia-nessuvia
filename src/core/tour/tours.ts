import { parseTour } from './parseTour.ts'
import type { Tour } from './types.ts'

/**
 * One file per page, named after the route it belongs to with `/` written as `.`, and a segment
 * starting with `_` standing in for a URL parameter. `chat.c._id.md` is `/chat/c/:id`. Adding a
 * tour is adding a file: there's no list to edit and no import in main.tsx.
 */
const files = import.meta.glob('./tours/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

const tours: { segments: string[]; tour: Tour }[] = Object.entries(files).map(([path, source]) => {
  const id = path.slice('./tours/'.length, -'.md'.length)
  return { segments: id.split('.'), tour: parseTour(id, source) }
})

/** The tour for a pathname, or undefined. A literal segment beats a `_` wildcard at the same depth. */
export function tourFor(pathname: string): Tour | undefined {
  const parts = pathname.split('/').filter(Boolean)
  const matches = tours.filter(({ segments }) =>
    segments.length === parts.length && segments.every((seg, i) => seg === parts[i] || seg.startsWith('_')),
  )
  const literal = matches.find(({ segments }) => segments.every((seg) => !seg.startsWith('_')))
  return (literal ?? matches[0])?.tour
}
