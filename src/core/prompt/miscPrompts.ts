// The small utility prompts: the instructions the app sends on its own behalf, as opposed to the
// blocks a stack assembles. A prompt is a row here rather than a string in the code that sends it.
// Adding one is a row and a call site and needs no UI work.
//
// Extension-ful imports on purpose: the check scripts run this under
// `node --experimental-strip-types`.
import type { Connection } from '../stores/settingsStore'

/** Which builder a prompt belongs to. Story stacks never send the chat-only ones. */
export type MiscPromptKind = 'chat' | 'story' | 'both'

/** One `{{token}}` the wording may use. Listed under the field so the slots are discoverable
 *  without reading the code that fills them. */
export interface MiscPromptSlot {
  token: string
  hint: string
}

export interface MiscPromptDef {
  id: string
  label: string
  /** One line under the label in the editor: when this prompt gets sent. */
  hint: string
  /** The built-in wording. An empty override means this, same rule as `palettePrompt`. */
  text: string
  slots: MiscPromptSlot[]
  kind: MiscPromptKind
}

export const miscPromptDefs: MiscPromptDef[] = [
  {
    id: 'continue',
    label: 'Continue',
    hint: 'Sent by /continue, alongside the cut-off reply.',
    text: 'Your previous reply was cut off mid-flow. Carry on from exactly where it stops, without repeating or restarting any of it. Reply with the continuation only.',
    slots: [],
    kind: 'chat',
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    hint: 'Wraps the instruction you type into a re-roll box.',
    text: 'Your previous reply was:\n\n{{reply}}\n\nWrite that reply again, following this instruction: {{instruction}}\n\nReply with the rewritten message only.',
    slots: [
      { token: 'reply', hint: 'The message being rewritten.' },
      { token: 'instruction', hint: 'What you typed into the box.' },
    ],
    kind: 'both',
  },
  {
    id: 'oldMessage',
    label: 'Re-roll an earlier message',
    hint: 'The default instruction when the message being re-rolled is not the last one.',
    text: 'You are rewriting an earlier message in this conversation, not the latest one. What was said after it:\n\n{{transcript}}\n\nRewrite the message so that what follows still makes sense.',
    slots: [{ token: 'transcript', hint: 'Everything said after the message, as speaker lines.' }],
    kind: 'chat',
  },
  {
    id: 'ideas',
    label: 'Suggest ideas',
    hint: 'Sent by Suggest ideas above the chat input. The chips are read from the [1] [2] [3] lines.',
    text: `Suggest 3 different things {{user}} could say or do next, like the choices in a choose-your-own-adventure. {{user}} is not {{char}}: every choice is an action by {{user}}. Each is under 12 words. Use only people, objects and threads already in the story. Introduce nothing new.

The story so far:

{{replies}}
{{message}}
Reply with three lines and nothing else:
[1] idea
[2] idea
[3] idea`,
    slots: [
      { token: 'replies', hint: 'The last 10 messages since the last break, both sides, oldest first, each as "Name: text".' },
      { token: 'message', hint: 'Your last message under a "Last message from" line. Empty when there is none.' },
      { token: 'char', hint: 'The character who replied last.' },
      { token: 'user', hint: 'The persona name on your last message.' },
    ],
    kind: 'chat',
  },
  {
    id: 'ideaNext',
    label: 'Picked idea',
    hint: 'Added to the next reply when you send with an idea picked.',
    text: 'Next, develop this: {{idea}}',
    slots: [{ token: 'idea', hint: 'The idea you picked.' }],
    kind: 'chat',
  },
  {
    id: 'promptPlaceholder',
    label: 'Strict mode placeholder',
    hint: "Sent as the first user message when a connection's prompt processing is Strict and the prompt has no user message before the first assistant one.",
    text: '[Start a new chat]',
    slots: [],
    kind: 'both',
  },
  {
    id: 'narrator',
    label: 'Narrator',
    hint: "Used when this stack has no {% if Narrator %} block. It goes where a character's system prompt goes, so a stack with no system prompt block sends nothing.",
    // Written against the two things that distinguish a narrated turn: the voice is outside the
    // cast, and the user's line is an instruction to the storyteller rather than dialogue.
    text: `You are the Narrator. You are not one of the characters and you are not the user.

Write the scene: what happens, what the place is like, what time and weather and distance are doing. You may write the characters, including their dialogue and what they do, when the scene calls for it. Stay in the same tense and person the chat is already using.

The user's last message is direction for you, not speech to a character. Do not answer it, do not quote it back, and do not write the user acting or speaking. Turn it into what happens next.`,
    slots: [],
    kind: 'chat',
  },
  {
    id: 'nextSpeaker',
    label: 'Next speaker',
    hint: 'The trailing turn naming who is up. Group chats and sessions only.',
    text: 'Write the next message as {{char}}.',
    slots: [{ token: 'char', hint: 'The character whose turn it is.' }],
    kind: 'chat',
  },
]

/**
 * A stack's overrides, keyed by def id. Passed around rather than read off a store: every
 * function that builds prompt text stays pure and check-testable.
 *
 * Undefined is the honest default for the callers that have no stack to resolve against. Ask has
 * no prompt stack at all, and a preview can run before one is loaded. Those get the built-in text.
 */
export type MiscPrompts = Record<string, string> | undefined

export const miscPromptDef = (id: string): MiscPromptDef | undefined =>
  miscPromptDefs.find((d) => d.id === id)

/**
 * The wording to send: the stack's override, or the built-in. Blank (or whitespace) isn't an
 * override: it's how the editor's Reset says "use the built-in", the same rule `palettePrompt`
 * follows. An unknown id returns '' rather than throwing: a stack can carry a row for a prompt a
 * later build removed, and that must not break sending.
 */
export function miscPrompt(id: string, prompts?: MiscPrompts): string {
  const override = prompts?.[id]
  if (override?.trim()) return override
  return miscPromptDef(id)?.text ?? ''
}

/**
 * Fill `{{token}}` slots. One pass: a value that itself contains `{{...}}` (model output, which
 * every one of these quotes) is never rescanned and never substituted again. An unknown token is
 * left as written: it's more likely a typo the user wants to see than a slot to blank out.
 */
export function fillSlots(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, token: string) => {
    const value = values[token.toLowerCase()] ?? values[token]
    return value === undefined ? whole : value
  })
}

/**
 * Overrides off an imported stack file, keeping only non-blank string values. A stack file comes
 * from wherever the user got it. It can't just be spread onto the record: a nested object or a
 * number would reach `miscPrompt` and be sent, or break the editor's textarea.
 *
 * An id this build doesn't know is kept. A file from a later build round-trips, and
 * `miscPrompt` already ignores an id with no def.
 */
export function coerceMiscPrompts(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) out[key] = value
  }
  return Object.keys(out).length ? out : undefined
}

/** Only the prompts a stack of this kind can send. `both` shows in either builder. */
export const defsForKind = (kind: 'chat' | 'story'): MiscPromptDef[] =>
  miscPromptDefs.filter((d) => d.kind === kind || d.kind === 'both')

/** The connection with this stack's strict-mode placeholder in place, for one request. Never saved. */
export const withPlaceholder = (connection: Connection, prompts: MiscPrompts): Connection => ({
  ...connection,
  placeholder: miscPrompt('promptPlaceholder', prompts),
})
