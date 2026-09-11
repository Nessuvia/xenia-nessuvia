import type { Chat } from '../storage/types'
import type { Connection } from '../stores/settingsStore'
import { useSettings } from '../stores/settingsStore'
import { isSentinel } from '../connectors/sentinel'
import { activePreset, resolveGoldPass, type GoldPassSettings } from './goldPassSettings'

/** Global defaults with this chat's override on top. A chat with no override inherits global. */
export function goldPassFor(chat: Chat | null | undefined): GoldPassSettings {
  return resolveGoldPass(useSettings.getState().goldPass, chat?.goldPass)
}

/**
 * The connection Gold Pass rewrites with, or undefined when it has none.
 *
 * Named outright, with no fallback to the active connection: `resolveConnection`'s fallback is
 * right for Second Pass, which edits on the same model anyway, and wrong here. Rewriting with the
 * connection that just wrote the reply is the one thing this feature must not do silently.
 *
 * The sentinel counts as none. It answers with a fixed line rather than model output, which would
 * be stored as the reply.
 */
export function goldConnection(settings: GoldPassSettings): Connection | undefined {
  if (!settings.connectionId) return undefined
  const found = useSettings.getState().connections.find((c) => c.id === settings.connectionId)
  return found && !isSentinel(found.endpointUrl) ? found : undefined
}

/**
 * Whether Gold Pass would actually run. A missing connection or a `presetId` naming a preset that
 * was deleted means it was never armed: nothing runs, and nothing is marked as failed.
 *
 * `enabled` is left out on purpose. It is the *auto* toggle; the manual action on a message runs
 * against an armed setup whether or not replies are rewritten automatically.
 */
export function goldArmed(settings: GoldPassSettings): boolean {
  return !!goldConnection(settings) && !!activePreset(settings)
}
