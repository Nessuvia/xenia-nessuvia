import type { StateParse, TrackerDef, TrackerValue } from '../trackers/parseState.ts'
import type { MoveQuality } from '../games/goFish'
import type { ChatAgent } from '../agent/agentConfig.ts'
import type { PostStackConfig } from '../agent/postStack.ts'
import type { AcrosticRecord } from '../agent/acrostic/parse.ts'
import type { GameEvent, GameKind } from '../games/gameEvent'
import type { ReplaceRule, TagRule } from '../stores/settingsStore.ts'

export interface Character {
  id?: number
  ownerId: string
  name: string
  displayName?: string // shown in lists, the character page, and chats. '' or unset falls back to name. {{char}} and the API payload always use name.
  avatar: string // base64 data URL of the original, uncropped image; '' when unset
  avatarCrop?: AvatarCrop // how to frame `avatar`; unset shows the whole image
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  altDescriptions: { title: string; content: string }[]
  activeDescriptionIndex: number // -1 = use `description` verbatim
  alternateGreetings: string[]
  // Labels for the greetings above, by the same index. Rides in an extensions block; absent or short means the rest are unnamed.
  greetingTitles?: string[]
  // Externally hosted image URLs.
  gallery: string[]
  // Free-text tags. tags[0] is the character's group in the picker's grouped view. Unindexed.
  tags: string[]
  /** Card `system_prompt`. Reaches the model through a `characterSystemPrompt` block; empty falls
   *  back to that block's own content. */
  systemPrompt: string
  /** Card `post_history_instructions`. Same rules as `systemPrompt`. */
  postHistoryInstructions: string
  // Card metadata. Not read by core/prompt.
  creatorNotes: string
  creator: string
  characterVersion: string
  rawCard?: unknown // original parsed card, untouched
  paramOverrides?: ParamOverrides
  stackId?: number
  /** Lorebooks attached in every chat this character speaks in. An imported card's
   *  `character_book` lands here as a single id. Absent = none. */
  lorebookIds?: number[]
  /** Card trackers, in display order. Rides in `extensions.nessu.trackers`. Absent = none. */
  trackers?: TrackerDef[]
  /** Creator CSS for the tracker widgets. Refused whole by `trackerCssProblem`. */
  trackerCss?: string
  /** A Fontsource slug for the tracker widgets. */
  trackerFont?: string
  createdAt: number
  updatedAt: number
  colors: CharacterColors // per-speaker overrides; each '' = fall through to the global appearance color
}

/**
 * The visible window onto an avatar image, as fractions (0-1) of its natural size.
 */
