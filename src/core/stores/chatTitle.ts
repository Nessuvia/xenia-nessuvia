/** `{{char}}-mm_dd_yyyy`, plus `-2`, `-3`, etc when that title is already taken. */
export function chatTitle(name: string, at: number, existing: string[]): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  const base = `${name}-${pad(d.getMonth() + 1)}_${pad(d.getDate())}_${d.getFullYear()}`
  if (!existing.includes(base)) return base
  let n = 2
  while (existing.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
