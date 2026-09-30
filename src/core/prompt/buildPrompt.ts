// Extension-ful imports on purpose: checkPrompt.ts runs this under `node --experimental-strip-types`,
// which can't resolve extensionless app imports.
import type { ChatMessage } from '../connectors/connectorInterface'
import type { ReplaceRule, TagRule } from '../stores/settingsStore'
import type { Chat, Character, Message, Persona, PromptStack } from '../storage/types'
import { activeDescription } from '../storage/types.ts'
import { isGroup } from '../stores/roster.ts'
import { chatTokens, swapTokens } from './swapTokens.ts'
import { promptConditions, resolveTemplate, variableValues } from './template.ts'
import { stackParts, stackVariables, templateBody, usesSlot } from './stackTemplate.ts'
import { trackerPrompt, trackerValues } from '../trackers/trackerState.ts'
import type { Budget } from './budget.ts'
import { countMessages, countTokens, perMessageOverhead, trimHistory } from './budget.ts'
import { fillSlots, miscPrompt } from './miscPrompts.ts'
import type { MiscPrompts } from './miscPrompts.ts'
import { emptyWorldInfo, type ResolvedWorldInfo } from './worldInfo.ts'
import { applyReplace } from './textRules.ts'

/**
 * The card's text, or the stack's fallback when the card has none. That's the spec's "empty string
 * means use the frontend's own" rule. {{original}} in the card's text resolves to the fallback: a
 * card can extend the stack's instruction instead of replacing it.
 */
function cardOverride(cardText: string, fallback: string): string {
  // Not substituted into the fallback itself: {{original}} inside it'd resolve to itself.
  if (!cardText.trim()) return fallback
  return cardText.replace(/\{\{\s*original\s*\}\}/gi, fallback)
}

// `{% systemPrompt %}fallback{% endsystemPrompt %}`, and the same for postHistory: the card's own
// field, or the text between the tags when the card leaves it blank. The bare `{{ systemPrompt }}`
// is the same with no fallback.
const cardBlock = /\{%\s*(systemPrompt|postHistory)\s*%\}([\s\S]*?)\{%\s*end\1\s*%\}/gi

/** The template with each card block reduced to its slot, and the fallback each one carried. */
function takeFallbacks(body: string): { body: string; fallbacks: Record<string, string> } {
  const fallbacks: Record<string, string> = {}
  const out = body.replace(cardBlock, (_whole, name: string, inner: string) => {
    fallbacks[name.toLowerCase()] = inner.trim()
    return `{{ ${name} }}`
  })
  return { body: out, fallbacks }
}

// The text a template pulls in from elsewhere: the card, the persona, the chat, the lorebooks.
// Filled after the structure is read, so nothing a card says can open a message or move history.
const slotPattern =
  /\{\{\s*(authorNote|worldInfo|worldInfoAfter|systemPrompt|postHistory|charDescription|charPersonality|charScenario|charExampleDialogue|personaDescription)\s*\}\}/gi

/** The depth the stack gives the author's note: the `{% depth %}` holding `{{ authorNote }}`. */
export function stackAuthorNoteDepth(stack: PromptStack): number | undefined {
  for (const part of stackParts(templateBody(stack.template))) {
    if (part.kind === 'text' && part.depth !== undefined && usesSlot(part.text, 'authorNote')) return part.depth
  }
  return undefined
}

/**
 * Who said a history turn, for the label. The stamped name wins: a deleted character or persona
 * still gets credited. The fallbacks cover turns written before either field existed.
 */
function speakerLabel(message: Message, character: Character, persona: Persona): string {
  return message.role === 'user'
    ? (message.personaName ?? persona.name)
    : (message.speakerName ?? character.name)
}

/**
 * Drop each depth-limited tag block from a history message once it's older than the tag allows.
 * `distance` is how far the message is from the newest (1 = it's the last message). A tag with
 * depth 1 rides along only while its message is last. Same literal open/close scan as renderText;
 * a rule with no `depth` is display-only and never touches the sent text. Storage is untouched.
 */
