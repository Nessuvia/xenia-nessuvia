// Extension-ful imports on purpose: the check scripts run this file's importers under
// `node --experimental-strip-types`. Nothing here may reach the store, for the same reason.

/**
 * Gold Pass: a second model, on a second connection, rewrites the assistant reply the first model
 * produced. The rewrite becomes the message, so the first model reads its own rewritten history on
 * the next turn.
 *
 * Not Second Pass. Second Pass runs deterministic rules and an optional edit request on the *same*
 * connection, driven by what got flagged. This is a different connection, a different system
 * prompt, a deliberately slim window, and it runs whether or not anything was flagged. The two
 * stack: Second Pass cleans the first pass, Gold Pass rewrites what Second Pass produced.
 */
export interface GoldPreset {
  id: string
  label: string
  text: string
}

export interface GoldPassSettings {
  /** The auto toggle. Global here, per chat on `Chat.goldPass`. */
  enabled: boolean
  /** Which connection rewrites. '' = nothing runs. Named outright rather than falling back to the
   *  active connection: the point of the feature is a *second* model, and silently rewriting with
   *  the connection that just wrote the reply is the one thing it must not do. */
  connectionId: string
  /** Ships empty, like `SecondPassSettings.rules`. A rewrite prompt is an opinion about prose. */
  presets: GoldPreset[]
  /** The active preset. '' or a stale id = nothing runs, and nothing is marked as failed. */
  presetId: string
  /** How many messages before the one being rewritten go in the window. */
  historyCount: number
  /** Put the character's description in the window. */
  includeCharacter: boolean
  /** Rewrite/original character-length ratio band. Outside it, the rewrite is rejected. */
  minRatio: number
  maxRatio: number
}

export const defaultGoldPass: GoldPassSettings = {
  enabled: false,
  connectionId: '',
  presets: [],
  presetId: '',
  historyCount: 5,
  includeCharacter: true,
  minRatio: 0.6,
  maxRatio: 2.0,
}

/**
 * Global settings with a chat's override on top, the whole resolution order. Merged over the
 * defaults first, so a settings blob persisted before a field existed still resolves every field.
 */
export function resolveGoldPass(
  global: Partial<GoldPassSettings> | undefined,
  override: Partial<GoldPassSettings> | undefined,
): GoldPassSettings {
  return { ...defaultGoldPass, ...global, ...override }
}

/** The active preset, or undefined when `presetId` is empty or names one that was deleted. */
export function activePreset(settings: GoldPassSettings): GoldPreset | undefined {
  return settings.presets.find((p) => p.id === settings.presetId)
}

export function newGoldPreset(): GoldPreset {
  return { id: crypto.randomUUID(), label: '', text: '' }
}
