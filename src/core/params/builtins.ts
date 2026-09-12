import { localOwnerId } from '../storage/storageInterface.ts'
import type { ConnectionType, ParamDef } from './paramDef.ts'

/** Shorthand so the table below looks like a table. */
function def(
  key: string,
  label: string,
  fields: Partial<ParamDef> & Pick<ParamDef, 'kind' | 'default' | 'appliesTo'>,
): ParamDef {
  return { ownerId: localOwnerId, key, label, builtin: true, ...fields }
}

const both: ConnectionType[] = ['chat', 'text']

/**
 * The samplers seeded on first run, as ordinary rows. Editable, and once deleted they stay
 * deleted, the same contract the bundled palettes have. Nothing here is special-cased anywhere
 * else in the app; `max_tokens` and `stop` are looked up by key where the code needs them, and a
 * connection without them still sends.
 */
export function builtinParamDefs(): ParamDef[] {
  return [
    def('temperature', 'Temperature', {
      kind: 'slider', min: 0, max: 2, step: 0.01, default: 1, appliesTo: both,
      hint: 'Higher is more random.',
    }),
    def('max_tokens', 'Max tokens', {
      kind: 'number', min: 1, step: 1, default: 512, appliesTo: both,
      hint: 'Length cap on the reply.',
    }),
    def('top_p', 'Top P', {
      kind: 'slider', min: 0, max: 1, step: 0.01, default: 1, appliesTo: both,
    }),
    def('top_k', 'Top K', {
      kind: 'number', min: 0, step: 1, default: 0, appliesTo: both,
      hint: '0 disables it.',
    }),
    def('min_p', 'Min P', {
      kind: 'slider', min: 0, max: 1, step: 0.01, default: 0.05, appliesTo: both,
    }),
    def('typical_p', 'Typical P', {
      kind: 'slider', min: 0, max: 1, step: 0.01, default: 1, appliesTo: both,
    }),
    def('tfs', 'Tail free sampling', {
      kind: 'slider', min: 0, max: 1, step: 0.01, default: 1, appliesTo: both,
    }),
    def('stop', 'Stop sequences', {
      kind: 'stringList', default: [], appliesTo: both,
      hint: 'Comma-separated. Generation ends at the first match.',
    }),
    def('banned_strings', 'Banned strings', {
      kind: 'stringList', default: [], appliesTo: both,
      hint: 'Phrases the model may not produce. A rewrite stage fills this in when it is on the connection.',
    }),
    def('seed', 'Seed', {
      kind: 'number', step: 1, default: -1, appliesTo: both,
      hint: '-1 picks a new one each request.',
    }),
    def('frequency_penalty', 'Frequency penalty', {
      kind: 'slider', min: -2, max: 2, step: 0.01, default: 0, appliesTo: ['chat'],
    }),
    def('presence_penalty', 'Presence penalty', {
      kind: 'slider', min: -2, max: 2, step: 0.01, default: 0, appliesTo: ['chat'],
    }),
    def('repetition_penalty', 'Repetition penalty', {
      kind: 'slider', min: 1, max: 2, step: 0.01, default: 1, appliesTo: ['text'],
    }),
    def('repetition_penalty_range', 'Repetition penalty range', {
      kind: 'number', min: 0, step: 1, default: 0, appliesTo: ['text'],
      hint: 'Tokens back to consider. 0 is the whole context.',
    }),
    def('dry_multiplier', 'DRY multiplier', {
      kind: 'slider', min: 0, max: 5, step: 0.01, default: 0.8, appliesTo: both,
      hint: '0 disables DRY.',
    }),
    def('dry_base', 'DRY base', {
      kind: 'slider', min: 1, max: 4, step: 0.01, default: 1.75, appliesTo: both,
    }),
    def('dry_allowed_length', 'DRY allowed length', {
      kind: 'number', min: 1, step: 1, default: 2, appliesTo: both,
    }),
    def('dry_penalty_last_n', 'DRY range', {
      kind: 'number', min: -1, step: 1, default: 0, appliesTo: both,
    }),
    def('xtc_threshold', 'XTC threshold', {
      kind: 'slider', min: 0, max: 1, step: 0.01, default: 0.1, appliesTo: both,
    }),
    def('xtc_probability', 'XTC probability', {
      kind: 'slider', min: 0, max: 1, step: 0.01, default: 0, appliesTo: both,
      hint: '0 disables XTC.',
    }),
    def('mirostat', 'Mirostat', {
      kind: 'select', options: ['0', '1', '2'], default: '0', appliesTo: ['text'],
      hint: '0 off, 1 Mirostat, 2 Mirostat 2.0.',
    }),
    def('mirostat_tau', 'Mirostat tau', {
      kind: 'slider', min: 0, max: 10, step: 0.01, default: 5, appliesTo: ['text'],
    }),
    def('mirostat_eta', 'Mirostat eta', {
      kind: 'slider', min: 0, max: 1, step: 0.01, default: 0.1, appliesTo: ['text'],
    }),
  ]
}

/**
 * What "Add recommended" drops in, by connection type. Chat endpoints honor the OpenAI set; local
 * text backends honor the sampler set and mostly ignore the penalties.
 */
export const recommendedKeys: Record<ConnectionType, string[]> = {
  chat: ['temperature', 'top_p', 'max_tokens', 'frequency_penalty', 'presence_penalty', 'stop'],
  text: ['temperature', 'top_p', 'min_p', 'top_k', 'repetition_penalty', 'max_tokens', 'stop'],
}