export function stripDepthTags(content: string, distance: number, rules?: TagRule[]): string {
  const active = rules?.filter(
    (r) => r.open && r.close && r.depth !== undefined && distance > r.depth,
  )
  if (!active?.length) return content
  let out = ''
  let i = 0
  while (i < content.length) {
    const rule = active.find((r) => content.startsWith(r.open, i))
    const close = rule ? content.indexOf(rule.close, i + rule.open.length) : -1
    // An unclosed opener is literal text, same as renderText.
    if (rule && close >= 0) {
      i = close + rule.close.length
      continue
    }
    out += content[i]
    i += 1
  }
  if (out === content) return content
  // The block sat on its own line; dropping it leaves a blank gap. Collapse it, don't ship it.
  return out.replace(/\n{3,}/g, '\n\n').trim()
}

/** The trailing turn naming who speaks next. Wording lives in `miscPrompts`, and a stack can
 *  override it; this only fills the slot. */
export function nextSpeakerHint(name: string, prompts?: MiscPrompts): string {
  return fillSlots(miscPrompt('nextSpeaker', prompts), { char: name })
}

export interface BuildPromptArgs {
  stack: PromptStack
  character: Character
  persona: Persona
  messages: Message[]
  /** Group chats: whoever is speaking this turn. Absent = `character`, exactly as Phase 1. */
  speaker?: Character
  /** Source of the author's note text for `{{ authorNote }}`. */
  chat?: Chat
  /** Matched lorebook content. Resolved by the caller with `resolveWorldInfo`: matching needs
   *  entries out of storage, and this function stays pure, exactly as it does for `authorNote`.
   *  `.before` and `.after` fill `{{ worldInfo }}` and `{{ worldInfoAfter }}`; `.atDepth` entries
   *  are spliced into history as system turns. */
  worldInfo?: ResolvedWorldInfo
  /** A system turn appended after everything else: the rewrite instruction. Counted against
   *  the budget like any other text, never exempted. */
  appendSystem?: string
  /** A partial reply left as the last turn for the model to carry on from: what `/continue` sends.
   *  Goes after `appendSystem`: a prefill only works while it's the final turn. Counted
   *  against the budget like any other text. */
  appendAssistant?: string
  /** Tag rules with a `depth` strip their block from older history turns. Absent = nothing stripped. */
  tagRules?: TagRule[]
  /** Find/replace rules set to apply in the prompt run over history turns. Absent = none. */
  replaceRules?: ReplaceRule[]
  /** Force speaker labels on even outside a group. Multiplayer needs them with one character. */
  nameSpeakers?: boolean
  /** The multiplayer roster in host-chosen slot order, filling {{char1}}...{{char4}}. Absent
   *  outside a session, which leaves those tokens alone. */
  cast?: Character[]
  /** The session's people as `Name: description` lines, filling {{personas}}. Resolved by the
   *  caller, as `worldInfo` is: the roster lives in the multiplayer store, not here. */
  personas?: string
  /** The game's title, filling {{game}}. Absent outside the games module, which leaves the token
   *  in place rather than blanking it in an ordinary chat. */
  game?: string
  /** The game's `GameKind`, behind `{% if blackjack %}` and `{% if goFish %}`. Absent outside a game, which
   *  is also what makes `{% if game %}` false in an ordinary chat. */
  gameKind?: string
}

export interface BuiltPrompt {
  messages: ChatMessage[]
  tokensUsed: number
  /** What the fixed text costs before any history goes in. */
  fixedTokens: number
  droppedCount: number
  /** The history messages the budget dropped, oldest first. */
  dropped: Message[]
  /** History allowance left after the fixed text, the reply reserve and the margin. */
  available: number
  overflow: boolean
}

/**
 * Renders the stack's template and produces the exact request body messages.
 * With a budget, history is trimmed from the top first. The preview and the send
 * path call this same function and can't drift apart.
 */
