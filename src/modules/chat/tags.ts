// Pure tag maths over the in-memory roster. No store access, no Dexie: checkTags.ts runs this under
// `node --experimental-strip-types`, hence the explicit .ts on the type import.
import type { Character } from '../../core/storage/types.ts'

/** Characters carry tags as plain strings: the tag list is whatever the roster says it is. */
export type Taggable = Pick<Character, 'tags'>

export const UNTAGGED = 'Untagged'

export type TagMode = 'any' | 'all'

/** Every distinct tag in use, alphabetical. Case-sensitive: 'Female' and 'female' are two tags. */
export function allTags(characters: Taggable[]): string[] {
  const seen = new Set<string>()
  for (const c of characters) for (const t of c.tags ?? []) seen.add(t)
  return [...seen].sort((a, b) => a.localeCompare(b))
}

export function tagCounts(characters: Taggable[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const c of characters)
    for (const t of c.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
  return counts
}

/** Nothing selected matches everything: the filter is inert until the user picks a tag. */
export function matchesTags(c: Taggable, selected: string[], mode: TagMode): boolean {
  if (selected.length === 0) return true
  const tags = c.tags ?? []
  return mode === 'all' ? selected.every((t) => tags.includes(t)) : selected.some((t) => tags.includes(t))
}

export interface TagGroup<T> {
  tag: string
  characters: T[]
}

/**
 * Partitions the roster into groups: each character lands in exactly one, under its FIRST tag. The
 * counts sum to the roster size and no face repeats down the page. Untagged characters go to a
 * trailing group.
 *
 * `only` restricts which groups come back: the selected tags in the filter dropdown. A character
 * whose primary tag isn't selected is dropped rather than rehomed: their group is a property of the
 * character, not of what you happen to be filtering by.
 *
 * Groups are ordered biggest first; Untagged is always last regardless of size.
 */
export function groupByPrimaryTag<T extends Taggable>(characters: T[], only?: string[]): TagGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const c of characters) {
    const tag = c.tags?.[0] ?? UNTAGGED
    const group = groups.get(tag)
    if (group) group.push(c)
    else groups.set(tag, [c])
  }
  return [...groups]
    .filter(([tag]) => !only?.length || only.includes(tag))
    .map(([tag, characters]) => ({ tag, characters }))
    .sort((a, b) => {
      if (a.tag === UNTAGGED) return 1
      if (b.tag === UNTAGGED) return -1
      return b.characters.length - a.characters.length || a.tag.localeCompare(b.tag)
    })
}

/** Renames a tag on one character, keeping its position so the primary group doesn't shift. */
export function renameTag(tags: string[], from: string, to: string): string[] {
  return tags.map((t) => (t === from ? to : t))
}
