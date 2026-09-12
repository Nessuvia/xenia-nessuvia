// Extension-ful imports on purpose: the check* scripts run this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import { localOwnerId } from '../storage/storageInterface.ts'

/** What a connection speaks. `chat` posts `messages` to /chat/completions; `text` posts a flattened
 *  `prompt` string to /completions. */
export type ConnectionType = 'chat' | 'text'

/** How a param renders and how its value is coerced before it goes in the body. */
export type ParamKind = 'number' | 'slider' | 'text' | 'bool' | 'select' | 'stringList' | 'json'

/**
 * One form element in the sampler library. A def is data rather than code: the built-ins are
 * seeded rows and a user-made one is the same shape. A sampler nobody has heard of yet needs
 * no release.
 */
export interface ParamDef {
  id?: number
  ownerId: string
  /** The JSON key sent in the request body, e.g. `dry_multiplier`. Unique across the library:
   *  a connection's params reference a def by this, not by row id, so the reference survives
   *  export, import and a re-seed on another device. */
  key: string
  label: string
  kind: ParamKind
  min?: number
  max?: number
  step?: number
  /** kind: 'select' only. */
  options?: string[]
  default: unknown
  appliesTo: ConnectionType[]
  /** One plain line under the input. */
  hint?: string
  /** Seeded with the build. Editable, and once deleted it stays deleted. */
  builtin?: boolean
}

/** A param added to a connection, in the order the user arranged it. */
export interface ParamValue {
  key: string
  value: unknown
}

/**
 * How a text-completion connection turns a message list into one string. Which template works is a
 * property of the model behind the endpoint. It lives on the connection next to `model`.
 */
export interface InstructTemplate {
  systemPrefix: string
  systemSuffix: string
  userPrefix: string
  userSuffix: string
  modelPrefix: string
  modelSuffix: string
  /** Emitted once at the very front, a BOS token like `<|begin_of_text|>`. */
  firstPrefix?: string
  stopSequences: string[]
  trimTrailingSpace: boolean
  /** Replaces `modelPrefix` on the first assistant turn only. Alpaca-likes open differently. */
  firstModelPrefix?: string
  /** Replaces `modelPrefix` on the open turn at the end. Where a "stay in character" nudge goes. */
  lastModelPrefix?: string
  /** Wrap system turns in the user sequences. Some formats have no system role at all. */
  systemAsUser?: boolean
  /** Put each sequence on its own line. Alpaca needs it, ChatML must not have it. */
  wrapNewlines?: boolean
  /** Expand `{{char}}` and friends inside the sequences themselves. On unless turned off. */
  expandMacros?: boolean
  /** Send every sequence as a stop string too. Keeps the model from writing the next turn itself. */
  sequencesAsStops?: boolean
  /** Whether a turn is labelled with its speaker's name. `group` means only in a group chat. */
  names?: NamesBehavior
  /** Text the reply is forced to begin with, written after the open model prefix. */
  prefill?: string
  /** Think-block handling for this model. Unset falls back to the global tag rules. */
  reasoning?: ReasoningConfig
}

/** When a turn is prefixed with who is speaking. */
export type NamesBehavior = 'never' | 'always' | 'group'

/**
 * Where a model's thinking starts and ends, and what happens to it afterwards. It belongs to the
 * model rather than to the app, and sits on the connection accordingly: the same chat viewed
 * through two connections can have two different think markers in its history.
 */
export interface ReasoningConfig {
  prefix: string
  suffix: string
  /** Split the block out of the reply as it arrives. Off means the markers are left in the text. */
  autoParse: boolean
  /** Send past think blocks back in later prompts. Off is the usual choice: they burn context. */
  sendBack: boolean
  /** How many of the most recent turns keep their think block when `sendBack` is on. */
  maxSendBack?: number
}

