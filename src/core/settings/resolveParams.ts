// Extension-ful imports on purpose: checkResolveParams.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { Connection } from '../stores/settingsStore'
import type { Character, ParamOverrides } from '../storage/types'

/** The innermost override layer. A Chat satisfies it, and so does a Story, Write has the same
 *  per-work overrides the chat side has, and neither needs the rest of the record here. */
export interface ParamScope {
  paramOverrides?: ParamOverrides
}

/** Fields a chat or character may patch that aren't request params. Names mirror Connection
 *  exactly. Every sampler is overridable too, by key, see `paramOverrides.params`. */
export type OverridableField = Exclude<keyof ParamOverrides, 'params'>

export const overridableFields: OverridableField[] = ['contextLimit', 'safetyMarginPct']

/** Where a value comes from, under `chat > character > connection`. `'chat'` names the innermost
 *  layer, whatever record that is, a Story passes through the same arm. */
export type ParamSource = 'chat' | 'character' | 'connection'

/** Unset means absent, not falsy. `temperature: 0` is a real value. A blank string is the
 *  exception: nothing there to use, and it falls through. */
function isSet(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

/** Where one of the non-param fields comes from. */
export function paramSource(
  field: OverridableField,
  _connection: Connection,
  character?: Character,
  chat?: ParamScope,
): ParamSource {
  if (isSet(chat?.paramOverrides?.[field])) return 'chat'
  if (isSet(character?.paramOverrides?.[field])) return 'character'
  return 'connection'
}

/** Where one sampler's value comes from, by its JSON key. Same precedence, same isSet rules. */
export function paramSourceFor(key: string, character?: Character, chat?: ParamScope): ParamSource {
  if (isSet(chat?.paramOverrides?.params?.[key])) return 'chat'
  if (isSet(character?.paramOverrides?.params?.[key])) return 'character'
  return 'connection'
}

/**
 * The connection as it should actually be used for this chat: chat override, else character
 * override, else the connection's own value. Field by field, patch not replace. Never mutates.
 *
 * Overrides only reach params the connection already carries. A character can change what
 * `temperature` is, but it cannot add a sampler the connection does not send, which knobs exist
 * is the connection's decision, and what they're set to is the chat's.
 */
export function resolveParams(
  connection: Connection,
  character?: Character,
  chat?: ParamScope,
): Connection {
  const out: Connection = { ...connection }
  for (const field of overridableFields) {
    const source = paramSource(field, connection, character, chat)
    if (source === 'connection') continue
    const overrides = source === 'chat' ? chat!.paramOverrides! : character!.paramOverrides!
    // Assignment through a union of field types needs the cast; the key set is the same on both.
    ;(out as unknown as Record<string, unknown>)[field] = overrides[field]
  }
  out.params = (connection.params ?? []).map((param) => {
    const source = paramSourceFor(param.key, character, chat)
    if (source === 'connection') return param
    const overrides = source === 'chat' ? chat!.paramOverrides! : character!.paramOverrides!
    return { ...param, value: overrides.params![param.key] }
  })
  return out
}
