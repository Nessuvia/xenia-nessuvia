// Tracker values over a chat. Pure: folds per-swipe updates and player overrides down the history.
// Extension-ful imports on purpose: check scripts run this under `node --experimental-strip-types`.
import type { StateParse, TrackerDef, TrackerValue } from './parseState.ts'

export type TrackerValues = Record<string, TrackerValue>

/** What the fold needs off a message. Structural, so checks can pass plain objects. */
export interface TrackedMessage {
  role: 'user' | 'assistant'
  swipeIndex?: number
  /** The parse of each swipe, parallel to `swipes`. Changes hold absolute values. */
  trackerUpdates?: (StateParse | undefined)[]
  /** Player edits made while this was the last message. Apply after the selected swipe's changes. */
  trackerOverrides?: TrackerValues
}

export function initialValues(defs: TrackerDef[]): TrackerValues {
  const values: TrackerValues = {}
  for (const d of defs) {
    if (d.type === 'number') values[d.key] = d.initial ?? d.min
    else if (d.type === 'text') values[d.key] = d.initial ?? d.options?.[0] ?? ''
    else values[d.key] = d.initial ?? []
  }
  return values
}

/**
 * Values after the last message. The selected swipe decides which changes count, so swiping rolls
 * back. Overrides sit on the message and outlive its swipes.
 */
export function trackerValues(defs: TrackerDef[], messages: TrackedMessage[], base?: TrackerValues): TrackerValues {
  const values = { ...initialValues(defs), ...base }
  for (const m of messages) {
    if (m.role === 'assistant') {
      for (const c of m.trackerUpdates?.[m.swipeIndex ?? 0]?.changes ?? []) values[c.key] = c.value
    }
    Object.assign(values, m.trackerOverrides)
  }
  return values
}

/** Records a parse against the selected swipe, padding the array to the swipe count. */
export function withTrackerUpdate<T extends TrackedMessage & { swipes?: string[] }>(message: T, update: StateParse): T {
  const count = Math.max(1, message.swipes?.length ?? 1)
  const trackerUpdates = [...(message.trackerUpdates ?? [])]
  trackerUpdates.length = count
  trackerUpdates[Math.min(message.swipeIndex ?? 0, count - 1)] = update
  return { ...message, trackerUpdates }
}

/** Display only. The stored message keeps its tags. */
export function stripState(text: string): string {
  if (!/<state>/i.test(text)) return text
  return text.replace(/\s*<state>[\s\S]*?(<\/state>|$)/gi, '').trimEnd()
}

const show = (v: TrackerValue) => (Array.isArray(v) ? v.join(', ') || 'none' : String(v))

/** The system turn the model reads. Empty when every tracker is hidden. */
export function trackerPrompt(defs: TrackerDef[], values: TrackerValues): string {
  const lines = defs
    .filter((d) => !d.hidden)
    .map((d) => {
      const value = show(values[d.key] ?? initialValues([d])[d.key])
      if (d.type === 'number') return `${d.key}: ${value} (${d.min} to ${d.max})`
      if (d.type === 'text' && d.options) return `${d.key}: ${value} (${d.options.join(', ')})`
      return `${d.key}: ${value}`
    })
  if (!lines.length) return ''
  return [
    'Trackers:',
    ...lines,
    'To change trackers, end the reply with a <state> block holding one "key: value" line each.',
    'A number takes +5 or -5 to shift it. A list takes +item or -item.',
  ].join('\n')
}

/** Card JSON to defs. Invalid entries drop. Keys stay condition-safe and unique. */
export function readTrackers(raw: unknown): TrackerDef[] {
  if (!Array.isArray(raw)) return []
  const out: TrackerDef[] = []
  const seen = new Set<string>()
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  for (const r of raw as Record<string, unknown>[]) {
    const key = str(r?.key)
    if (!key || !/^[A-Za-z0-9_]+$/.test(key) || seen.has(key.toLowerCase())) continue
    const common = { key, label: str(r.label), hidden: r.hidden === true || undefined }
    if (r.type === 'number') {
      const min = num(r.min)
      const max = num(r.max)
      if (min === undefined || max === undefined || min > max) continue
      const initial = num(r.initial)
      out.push({
        ...common,
        type: 'number',
        min,
        max,
        initial: initial !== undefined && initial >= min && initial <= max ? initial : undefined,
        display: r.display === 'bar' ? 'bar' : undefined,
      })
    } else if (r.type === 'text') {
      const options = Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === 'string') : undefined
      const initial = str(r.initial)
      out.push({
        ...common,
        type: 'text',
        options: options?.length ? options : undefined,
        initial: initial !== undefined && (!options?.length || options.includes(initial)) ? initial : undefined,
      })
    } else if (r.type === 'list') {
      out.push({
        ...common,
        type: 'list',
        initial: Array.isArray(r.initial) ? r.initial.filter((o): o is string => typeof o === 'string') : undefined,
      })
    } else continue
    seen.add(key.toLowerCase())
  }
  return out
}