/** ChatML: what a text connection sends before anyone edits the template. */
export function defaultTemplate(): InstructTemplate {
  return {
    systemPrefix: '<|im_start|>system\n',
    systemSuffix: '<|im_end|>\n',
    userPrefix: '<|im_start|>user\n',
    userSuffix: '<|im_end|>\n',
    modelPrefix: '<|im_start|>assistant\n',
    modelSuffix: '<|im_end|>\n',
    stopSequences: ['<|im_end|>'],
    trimTrailingSpace: true,
  }
}

/**
 * Instruct formats for the models people actually run locally. These are facts about a model
 * rather than taste, and unlike a Second Sweep pipeline they ship: a user pointing at a Llama 3
 * build gets a first reply without retyping `<|start_header_id|>` from memory.
 */
export const templatePresets: { name: string; template: () => InstructTemplate }[] = [
  { name: 'ChatML', template: defaultTemplate },
  {
    name: 'Llama 3',
    template: () => ({
      systemPrefix: '<|start_header_id|>system<|end_header_id|>\n\n',
      systemSuffix: '<|eot_id|>',
      userPrefix: '<|start_header_id|>user<|end_header_id|>\n\n',
      userSuffix: '<|eot_id|>',
      modelPrefix: '<|start_header_id|>assistant<|end_header_id|>\n\n',
      modelSuffix: '<|eot_id|>',
      firstPrefix: '<|begin_of_text|>',
      stopSequences: ['<|eot_id|>', '<|end_of_text|>'],
      trimTrailingSpace: true,
    }),
  },
  {
    name: 'Mistral',
    template: () => ({
      // Mistral has no system role: the system text rides in the user turn.
      systemPrefix: '[INST] ',
      systemSuffix: '[/INST]',
      userPrefix: '[INST] ',
      userSuffix: '[/INST]',
      modelPrefix: ' ',
      modelSuffix: '</s>',
      firstPrefix: '<s>',
      stopSequences: ['</s>', '[INST]'],
      trimTrailingSpace: false,
      systemAsUser: true,
    }),
  },
  {
    name: 'Alpaca',
    template: () => ({
      systemPrefix: '',
      systemSuffix: '',
      userPrefix: '### Instruction:',
      userSuffix: '',
      modelPrefix: '### Response:',
      modelSuffix: '',
      stopSequences: ['### Instruction:'],
      trimTrailingSpace: true,
      wrapNewlines: true,
    }),
  },
  {
    name: 'Gemma 2',
    template: () => ({
      // Gemma has no system role either, and its user turn is where system text goes.
      systemPrefix: '<start_of_turn>user\n',
      systemSuffix: '<end_of_turn>\n',
      userPrefix: '<start_of_turn>user\n',
      userSuffix: '<end_of_turn>\n',
      modelPrefix: '<start_of_turn>model\n',
      modelSuffix: '<end_of_turn>\n',
      firstPrefix: '<bos>',
      stopSequences: ['<end_of_turn>'],
      trimTrailingSpace: true,
      systemAsUser: true,
    }),
  },
  {
    name: 'Command R',
    template: () => ({
      systemPrefix: '<|START_OF_TURN_TOKEN|><|SYSTEM_TOKEN|>',
      systemSuffix: '<|END_OF_TURN_TOKEN|>',
      userPrefix: '<|START_OF_TURN_TOKEN|><|USER_TOKEN|>',
      userSuffix: '<|END_OF_TURN_TOKEN|>',
      modelPrefix: '<|START_OF_TURN_TOKEN|><|CHATBOT_TOKEN|>',
      modelSuffix: '<|END_OF_TURN_TOKEN|>',
      firstPrefix: '<BOS_TOKEN>',
      stopSequences: ['<|END_OF_TURN_TOKEN|>'],
      trimTrailingSpace: true,
    }),
  },
]