export function buildPrompt(
  {
    stack,
    character,
    persona,
    messages: allMessages,
    speaker,
    chat,
    worldInfo,
    appendSystem,
    appendAssistant,
    tagRules,
    replaceRules,
    nameSpeakers,
    cast,
    personas,
    game,
    gameKind,
  }: BuildPromptArgs,
  budget?: Budget,
): BuiltPrompt {
  // `/break` rows are display only: they hold a place in the chat and never reach the model.
  const messages = allMessages.filter((m) => !m.divider)

  // In a group chat only the speaker's card goes in the prompt; everyone else is known from the
  // labelled history.
  const who = speaker ?? character
  const authorNote = chat?.authorNote ?? ''
  // A template with no after-char slot folds those entries into the before-char one, rather than
  // dropping them on the floor.
  const resolvedWorldInfo: ResolvedWorldInfo = worldInfo
    ? usesSlot(stack.template, 'worldInfoAfter')
      ? worldInfo
      : { ...worldInfo, before: [worldInfo.before, worldInfo.after].filter(Boolean).join('\n'), after: '' }
    : emptyWorldInfo
  // Labels only once there's more than one character to tell apart: a solo chat's prompt is
  // byte-identical to what Phase 1 produced. `chat.nameSpeakers` forces them on for a chat that
  // several *people* speak in. Every buildPrompt caller passes `chat`. A session's labels
  // reach the send path and the preview without either being told about multiplayer. The
  // `nameSpeakers` argument stays for callers with no chat record.
  const group = (chat ? isGroup(chat) || chat.nameSpeakers === true : false) || nameSpeakers === true

  // Authored text only: the template and the card and persona fields it pulls in. Chat history is
  // transcript, not card data: it's never substituted. {{user}} is always the *active* persona,
  // even where older turns were sent as someone else. {{charDescription}} follows the speaker: in a
  // group each character's turn pastes that character's own description.
  // {{char1}}...{{char4}} are the session roster instead, fixed for the whole session. They don't
  // follow the speaker, and one template can talk about the cast as a group.
  const tokens = chatTokens(who, persona, cast, personas, game)
  const swap = (text: string) => swapTokens(text, tokens)

  // {% if narrator %} and friends, plus the stack's own {{variables}}. Resolved before
  // substitution: a token inside a dropped branch never gets swapped, and no token's value can be
  // read back as a condition name.
  // Trackers come off the chat's card, whoever speaks. Built-in names win a clash with a tracker key.
  const trackers = character.trackers ?? []
  const values = trackers.length ? trackerValues(trackers, messages, chat?.trackerOverrides) : {}
  const conditions = {
    ...Object.fromEntries(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v])),
    // Whether each slot holds anything, so a wrapper can sit in `{% if worldInfo %}`.
    authornote: Boolean(authorNote.trim()),
    worldinfo: Boolean(resolvedWorldInfo.before.trim()),
    worldinfoafter: Boolean(resolvedWorldInfo.after.trim()),
    ...promptConditions(who, cast, gameKind),
  }
  const vars = variableValues(stackVariables(stack))
  const { body, fallbacks } = takeFallbacks(templateBody(stack.template))
  const slots: Record<string, string> = {
    authornote: authorNote,
    worldinfo: resolvedWorldInfo.before,
    worldinfoafter: resolvedWorldInfo.after,
    systemprompt: cardOverride(who.systemPrompt ?? '', fallbacks.systemprompt ?? ''),
    posthistory: cardOverride(who.postHistoryInstructions ?? '', fallbacks.posthistory ?? ''),
    chardescription: activeDescription(who),
    charpersonality: who.personality,
    charscenario: who.scenario,
    charexampledialogue: who.exampleDialogue,
    personadescription: persona.description,
  }
  // Slot text runs through the template too: a card's own `{% if %}` is honoured. A blank slot's
  // line collapses rather than leaving a gap.
  const fill = (text: string) =>
    swap(
      text.replace(slotPattern, (_whole, name: string) =>
        resolveTemplate(slots[name.toLowerCase()] ?? '', conditions, vars),
      ),
    )
      .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n')
      .trim()

  // Resolve first, assemble second: budgeting needs the fixed cost before history goes in.
  const resolved: (ChatMessage | 'history')[] = []
  // Text in a `{% depth %}`, and lorebook entries positioned at one, get spliced into history below.
  const depthNotes: { message: ChatMessage; depth: number }[] = []
  let fixedTokens = 0

  for (const part of stackParts(resolveTemplate(body, conditions, vars))) {
    if (part.kind === 'history') {
      resolved.push('history')
      continue
    }
    const text = fill(part.text)
    // A blank slot must not become a blank system turn, an empty author's note included.
    if (!text) continue
    const message: ChatMessage = { role: part.role, content: text }
    fixedTokens += countTokens(text) + perMessageOverhead
    // A depth note with no history in the template doesn't appear: depth is counted from history.
    // The chat's own author's-note depth beats the stack's, same shape as the param overrides.
    const depth =
      part.depth !== undefined && usesSlot(part.text, 'authorNote')
        ? chat?.authorNoteDepth ?? part.depth
        : part.depth
    if (depth !== undefined) {
      depthNotes.push({ message, depth })
      continue
    }
    resolved.push(message)
  }

  // Lorebook entries positioned at a depth. Each entry's `depth` places it, counted from the end of
  // history, same splice as the author's note.
  // ponytail: always system turns. A `{% worldInfoDepth user %}` tag if a stack needs another role.
  for (const at of resolvedWorldInfo.atDepth) {
    const content = swap(resolveTemplate(at.text, conditions, vars))
    if (!content.trim()) continue
    depthNotes.push({ message: { role: 'system', content }, depth: at.depth })
    fixedTokens += countTokens(content) + perMessageOverhead
  }

  // Both trailing turns are system turns. The merge below concatenates them: the hint says who
  // is up, then any rewrite instruction narrows what they should write. Neither overwrites the
  // other, and the more specific one has the last word.
  // ponytail: fixed wording after the stack, a template slot when creators need to place or reword it.
  const trackerText = trackerPrompt(trackers, values)
  if (trackerText) {
    resolved.push({ role: 'system', content: trackerText })
    fixedTokens += countTokens(trackerText) + perMessageOverhead
  }

  if (group) {
    const hint = nextSpeakerHint(who.name, stack.miscPrompts)
    resolved.push({ role: 'system', content: hint })
    fixedTokens += countTokens(hint) + perMessageOverhead
  }

  // Not swapped here: appendSystem quotes transcript around the instruction, and transcript is
  // exempt. The authored half (what you typed into the rewrite box) is swapped by the caller
  // before it's wrapped: a {{char}} the model wrote stays a literal.
  if (appendSystem?.trim()) {
    resolved.push({ role: 'system', content: appendSystem })
    fixedTokens += countTokens(appendSystem) + perMessageOverhead
  }

  // Last, and after the merge below it stays last: a prefill the model is meant to continue only
  // works as the final turn. Not swapped: it's transcript the model already wrote.
  if (appendAssistant?.trim()) {
    resolved.push({ role: 'assistant', content: appendAssistant })
    fixedTokens += countTokens(appendAssistant) + perMessageOverhead
  }

  const trimmed = budget
    ? trimHistory(messages, fixedTokens, budget)
    : { messages, dropped: [], droppedCount: 0, available: 0, overflow: false }

  const out: ChatMessage[] = []

  // Neighbouring same-role turns become one: five system parts are one system message,
  // and every backend sees the same shape.
  function push(role: ChatMessage['role'], content: string) {
    const last = out.at(-1)
    if (last && last.role === role) last.content += `\n\n${content}`
    else out.push({ role, content })
  }

  // History plus any depth notes, in final order. Depth counts messages from the end, clamped to
  // the top. Notes are inserted deepest-last: each depth is read against the trimmed history.
  // The label is added here and only here: stored `content` never carries a speaker prefix.
  // the prefix isn't in the trim arithmetic, only in the final count. A name per turn is
  // noise against the reply reserve; count it in trimHistory if long group chats start overflowing.
  const history: ChatMessage[] = trimmed.messages.map((m, idx) => {
    // Newest turn is distance 1; a depth-N tag stays in the prompt only while distance ≤ N.
    const content = applyReplace(stripDepthTags(m.content, trimmed.messages.length - idx, tagRules), replaceRules, m.role)
    return {
      role: m.role,
      content: group ? `${speakerLabel(m, character, persona)}: ${content}` : content,
      // Carried on every turn, not only in a group: a text-completion template may label turns in
      // a one-to-one chat too, and it fills {{char}} and {{user}} in the instruct sequences.
      name: speakerLabel(m, character, persona),
    }
  })
  // Deepest first: each insertion point is counted from the end. Splicing a shallow note before
  // a deep one would shift the deep one's target by the row just added.
  for (const note of [...depthNotes].sort((a, b) => b.depth - a.depth)) {
    history.splice(Math.max(0, history.length - note.depth), 0, note.message)
  }

  for (const part of resolved) {
    if (part === 'history') {
      // Verbatim: what was said stays what was said.
      for (const m of history) push(m.role, m.content)
    } else {
      push(part.role, part.content)
    }
  }

  return {
    messages: out,
    tokensUsed: countMessages(out),
    fixedTokens,
    droppedCount: trimmed.droppedCount,
    dropped: trimmed.dropped,
    available: trimmed.available,
    overflow: trimmed.overflow,
  }
}
