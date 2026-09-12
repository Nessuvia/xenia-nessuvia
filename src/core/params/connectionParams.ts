// Extension-ful imports on purpose: the check* scripts run this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Connection } from '../stores/settingsStore'
import type { Budget } from '../prompt/budget'
import type { ParamDef, ParamValue } from './paramDef.ts'
import { recommendedKeys } from './builtins.ts'

/** What the app assumes when a connection carries no `max_tokens` param. The budget needs a reply
 *  reserve whether or not the user added the knob, and this is the same number the def defaults to. */
export const fallbackMaxTokens = 512

/** A param's raw value, or undefined when the connection doesn't carry it. The `?? []` covers a
 *  Connection that reached here from outside the settings store, where the shape isn't normalized. */
export function getParam(connection: Connection, key: string): unknown {
  return (connection.params ?? []).find((p) => p.key === key)?.value
}

/** A numeric param, falling back when the connection doesn't carry it or the value isn't a number. */
export function numberParam(connection: Connection, key: string, fallback: number): number {
  const value = Number(getParam(connection, key))
  return Number.isFinite(value) ? value : fallback
}

/** The reply reserve the token budget subtracts. Reads the same key the request body sends. */
export function maxTokensOf(connection: Connection): number {
  return numberParam(connection, 'max_tokens', fallbackMaxTokens)
}

/**
 * The three numbers the token budget needs. `max_tokens` is a request param, the other two
 * aren't. This is where the two halves come back together. Every trimHistory caller goes
 * through here rather than passing a Connection and hoping the field names line up.
 */
export function budgetOf(connection: Connection): Budget
export function budgetOf(connection: Connection | undefined): Budget | undefined
export function budgetOf(connection: Connection | undefined): Budget | undefined {
  if (!connection) return undefined
  return {
    contextLimit: connection.contextLimit,
    safetyMarginPct: connection.safetyMarginPct,
    maxTokens: maxTokensOf(connection),
  }
}

/** A copy with one param set, appended at the end when the connection didn't carry it. */
export function withParam(connection: Connection, key: string, value: unknown): Connection {
  const params = connection.params.some((p) => p.key === key)
    ? connection.params.map((p) => (p.key === key ? { ...p, value } : p))
    : [...connection.params, { key, value }]
  return { ...connection, params }
}

/** A copy without one param. The key stops being sent. */
export function withoutParam(connection: Connection, key: string): Connection {
  return { ...connection, params: connection.params.filter((p) => p.key !== key) }
}

/**
 * The recommended set for a connection type, as params at their defaults. Params already on the
 * connection keep the value the user gave them.
 */
export function recommendedParams(connection: Connection, defs: ParamDef[]): ParamValue[] {
  const byKey = new Map(defs.map((d) => [d.key, d]))
  const params = [...connection.params]
  for (const key of recommendedKeys[connection.type]) {
    const def = byKey.get(key)
    // A recommended def the user deleted from the library stays deleted.
    if (!def || params.some((p) => p.key === key)) continue
    params.push({ key, value: def.default })
  }
  return params
}

/** Defs a connection can still add: the right type, and not already on it. */
export function availableDefs(connection: Connection, defs: ParamDef[]): ParamDef[] {
  const taken = new Set(connection.params.map((p) => p.key))
  return defs.filter((d) => d.appliesTo.includes(connection.type) && !taken.has(d.key))
}