/**
 * A `stringList` as one line of comma-separated text, and back.
 *
 * The escapes exist because the values that matter most in these lists are whitespace. DRY's
 * sequence breakers are `["\n", ":", "\"", "*"]` and a stop string is often a bare newline; a
 * single-line input cannot hold either, and trimming each entry deleted them outright. An empty
 * list then means "omit the key", and a backend that requires a non-empty array rejects the
 * request.
 *
 * `\n`, `\t` and `\r` are the whitespace entries, `\,` a literal comma, and `\\` a backslash.
 * Anything else after a backslash is that character. A lone backslash in a stop string survives
 * rather than eating the next one.
 *
 * The one thing that cannot be written is a plain space at the start or end of an entry: the spaces
 * after a comma are the user's typing and are trimmed, and no escape survives that trim. Write `\t`
 * where a real space-like separator is wanted. Nothing a backend takes here needs one.
 */
export function formatList(list: string[]): string {
  return list
    .map((item) =>
      item
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')
        .replace(/\r/g, '\\r')
        .replace(/,/g, '\\,'),
    )
    .join(', ')
}

export function parseList(text: string): string[] {
  // Split on unescaped commas only, keeping the escapes intact. Trimming has to happen on this
  // raw text and not on the unescaped value: `\n` here is a backslash and an n, which survives a
  // trim, where the newline it stands for would not.
  const raw: string[] = []
  let current = ''
  let escaped = false
  for (const ch of text) {
    if (escaped) {
      current += ch
      escaped = false
    } else if (ch === '\\') {
      current += ch
      escaped = true
    } else if (ch === ',') {
      raw.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  raw.push(current)

  return raw
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .map((item) =>
      // A trailing backslash is the user mid-escape: it stands for itself rather than eating the
      // closing quote of the next entry.
      item.replace(/\\(.|$)/g, (_, ch: string) =>
        ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === 'r' ? '\r' : ch === '' ? '\\' : ch,
      ),
    )
}

/**
 * A param's value as the request body should carry it. Returns `undefined` when the param has
 * nothing to send, an empty list or a blank json blob, so the caller omits the key rather than
 * sending a null a picky backend will reject.
 */
export function coerceValue(def: ParamDef, value: unknown): unknown {
  switch (def.kind) {
    case 'number':
    case 'slider': {
      const n = Number(value)
      return Number.isFinite(n) ? n : undefined
    }
    case 'bool':
      return Boolean(value)
    case 'stringList': {
      const list = Array.isArray(value) ? value.map(String) : parseList(String(value ?? ''))
      const kept = list.filter((s) => s !== '')
      // Some backends reject an empty stop array outright. An empty list means "don't send".
      return kept.length ? kept : undefined
    }
    case 'json': {
      const raw = typeof value === 'string' ? value.trim() : value
      if (raw === '' || raw === undefined || raw === null) return undefined
      if (typeof raw !== 'string') return raw
      try {
        return JSON.parse(raw)
      } catch {
        return undefined
      }
    }
    default:
      return value
  }
}

/** The kind and default a pasted JSON value implies, for the new-parameter modal. */
export function inferKind(value: unknown): { kind: ParamKind; default: unknown } {
  if (typeof value === 'number') return { kind: 'number', default: value }
  if (typeof value === 'boolean') return { kind: 'bool', default: value }
  if (Array.isArray(value)) return { kind: 'stringList', default: value.map(String) }
  if (value !== null && typeof value === 'object') {
    return { kind: 'json', default: JSON.stringify(value) }
  }
  return { kind: 'text', default: String(value ?? '') }
}

/** `dry_multiplier` → `Dry multiplier`. A starting point the user can overwrite. */
export function labelFromKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : ''
}

/**
 * The first key/value of a pasted snippet, as a def. `{"dry_multiplier": 0.8}` is the whole input
 * the modal asks for; everything else on the def is refinement.
 */
export function defFromSnippet(raw: string): ParamDef | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const entries = Object.entries(parsed as Record<string, unknown>)
  if (!entries.length) return null
  const [key, value] = entries[0]
  const { kind, default: fallback } = inferKind(value)
  return {
    ownerId: localOwnerId,
    key,
    label: labelFromKey(key),
    kind,
    default: fallback,
    appliesTo: ['chat', 'text'],
  }
}