export interface AvatarCrop {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A lorebook: a named set of entries. Attached to characters (`Character.lorebookIds`), to a
 * single chat (`Chat.lorebookIds`), or to everything via `global`. Entries live in the
 * `worldInfo` table, keyed by `bookId`.
 */
export interface Lorebook {
  id?: number
  ownerId: string
  name: string
  description: string
  scanDepth?: number // card's `scan_depth`: default for entries that don't override it
  tokenBudget?: number // card's `token_budget`: cap on what this book may add to one prompt
  /** Applies to every chat, on top of whatever the character and the chat attach. */
  global: boolean
}

/** Where a matched entry goes in the prompt. `beforeChar`/`afterChar` order it within the World
 *  info block; `atDepth` lifts it out and splices it N messages from the end of history. */
export type EntryPosition = 'beforeChar' | 'afterChar' | 'atDepth'

/**
 * One lorebook entry, owned by one book.
 */
export interface WorldInfoEntry {
  id?: number
  ownerId: string
  bookId: number
  name: string // row label; cards keep it in `comment`
  keys: string[] // trigger words; matched case-insensitively unless `caseSensitive`
  /** Gated keys: a primary hit only counts once these pass `selectiveLogic`. Empty = no gate. */
  secondaryKeys: string[]
  /** How `secondaryKeys` gate a primary hit. SillyTavern's numbering:
   *  0 AND_ANY (any secondary present), 1 NOT_ALL (fails when all are present), 2 NOT_ANY (fails
   *  when any is present), 3 AND_ALL (all must be present). */
  selectiveLogic: number
  caseSensitive?: boolean // absent = insensitive
  content: string
  always: boolean // inject regardless of keys (a card's `constant`)
  enabled: boolean
  scanDepth?: number // trailing messages to scan for keys; absent = the book's, then defaultDepth
  order: number // position among matches (a card's `insertion_order`)
  position: EntryPosition
  depth?: number // messages from the end, for `atDepth` only; absent = 4, SillyTavern's default
  // The untouched card entry, same contract as Character.rawCard. Preserves fields this release
  // ignores (probability, excludeRecursion, characterFilter, group weighting) across import/export.
  raw?: unknown
}

/** Anything that renders as an avatar. Character and Persona both satisfy it structurally. */
export interface AvatarSource {
  avatar: string
  avatarCrop?: AvatarCrop
}

/** Per-speaker color overrides. An empty string on any field means "no override, use the global
 *  color". Flat and named to mirror Appearance. */
export interface CharacterColors {
  textColor: string
  emphasisColor: string
  boldColor: string
  quoteColor: string
}

export function emptyColors(): CharacterColors {
  return { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' }
}

/** Partial patches over a Connection's params. Field names mirror Connection exactly. An unset
 *  field falls through to the next level down (chat > character > connection). */
export interface ParamOverrides {
  contextLimit?: number
  safetyMarginPct?: number
  /** Sampler overrides, keyed by the param's JSON key (`temperature`, `dry_multiplier`, etc). A key
   *  absent here inherits. A key the connection doesn't carry is ignored. */
  params?: Record<string, unknown>
}

/** The description used: the active variant, or `description` when there isn't one. */
export function activeDescription(c: Character): string {
  const variant = c.altDescriptions[c.activeDescriptionIndex]
  return c.activeDescriptionIndex >= 0 && variant ? variant.content : c.description
}

/** Who you're in a chat: the {{user}} name, plus description text a stack can bind to. */
export interface Persona {
  id?: number
  ownerId: string
  name: string
  avatar: string // base64 data URL of the original, uncropped image; '' when unset
  avatarCrop?: AvatarCrop // how to frame `avatar`; unset shows the whole image
  description: string
  createdAt: number
  updatedAt: number
  colors: CharacterColors // per-speaker overrides; each '' = fall through to the global appearance color
  /** Ids of deleted personas this one stands in for. Old messages and games keep the id they were
   *  stamped with. `personaById` matches it here, so they show this persona's picture. */
  formerIds?: number[]
}

export interface Chat {
  id?: number
  ownerId: string
  characterId: number // first participant
  title: string
  /** Group chats. Empty/absent = solo, and `characterId` remains the character. */
  participantIds?: number[]
  /** Round-robin cursor: index into participantIds of whoever spoke last. */
  lastSpeakerIndex?: number
  /** Pinned responder: only this participant replies to your messages, until cleared. Absent =
   *  round robin. Clicking a roster avatar still triggers anyone manually. */
  respondWith?: number
  /** Label every turn with who said it, even with a one-character roster. Absent = labels only in
   *  a genuine group, as `isGroup` decides. */
  nameSpeakers?: boolean
  /** This chat's own prompt stack, overriding the globally active one. Absent = use the global. */
  stackId?: number
  /** Keep the round robin going after your message instead of stopping at one reply. */
  selfReply?: boolean
  /** How many characters reply to each of your messages. Capped at the roster size. Default 1. */
  selfReplyCount?: number
  /** Width of the chat area as a percentage of its container. Default 100. */
  chatWidth?: number
  /** Lorebooks attached to this chat alone, on top of the speaker's and every global one. Absent =
   *  none. Never exported with the chat. */
  lorebookIds?: number[]
  /** Character and global books switched off for this chat alone. Absent = none. */
  lorebooksOff?: number[]
  /** Player tracker edits made before any message. Messages carry later ones. */
  trackerOverrides?: Record<string, TrackerValue>
  authorNote?: string
  authorNoteDepth?: number // messages from the end; default 2
  /** Pinned to the sidebar for quick access. Absent = not bookmarked. */
  bookmarked?: boolean
  paramOverrides?: ParamOverrides
  /** Per-chat agent override: on/off and display mode. */
  agent?: ChatAgent
  /** This chat's post-processing stack, overriding the global default. Absent = use the default. */
  postStackId?: number
  /** Text rule sets in priority order: 'global', 'stack:<id>', or a user set's id. Absent =
   *  Global plus the stack's own set, if it has one. */
  ruleSetIds?: string[]
  createdAt: number
  updatedAt: number
}

/** Who a turn is attributed to, when it's not the active persona. */
export interface SpeakerAs {
  name: string
  personaId?: number
}

export interface Message {
  id?: number
  ownerId: string
  chatId: number
  role: 'user' | 'assistant'
  content: string // exactly what was typed/streamed, never transformed
  // Stamped on user turns at send time. Absent on assistant turns and on pre-persona messages.
  personaId?: number
  personaName?: string
  /** Alternates for an assistant message. Empty/absent = never regenerated. `content` always
   *  mirrors swipes[swipeIndex]. */
  swipes?: string[]
  swipeIndex?: number
  /** The model's reasoning for each swipe, parallel to `swipes` (holes where none/absent). Kept
   *  out of `content`. It renders separately and is never fed back into history. */
  reasonings?: (string | undefined)[]
  /**
   * Where an inline think block ends in `content`, for a text-completion model that writes its
   * thinking into the reply. `content.slice(reasoningEnd)` is the reply proper. The text stays
   * whole: this is a marker, not a split.
   */
  reasoningEnd?: number
  /** Which character said this, in a group chat. Absent = the chat's single character. */
  speakerId?: number
  speakerName?: string
  /** The text as the writing model produced it, for each swipe the agent pass changed. `content`
   *  and `swipes[i]` hold what the pass produced; this holds what was said first. Holes on swipes
   *  the pass left alone. Unindexed. Original and final only, no intermediate stages. */
  passOriginals?: (string | undefined)[]
  /** What the pass did to each swipe, in one line, for the bubble. Absent where it did nothing. */
  passSummaries?: (string | undefined)[]
  /** Why a stage's candidate was thrown away, parallel to `swipes`. Drives the marker and the
   *  retry action, cleared on a run that keeps something. */
  passFailed?: (string | undefined)[]
  /** The `<state>` parse of each swipe, parallel to `swipes`. Holes where the card had no trackers. */
  trackerUpdates?: (StateParse | undefined)[]
  /** The acrostic behind each swipe: seed, template and letter fit. Parallel to `swipes`, holes where
   *  a swipe was generated normally. Unindexed. */
  acrostics?: (AcrosticRecord | undefined)[]
  /** Player tracker edits made while this was the last message. Survive swipes. */
  trackerOverrides?: Record<string, TrackerValue>
  /** A `/break` row: a rule drawn across the chat, with empty content. `buildPrompt` drops it. */
  divider?: boolean
  createdAt: number
}

/** A Story is the top-level Write work: one plain-text document plus the plan beside it. It holds
 *  no stack id; the Story stack is globally active. */
export interface Story {
  id?: number
  ownerId: string
  title: string
  cover: string // cropped 3:4 data URL, '' when unset (placeholder shown)
  /** Attached characters/personas with their per-entry on/off state. */
  cast: CastEntry[]
  /** The whole document as typed markdown. A line starting `# ` is a chapter heading. Stored exactly
   *  as the model sees it. */
  text: string
  /** Where the story starts. Reaches the prompt as {{premise}}. */
  premise: string
  /** Where it's meant to land. Reaches the prompt as {{ending}}. */
  ending: string
  /** The path between them: a checklist the Author ticks. Guidance only, tied to no prose. */
  beats: Beat[]
  /** The Author's Note: a standing instruction sent on every generation as {{note}}. */
  note: string
  /** Percent of the editor column the prose is displayed at. Absent = 100. */
  storyWidth?: number
  /** Text rule sets in priority order, as on a Chat. Only their Find & Replace rules reach the
   *  document. Absent = Global plus the Story stack's own set, if it has one. */
  ruleSetIds?: string[]
  /** Standalone lorebooks the Author attached to this Story. Books a cast character carries are
   *  derived from the cast, not listed here. Absent = none. Never exported with the Story. */
  lorebookIds?: number[]
  /** Book ids switched off for this Story, whichever way the book got here. The row greys out and
   *  its entries stop reaching the prompt; the attachment itself is left alone. Absent = all on. */
  lorebookOff?: number[]
  /** Book ids the Author removed from this Story's list that this Story didn't attach itself: a
   *  cast character's book, or a global one. Absent = nothing removed. */
  lorebookDropped?: number[]
  createdAt: number
  updatedAt: number
}

/** One thing that should happen. The first one not done is the current beat. */
export interface Beat {
  id: string // crypto.randomUUID(); beats have no table
  text: string
  done: boolean
}

export interface CastEntry {
  kind: 'character' | 'persona'
  id: number
  enabled: boolean
}

/**
 * A named, typed value declared in a stack's template with `{% var %}` (see
 * `core/prompt/stackTemplate.ts`): `{{id}}` pastes it and `{% if id ... %}` branches on it. A range
 * is two numbers, read as `{{id_start}}` and `{{id_end}}`. Never stored: parsed from the template,
 * with `value` taken from `PromptStack.values` when set there.
 */
export type StackVariable =
  | { id: string; label: string; info?: string; kind: 'sliderSingle'; min: number; max: number; step: number; value: number }
  | { id: string; label: string; info?: string; kind: 'sliderRange'; min: number; max: number; step: number; value: [number, number] }
  | { id: string; label: string; info?: string; kind: 'dropdown'; options: string[]; value: string }
  | { id: string; label: string; info?: string; kind: 'checkbox'; value: boolean }
  | { id: string; label: string; info?: string; kind: 'text'; value: string }
  /** `value` is dice notation (`1d20`, `2d6+3`), rolled once per send. See `core/prompt/dice.ts`. */
  | { id: string; label: string; info?: string; kind: 'dice'; value: string }
  /** One item per line in `value`. The prompt reads the non-blank lines joined by `sep`. */
  | { id: string; label: string; info?: string; kind: 'list'; sep: string; value: string }
  /** A number with three presets (short, medium, long) and a unit. Write's toolbar shows one named
   *  `length` as S/M/L buttons plus a box. The prompt reads `{{id}}` and `{{id_unit}}`. */
  | { id: string; label: string; info?: string; kind: 'length'; presets: [number, number, number]; unit: string; value: number }

export type StackValue = StackVariable['value']

export interface PromptStack {
  id?: number
  ownerId: string
  name: string
  /** Chat stacks and Story (Write mode) stacks share this table but never mix. Absent = 'chat'
   *  for rows written before the field existed. */
  kind?: 'chat' | 'story'
  /** The whole prompt as one template. See `core/prompt/stackTemplate.ts`. */
  template: string
  /** Players' current variable values by id. Absent key = the template's default. Shared by every
   *  chat on the stack. */
  values?: Record<string, StackValue>
  /** Tokens the three World info slots may take between them. Absent or 0 = no cap. Entries are
   *  filled in priority order (`entry.order`) and the rest are dropped. */
  worldInfoBudget?: number
  /** Overrides for the small utility prompts (`core/prompt/miscPrompts.ts`), keyed by def id.
   *  Absent, or a blank entry, means the built-in wording. */
  miscPrompts?: Record<string, string>
  /** A custom layout for the stack's controls in the chat and Story panels. Absent = the standard
   *  list. See `modules/prompts/stackLook.ts`. */
  look?: StackLook
  /** Lets the look load addresses outside the page (images, fonts). Set by this browser's user,
   *  never by a file: `stackFile.ts` drops it on export and import. */
  allowRemote?: boolean
  /** The stack's own tag and find/replace rules, picked per chat. Travels with the stack file. */
  textRules?: TextRules
}

export interface TextRules {
  tagRules: TagRule[]
  replaceRules: ReplaceRule[]
}

/** Maker-written HTML and CSS for a stack's controls. `data-var="id"` marks where a control goes. */
export interface StackLook {
  html: string
  css: string
  /** Variables without a data-var slot aren't shown. Their values still apply. */
  hideUnplaced?: boolean
}

/** A named post-processing config. Shareable: it carries no connection and no key. */
export interface PostStack {
  id?: number
  ownerId: string
  name: string
  config: PostStackConfig
  createdAt: number
  updatedAt: number
}

/**
 * One played game. Append-only: the seed reproduces the deal and the events reproduce every state
 * after it. A game isn't a chat: it sees no chat history and writes no messages.
 */
export interface Game {
  id?: number
  ownerId: string
  /** Which game this is, and which half of `GameEvent` its log is. */
  kind: GameKind
  characterId: number
  characterName: string // copied: it survives deleting the character
  personaId?: number
  personaName?: string
  stackId?: number
  /** How well the character plays. Go Fish only; Blackjack's dealer has no decisions to make.
   *  Absent = 'average'. */
  difficulty?: MoveQuality
  /** Standing instruction for this game, the same field a chat carries. Reaches the prompt through
   *  the stack's Author's note block; empty or absent contributes nothing. */
  authorNote?: string
  seed: number
  /** Unindexed. */
  events: GameEvent[]
  status: 'playing' | 'finished' | 'abandoned'
  createdAt: number
  updatedAt: number
}

/**
 * An uploaded background image. Its own table rather than a field on the palette. Referenced by
 * `Background.imageId`.
 */
export interface BackgroundImage {
  id?: number
  ownerId: string
  name: string // the uploaded file's name, shown in the picker
  dataUrl: string // base64 data URL, the same way avatars are stored
}
