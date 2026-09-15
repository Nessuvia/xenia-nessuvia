// Parses `<state>` blocks in a model reply into tracker changes. Pure.

interface TrackerCommon {
  key: string
  label?: string
  /** Kept out of the prompt. */
  hidden?: boolean
}

export type TrackerDef =
  | (TrackerCommon & { type: 'number'; min: number; max: number; initial?: number; display?: 'bar' })
  | (TrackerCommon & { type: 'text'; options?: string[]; initial?: string })
  | (TrackerCommon & { type: 'list'; initial?: string[] })

export type TrackerValue = number | string | string[]

export interface StateChange {
  key: string
  value: TrackerValue
}

export interface StateFailure {
  attempted: string
  error: string
}

export interface StateParse {
  changes: StateChange[]
  failures: StateFailure[]
}

/**
 * Numbers: `+5`/`-5` is a delta, `60` is absolute.
 * Lists: `+sword` adds, `-sword` removes, `a, b` replaces.
 * Any failure in a block drops that block's changes.
 * Later blocks see earlier blocks' values.
 */
export function parseState(
  reply: string,
  defs: TrackerDef[],
  current: Record<string, TrackerValue>,
): StateParse {
  const values = { ...current }
  const changes: StateChange[] = []
  const failures: StateFailure[] = []

  const opens = reply.match(/<state>/gi)?.length ?? 0
  const blocks = [...reply.matchAll(/<state>([\s\S]*?)<\/state>/gi)]
  if (opens > blocks.length) failures.push({ attempted: reply.slice(reply.toLowerCase().lastIndexOf('<state>')).trim(), error: 'The state block has no closing tag.' })

  for (const block of blocks) {
    const pending: StateChange[] = []
    const blockFailures: StateFailure[] = []
    const next = { ...values }
    for (const raw of block[1].split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const result = parseLine(line, defs, next)
      if ('error' in result) blockFailures.push({ attempted: line, error: result.error })
      else {
        next[result.key] = result.value
        pending.push(result)
      }
    }
    if (blockFailures.length) {
      failures.push(...blockFailures)
      continue
    }
    Object.assign(values, next)
    changes.push(...pending)
  }
  return { changes, failures }
}

function parseLine(line: string, defs: TrackerDef[], values: Record<string, TrackerValue>): StateChange | { error: string } {
  const colon = line.indexOf(':')
  if (colon < 1) return { error: 'Expected "key: value".' }
  const key = line.slice(0, colon).trim()
  const input = line.slice(colon + 1).trim()
  const def = defs.find((d) => d.key.toLowerCase() === key.toLowerCase())
  if (!def) return { error: `Unknown tracker "${key}".` }
  if (!input) return { error: `No value for "${def.key}".` }

  if (def.type === 'number') {
    const m = /^([+-]?)(\d+(?:\.\d+)?)$/.exec(input)
    if (!m) return { error: `"${input}" is an invalid number.` }
    const n = Number(m[2])
    const base = typeof values[def.key] === 'number' ? (values[def.key] as number) : def.min
    const value = m[1] === '+' ? base + n : m[1] === '-' ? base - n : n
    if (value < def.min || value > def.max) return { error: `${def.key} would be ${value}, outside ${def.min} to ${def.max}.` }
    return { key: def.key, value }
  }

  if (def.type === 'text') {
    const option = def.options?.find((o) => o.toLowerCase() === input.toLowerCase())
    if (def.options && !option) return { error: `"${input}" is an invalid ${def.key}. Options: ${def.options.join(', ')}.` }
    return { key: def.key, value: option ?? input }
  }

  const list = Array.isArray(values[def.key]) ? (values[def.key] as string[]) : []
  const sign = input[0]
  if (sign === '+' || sign === '-') {
    const item = input.slice(1).trim()
    if (!item) return { error: `No item after "${sign}".` }
    const at = list.findIndex((x) => x.toLowerCase() === item.toLowerCase())
    if (sign === '+') return { key: def.key, value: at < 0 ? [...list, item] : list }
    if (at < 0) return { error: `"${item}" is missing from ${def.key}.` }
    return { key: def.key, value: list.filter((_, i) => i !== at) }
  }
  return { key: def.key, value: input.split(',').map((x) => x.trim()).filter(Boolean) }
}
