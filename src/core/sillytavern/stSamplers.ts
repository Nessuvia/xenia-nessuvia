// SillyTavern's sampler names to ours, plus the rule that decides which of ST's ~70 keys are worth
// carrying over. A preset names every sampler its backend has ever had, nearly all of them sitting
// at a neutral value; importing all of them would open a connection with seventy rows in it.
import type { ParamDef, ParamValue } from '../params/paramDef.ts'
import { inferKind, labelFromKey } from '../params/paramDef.ts'
import { localOwnerId } from '../storage/storageInterface.ts'

/** ST's name to the key we send. Everything here already exists in `core/params/builtins.ts`. */
export const samplerKeyMap: Record<string, string> = {
  temp: 'temperature',
  top_p: 'top_p',
  top_k: 'top_k',
  min_p: 'min_p',
  typical_p: 'typical_p',
  tfs: 'tfs',
  rep_pen: 'repetition_penalty',
  rep_pen_range: 'repetition_penalty_range',
  freq_pen: 'frequency_penalty',
  presence_pen: 'presence_penalty',
  dry_multiplier: 'dry_multiplier',
  dry_base: 'dry_base',
  dry_allowed_length: 'dry_allowed_length',
  dry_penalty_last_n: 'dry_penalty_last_n',
  xtc_threshold: 'xtc_threshold',
  xtc_probability: 'xtc_probability',
  mirostat_mode: 'mirostat',
  mirostat_tau: 'mirostat_tau',
  mirostat_eta: 'mirostat_eta',
  genamt: 'max_tokens',
  // Chat-completion presets name the same three things differently.
  openai_max_tokens: 'max_tokens',
  temperature: 'temperature',
  frequency_penalty: 'frequency_penalty',
  presence_penalty: 'presence_penalty',
  repetition_penalty: 'repetition_penalty',
}

/** Connection fields rather than request params: none of these is ever sent. */
const contextLimitKeys = ['max_length', 'openai_max_context']
const endpointKeys = ['custom_url', 'reverse_proxy']
const modelKeys = ['custom_model', 'openai_model']

/**
 * Keys whose off value is neither 0, 1, '' nor false. Without these, a preset's untouched
 * `dry_base: 1.75` reads as a deliberate setting and comes along as an extra param.
 */
export const stNeutral: Record<string, number> = {
  dry_base: 1.75,
  mirostat_tau: 5,
  min_temp: 0.4,
  max_temp: 0.8,
  dynatemp_exponent: 1,
  adaptive_decay: 0.9,
  adaptive_target: -0.01,
  length_penalty: 1,
  num_beams: 1,
  encoder_rep_pen: 1,
  guidance_scale: 1,
  smoothing_curve: 1,
}

const dynatempKeys = new Set(['dynatemp', 'min_temp', 'max_temp', 'dynatemp_exponent'])
const mirostatFollowers = new Set(['mirostat_tau', 'mirostat_eta'])

/** Metadata and ST-internal wiring: never a request param. */
const skipKeys = new Set([
  'name',
  'extensions',
  'prompts',
  'prompt_order',
  'chat_completion_source',
  'assistant_prefill',
  'assistant_impersonation',
  'api_url_scale',
  'proxy_password',
  'reverse_proxy',
  'custom_url',
  'custom_model',
  'openai_model',
  'custom_include_body',
  'custom_exclude_body',
  'custom_include_headers',
  'bias_preset_selected',
  'squash_system_messages',
  'names_behavior',
  'wrap_in_quotes',
  'send_if_empty',
  'stream_openai',
  'show_external_models',
  'max_context_unlocked',
  // ST keeps its bias list as [{id, text, value}], which is its own UI's shape and not the
  // `logit_bias` any endpoint accepts. Retyping it is the only honest route.
  'logit_bias',
])

/** A whole sampler group switched off upstream: its numbers mean nothing. */
function gatedOff(key: string, preset: Record<string, unknown>): boolean {
  if (key.startsWith('dry_') && !(Number(preset.dry_multiplier) > 0)) return true
  if (dynatempKeys.has(key) && !preset.dynatemp) return true
  if (mirostatFollowers.has(key) && !(Number(preset.mirostat_mode) > 0)) return true
  return false
}

/** Whether an unmapped key holds something the user actually set. */
function meaningful(key: string, value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  if (typeof value === 'number') {
    if (key in stNeutral) return value !== stNeutral[key]
    return value !== 0 && value !== 1
  }
  return false
}

export interface PresetImport {
  params: ParamValue[]
  /** Defs for keys our library has never heard of, ready for `useParamDefs.create`. */
  newDefs: ParamDef[]
  contextLimit?: number
  endpointUrl?: string
  model?: string
  notes: string[]
}

/**
 * A ST preset as params. Mapped keys always come over, gates aside: they are a known, short list
 * and the user was sending them. Everything else has to look deliberate to make the cut.
 */
export function paramsFromPreset(preset: Record<string, unknown>): PresetImport {
  const params: ParamValue[] = []
  const newDefs: ParamDef[] = []
  const out: PresetImport = { params, newDefs, notes: [] }
  const taken = new Set<string>()
  const skippedNeutral: string[] = []

  const add = (key: string, value: unknown) => {
    if (taken.has(key)) return
    taken.add(key)
    params.push({ key, value })
  }

  for (const [stKey, value] of Object.entries(preset)) {
    if (skipKeys.has(stKey) || stKey.endsWith('_prompt') || stKey.endsWith('_format')) {
      if (endpointKeys.includes(stKey) && typeof value === 'string' && value) {
        out.endpointUrl = value
      }
      if (modelKeys.includes(stKey) && typeof value === 'string' && value) out.model = value
      continue
    }
    if (contextLimitKeys.includes(stKey)) {
      const limit = Number(value)
      if (Number.isFinite(limit) && limit > 0) out.contextLimit = limit
      continue
    }
    if (gatedOff(stKey, preset)) {
      skippedNeutral.push(stKey)
      continue
    }
    const mapped = samplerKeyMap[stKey]
    if (mapped) {
      // ST uses -1 for "top_k off"; every backend we target reads 0 as off and some reject -1.
      const fixed = mapped === 'top_k' && Number(value) < 0 ? 0 : value
      add(mapped, fixed)
      continue
    }
    if (!meaningful(stKey, value)) {
      skippedNeutral.push(stKey)
      continue
    }
    // `inferKind` stringifies an array member by member, which turns a list of objects into
    // "[object Object]". A list with any object in it is json, not a string list.
    const objectList = Array.isArray(value) && value.some((v) => v !== null && typeof v === 'object')
    const { kind, default: fallback } = objectList
      ? ({ kind: 'json', default: JSON.stringify(value) } as const)
      : inferKind(value)
    newDefs.push({
      ownerId: localOwnerId,
      key: stKey,
      label: labelFromKey(stKey),
      kind,
      default: fallback,
      appliesTo: ['chat', 'text'],
      hint: 'Imported from SillyTavern.',
    })
    add(stKey, fallback)
  }

  if (skippedNeutral.length) {
    out.notes.push(`${skippedNeutral.length} samplers left at their off value were skipped.`)
  }
  return out
}
