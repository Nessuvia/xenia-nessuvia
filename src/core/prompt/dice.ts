// Dice notation for prompts: `2d6+3`, `d20`, or a bare `20` (one d20, as SillyTavern reads it).
// Two ways in: an inline `{{roll::1d20}}` in any block, fresh per occurrence, and a stack variable
// of kind 'dice', rolled once per send so every block that pastes it sees the same number.
// ponytail: one term plus one modifier. `2d6+1d4` or keep-highest waits until a preset needs it.

const dicePattern = /^\s*(?:(\d*)d)?(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i

// Caps keep a typo like 1000000d6 from hanging the send.
const maxCount = 100
const maxSides = 1000

/** A total for the expression, or undefined when it isn't dice notation. */
export function rollDice(expr: string, random: () => number = Math.random): number | undefined {
  const match = dicePattern.exec(expr)
  if (!match) return undefined
  const count = match[1] === undefined ? 1 : match[1] === '' ? 1 : Number(match[1])
  const sides = Number(match[2])
  if (count < 1 || count > maxCount || sides < 1 || sides > maxSides) return undefined
  let total = match[3] === '-' ? -Number(match[4]) : Number(match[4] ?? 0)
  for (let i = 0; i < count; i++) total += 1 + Math.floor(random() * sides)
  return total
}

// ST writes `{{roll::1d20}}`, `{{roll 1d20}}` and the legacy `{{roll:1d20}}`.
const inlinePattern = /\{\{roll(?:::|:|\s+)([^}]*)\}\}/gi

/** Replaces every inline roll with its own fresh total. A malformed one stays as written. */
export function rollInline(text: string, random: () => number = Math.random): string {
  if (!text.includes('{{')) return text
  return text.replace(inlinePattern, (whole, expr: string) => {
    const total = rollDice(expr, random)
    return total === undefined ? whole : String(total)
  })
}
