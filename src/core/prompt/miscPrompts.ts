// The small utility prompts: the instructions the app sends on its own behalf, as opposed to the
// blocks a stack assembles. A prompt is a row here rather than a string in the code that sends it.
// Adding one is a row and a call site and needs no UI work.
//
// Extension-ful imports on purpose: the check scripts run this under
// `node --experimental-strip-types`.

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
    id: 'storyOutline',
    label: 'Story outline',
    hint: 'Sent by Generate story outline. Returns chapters and their summaries, no beats.',
    text: `You are outlining a story. Reply with one JSON object and nothing else. No prose, no explanation, no code fence.

The object has one field, "chapters": an array of {{chapters}} objects, in order. Each holds:
- title: the chapter title.
- summary: two or three sentences on what happens in it.
- weight: how long the chapter runs against the others. One of: sketch, brief, normal, long, major.

Plan the whole arc across those chapters. Do not write beats and do not write prose.
{{words}}
The premise:

{{premise}}
{{themes}}{{shape}}{{cast}}{{ending}}`,
    slots: [
      { token: 'premise', hint: 'The premise typed on the Story generation screen.' },
      { token: 'chapters', hint: 'How many chapters to write.' },
      { token: 'words', hint: 'The sentence naming the whole work'
        + "'s word target. Empty when unset." },
      { token: 'themes', hint: 'The themes paragraph. Empty when unset.' },
      { token: 'shape', hint: 'Genre, tone and setting as a paragraph. Empty when all unset.' },
      { token: 'cast', hint: 'The enabled cast, name and description. Empty when there is none.' },
      { token: 'ending', hint: 'The intended ending. Empty when unset.' },
    ],
    kind: 'story',
  },
  {
    id: 'chapterOutline',
    label: 'Chapter outline',
    hint: 'Sent by Generate chapter outline. Returns the beats of one chapter.',
    text: `You are outlining one chapter of a story. Reply with one JSON object and nothing else. No prose, no explanation, no code fence.

The object has one field, "beats": an array of objects, in order. Each holds:
- content: one line on what that stretch of the chapter covers. A plan, not prose.
- length: how long the stretch runs against the others. One of: sketch, brief, normal, long, major.

{{count}}Vary the weights. A transition is not the size of a climax.
{{words}}
The chapter:

{{chapter}}
{{notes}}{{story}}{{previous}}`,
    slots: [
      { token: 'chapter', hint: "The chapter's number, title and summary." },
      { token: 'count', hint: 'The sentence asking for a beat count, or for the model to choose.' },
      { token: 'words', hint: "The sentence naming the chapter's word target. Empty when unset." },
      { token: 'notes', hint: 'The author notes typed into the dialog. Empty when unset.' },
      { token: 'story', hint: 'Premise, themes and ending from the Story. Empty when all unset.' },
      { token: 'previous', hint: 'What the previous chapter covered. Empty on chapter 1.' },
    ],
    kind: 'story',
  },
  {
    id: 'chapterSummary',
    label: 'Chapter summary',
    hint: 'Sent by Summarise from prose. Returns the chapter recap as plain prose.',
    text: `You are writing the recap of one chapter of a story, for an author's own notes.

Reply with two or three sentences of plain prose and nothing else. No title, no heading, no JSON, no code fence, no commentary.

Say what happens in the chapter: the events, who they happen to, and where it leaves them. Write it as a record of what the chapter contains, not as a pitch for it.

{{chapter}}

What the chapter says:

{{prose}}{{beats}}`,
    slots: [
      { token: 'chapter', hint: "The chapter's number and title." },
      { token: 'prose', hint: 'The prose written so far, oldest first.' },
      { token: 'beats', hint: 'The plan for beats with no prose yet. Empty when all are written.' },
    ],
    kind: 'story',
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
 * The wording to send: the stack's override, or the built-in. Blank (or whitespace) is not an
 * override: it is how the editor's Reset says "use the built-in", the same rule `palettePrompt`
 * follows. An unknown id returns '' rather than throwing: a stack can carry a row for a prompt a
 * later build removed, and that must not break sending.
 */
export function miscPrompt(id: string, prompts?: MiscPrompts): string {
  const override = prompts?.[id]
  if (override?.trim()) return override
  return miscPromptDef(id)?.text ?? ''
}

/**
 * Fill `{{token}}` slots. One pass: a value that itself contains `{{…}}` (model output, which
 * every one of these quotes) is never rescanned and never substituted again. An unknown token is
 * left as written: it is more likely a typo the user wants to see than a slot to blank out.
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
