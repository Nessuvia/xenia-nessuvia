// Extension-ful imports on purpose: `storage/types.ts` imports the override shape from here, and
// the check scripts run that file's importers under `node --experimental-strip-types`. Nothing in
// this file may reach the store; the hooks that do live in `stores/pipelineStore.ts`.

/**
 * What a chat may say about Nessu's Pass, over the global default.
 *
 * Two fields, not a partial pipeline. A pipeline is a record with an id, so a chat overriding it
 * names the one it wants rather than carrying a copy that drifts from the original. The wider
 * knobs (rules, stages, weights) belong to the pipeline and are edited in one place, which is the
 * specificity call this feature makes: picking a pipeline in a chat changes that chat, and
 * editing a pipeline changes every chat using it.
 */
export interface NessuPassOverride {
  /** The auto toggle for this chat. Undefined inherits the global one. */
  enabled?: boolean
  /** Which pipeline runs here. Undefined inherits the global choice; an id whose pipeline was
   *  deleted runs nothing. */
  pipelineId?: number
}

/** The global half, in `settingsStore`. */
export interface NessuPassSettings {
  /** Whether replies are passed automatically. Off by default: the feature spends at least one
   *  extra request on every generation. The manual action on a message runs either way. */
  enabled: boolean
  /** Which pipeline runs. null, or an id whose pipeline was deleted, means nothing runs and
   *  nothing is marked as failed. */
  pipelineId: number | null
}

export const defaultNessuPass: NessuPassSettings = { enabled: false, pipelineId: null }

/** Global settings with a chat's override on top, the whole resolution order. */
export function resolveNessuPass(
  global: Partial<NessuPassSettings> | undefined,
  override: NessuPassOverride | undefined,
): NessuPassSettings {
  return {
    enabled: override?.enabled ?? global?.enabled ?? defaultNessuPass.enabled,
    pipelineId: override?.pipelineId ?? global?.pipelineId ?? defaultNessuPass.pipelineId,
  }
}
