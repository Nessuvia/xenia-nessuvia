/**
 * Fontsource catalog fetch + client-side search. The Fontsource list endpoint is exact-match only
 * on `?family=`, not usable for a typeahead. The whole catalog is fetched once per session
 * and filtered here. Only `family`, `id`, and `category` are kept: the picker is family-only this
 * phase; weights and subsets are dropped.
 */

export interface FontsourceFont {
  family: string
  id: string
  category: string
}

interface RawFontsourceFont {
  id: string
  family: string
  category: string
}

const endpoint = 'https://api.fontsource.org/v1/fonts'

let cached: FontsourceFont[] | null = null
let pending: Promise<FontsourceFont[]> | null = null

/** The catalog, fetched once per session and reused after. A reload re-fetches. */
export async function listFonts(): Promise<FontsourceFont[]> {
  if (cached) return cached
  if (pending) return pending
  pending = fetch(endpoint)
    .then((res) => {
      if (!res.ok) throw new Error(`Fontsource catalog: ${res.status}`)
      return res.json() as Promise<RawFontsourceFont[]>
    })
    .then((rows) => {
      cached = rows.map(({ id, family, category }) => ({ id, family, category }))
      return cached
    })
    .finally(() => {
      pending = null
    })
  return pending
}

/**
 * Case-insensitive substring filter on the family name, then a slice for the page. Kept separate
 * from `listFonts`: trivial to exercise without a network. Empty query returns the whole
 * catalog's first page, the same as typing nothing into the search box.
 */
export function searchFonts(
  catalog: FontsourceFont[],
  query: string,
  page: number,
  pageSize = 10,
): FontsourceFont[] {
  const q = query.trim().toLowerCase()
  const filtered = q ? catalog.filter((f) => f.family.toLowerCase().includes(q)) : catalog
  const start = page * pageSize
  return filtered.slice(start, start + pageSize)
}
