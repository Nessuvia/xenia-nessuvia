// Extension-ful imports on purpose (there are none yet, but keep the rule): checkNarratorBooks.ts
// runs this under `node --experimental-strip-types`.

/**
 * The lorebook ids a Narrator turn borrows: the union of every roster member's books, in roster
 * order, first mention wins. The Narrator has no books of its own, and giving it none would mean
 * narrating a world it cannot see. Two characters sharing a book must not make it count twice:
 * `resolveWorldInfo` budgets by entry, and a duplicate id would fetch the same entries again.
 *
 * Pure, and takes the id arrays rather than the characters, so it needs no store and no Dexie.
 * An absent `lorebookIds` (a card saved before the field existed) contributes nothing.
 */
export function narratorBookIds(participantBookIds: (number[] | undefined)[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const ids of participantBookIds) {
    for (const id of ids ?? []) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
  }
  return out
}
