// The History tab's grouping. Pure, for its check (checkHistoryGroups.ts).

export type GroupBy = 'date' | 'character' | 'game'

export interface Groupable {
  characterName: string
  gameLabel: string
  /** When it was played. */
  at: number
}

const month = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

/**
 * Games under a heading each. By date the headings are months, newest first; by character or game
 * they're names, A to Z. Inside a group the games run newest first.
 */
export function groupHistory<T extends Groupable>(games: T[], by: GroupBy): { label: string; games: T[] }[] {
  const newest = [...games].sort((a, b) => b.at - a.at)
  const groups = new Map<string, T[]>()
  for (const game of newest) {
    const label =
      by === 'date' ? month.format(game.at) : by === 'character' ? game.characterName : game.gameLabel
    groups.set(label, [...(groups.get(label) ?? []), game])
  }
  const list = [...groups].map(([label, inGroup]) => ({ label, games: inGroup }))
  // Months are already newest first: the games were sorted before they were grouped.
  return by === 'date' ? list : list.sort((a, b) => a.label.localeCompare(b.label))
}
