// The SillyTavern export shapes, as much of them as an import needs, plus the sniffer that says
// which one a file is. ST has no format marker anywhere, so the keys present are the only signal.
//
// Extension-ful imports across this folder on purpose: checkSillyTavern.ts runs it under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.

/** Which ST export a file is. */
export type StShape =
  /** A whole settings export: instruct + context + sysprompt + preset + reasoning. */
  | 'bundle'
  /** A chat-completion preset: `prompts` and `prompt_order`, samplers alongside them. */
  | 'chatPreset'
  /** A text-completion sampler preset on its own. */
  | 'textgenPreset'
  /** An instruct template on its own. */
  | 'instruct'
  /** A context template on its own. */
  | 'context'
  /** A system prompt on its own. */
  | 'sysprompt'

export interface StInstruct {
  name?: string
  input_sequence?: string
  input_suffix?: string
  output_sequence?: string
  output_suffix?: string
  system_sequence?: string
  system_suffix?: string
  stop_sequence?: string
  sequences_as_stop_strings?: boolean
  story_string_prefix?: string
  story_string_suffix?: string
  first_output_sequence?: string
  last_output_sequence?: string
  system_same_as_user?: boolean
  /** Every sequence on its own line. Alpaca-likes need it. */
  wrap?: boolean
  /** Expand {{macros}} inside the sequences. Absent counts as on. */
  macro?: boolean
  /** 'none' | 'force' | 'always'. Older exports write 'never' for 'none'. */
  names_behavior?: string
}

export interface StContext {
  name?: string
  story_string?: string
  chat_start?: string
  example_separator?: string
}

export interface StSysprompt {
  name?: string
  content?: string
  post_history?: string
}

export interface StReasoning {
  name?: string
  prefix?: string
  suffix?: string
  separator?: string
}

/** One entry in a chat-completion preset's `prompts`. */
export interface StPrompt {
  identifier?: string
  name?: string
  content?: string
  role?: string
  /** A placeholder for something ST fills in (the character description, chat history, ...). */
  marker?: boolean
  system_prompt?: boolean
  /** 1 = injected at a depth in the chat rather than sitting in the prompt order. */
  injection_position?: number
  injection_depth?: number
  /** Absent counts as on; the order entry is the authority anyway. */
  enabled?: boolean
}

export interface StPromptOrder {
  character_id?: number
  order?: { identifier?: string; enabled?: boolean }[]
}

/** A chat-completion preset. The samplers sit at the top level next to the prompt list. */
export interface StChatPreset {
  name?: string
  prompts?: StPrompt[]
  prompt_order?: StPromptOrder[]
  continue_nudge_prompt?: string
  [key: string]: unknown
}

/** A full settings export. Every section is optional: ST writes what the user had. */
export interface StBundle {
  instruct?: StInstruct
  context?: StContext
  sysprompt?: StSysprompt
  preset?: Record<string, unknown>
  reasoning?: StReasoning
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** Keys only a text-completion sampler preset carries. */
const textgenKeys = ['temp', 'rep_pen', 'genamt', 'max_length', 'sampler_order', 'dynatemp']

/** Which ST export this is. Throws with a message meant for the user. */
export function sniffShape(data: unknown): StShape {
  if (!isObject(data)) throw new Error('That file is not a SillyTavern preset.')
  if (Array.isArray(data.prompts) || Array.isArray(data.prompt_order)) return 'chatPreset'
  if (
    isObject(data.instruct) ||
    isObject(data.context) ||
    isObject(data.sysprompt) ||
    isObject(data.preset)
  ) {
    return 'bundle'
  }
  if (typeof data.input_sequence === 'string' || typeof data.output_sequence === 'string') {
    return 'instruct'
  }
  if (typeof data.story_string === 'string') return 'context'
  if (typeof data.content === 'string' && !textgenKeys.some((k) => k in data)) return 'sysprompt'
  if (textgenKeys.some((k) => k in data)) return 'textgenPreset'
  throw new Error('That file is not a SillyTavern preset.')
}

/** The five sections, wherever they came from: a bundle splits, a standalone file is one section. */
export function sectionsOf(shape: StShape, data: Record<string, unknown>): StBundle & {
  chat?: StChatPreset
} {
  switch (shape) {
    case 'bundle':
      return data as StBundle
    case 'chatPreset':
      return { chat: data as StChatPreset, preset: data }
    case 'textgenPreset':
      return { preset: data }
    case 'instruct':
      return { instruct: data as StInstruct }
    case 'context':
      return { context: data as StContext }
    case 'sysprompt':
      return { sysprompt: data as StSysprompt }
  }
}
