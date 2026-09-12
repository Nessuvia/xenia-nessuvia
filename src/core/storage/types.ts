import type { MoveQuality } from '../games/goFish'
import type { GameEvent, GameKind } from '../games/gameEvent'
import type { SecondSweepOverride } from '../secondSweep/resolve.ts'

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

/** A text block's live content: the chosen option, or plain `content` when there are no options. */
export function activeContent(block: PromptBlock): string {
  if (!block.options) return block.content
  return block.options[block.activeOption ?? 0]?.content ?? ''
}

/** The description actually used: the active variant, or `description` when there isn't one. */
export function activeDescription(c: Character): string {
  const variant = c.altDescriptions[c.activeDescriptionIndex]
  return c.activeDescriptionIndex >= 0 && variant ? variant.content : c.description
}

/** Who you are in a chat: the {{user}} name, plus description text a stack can bind to. */
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
  authorNote?: string
  authorNoteDepth?: number // messages from the end; default 2
  /** Pinned to the sidebar for quick access. Absent = not bookmarked. */
  bookmarked?: boolean
  paramOverrides?: ParamOverrides
  /** Per-chat Second Sweep override: whether the pass runs here, and which pipeline it runs. */
  secondSweep?: SecondSweepOverride
  createdAt: number
  updatedAt: number
}

/** Who a turn is attributed to, when it is not the active persona. */
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
  /** The request that produced each swipe, parallel to `swipes`, for the inspector. Each entry is
   *  a key-free JSON string, undefined where no snapshot was taken or it was past ~256 KB.
   *  Unindexed. */
  requestSnapshots?: (string | undefined)[]
  /** The text as the writing model produced it, for each swipe Second Sweep changed. `content`
   *  and `swipes[i]` hold what the pass produced; this holds what was said first. Holes on swipes
   *  the pass left alone. Unindexed. Original and final only, no intermediate stages. */
  passOriginals?: (string | undefined)[]
  /** What the pass did to each swipe, in one line, for the bubble. Absent where it did nothing. */
  passSummaries?: (string | undefined)[]
  /** Why a stage's candidate was thrown away, parallel to `swipes`. Drives the marker and the
   *  retry action, cleared on a run that keeps something. */
  passFailed?: (string | undefined)[]
  /** A `/break` row: a rule drawn across the chat, with empty content. `buildPrompt` drops it. */
  divider?: boolean
  createdAt: number
}

/** A Story is the top-level Write work: title + cover, plus its attached cast. It holds no stack
 *  id; the Story stack is globally active. Its prose lives in Chapters. */
export interface Story {
  id?: number
  ownerId: string
  title: string
  cover: string // cropped 3:4 data URL, '' when unset (placeholder shown)
  /** Attached characters/personas with their per-entry on/off state. */
  cast: CastEntry[]
  /** The Author's standing instruction for this Story: read on every generation, never cleared,
   *  sent as the final user turn. */
  direction: string
  /** Percent of the editor column the prose is displayed at. Absent = 100. */
  storyWidth?: number
  /** Sampling overrides for this Story, over the connection's own values. */
  paramOverrides?: ParamOverrides
  /** The opening situation, edited on the Plot Layout tab before Chapter 1. Reaches the model only
   *  through {{premise}}, if the Story stack places it. */
  premise?: string
  /** The intended ending, edited on the Plot Layout tab after the last Chapter. Reaches the model
   *  only through {{ending}}, if the Story stack places it. */
  ending?: string
  /** What the work is meant to be about, one line or a list. Reaches the model through {{themes}}. */
  themes?: string
  genre?: string
  tone?: string
  setting?: string
  /** The whole work's word target, set by the length preset on the Story generation screen.
   *  0 or absent = unset. */
  targetWords?: number
  /** Premise and Ending render as thin markers on the Plot Layout strip when true. */
  capsCollapsed?: boolean
  /** Standalone lorebooks the Author attached to this Story. Books a cast character carries are
   *  derived from the cast, not listed here. Absent = none. Never exported with the Story. */
  lorebookIds?: number[]
  /** Book ids switched off for this Story, whichever way the book got here. The row greys out and
   *  its entries stop reaching the prompt; the attachment itself is left alone. Absent = all on. */
  lorebookOff?: number[]
  /** Book ids the Author removed from this Story's list that this Story did not attach itself: a
   *  cast character's book, or a global one. Absent = nothing removed. */
  lorebookDropped?: number[]
  createdAt: number
  updatedAt: number
}

export interface CastEntry {
  kind: 'character' | 'persona'
  id: number
  enabled: boolean
}

/** How long a beat runs relative to the others in its Chapter. Five named sizes rather than a
 *  word count. Multipliers live in `core/prompt/beatWeights.ts`. */
export type BeatWeight = 'sketch' | 'brief' | 'normal' | 'long' | 'major'

/** How much of the surrounding prose a Block's generation sees. `both` is the default. */
export type BlockContext = 'before' | 'after' | 'both' | 'none'

/**
 * One beat of a Chapter, and the unit prose is stored in. A Chapter is an ordered list of these.
 */
export interface Block {
  id: string // crypto.randomUUID(); Blocks have no table
  /** The instructions: what is meant to happen here, one line or many. '' is an unplanned beat. */
  beat: string
  /** How long this beat runs relative to its neighbours. The Chapter's word target is divided by
   *  these. See `core/prompt/beatWeights.ts`. */
  weight: BeatWeight
  /** The prose. Named `content`: `core/stores/swipes.ts` accepts a Block unchanged. Mirrors
   *  `swipes[swipeIndex]`. */
  content: string
  /** Alternate versions, in the order they were generated. Absent = the one thing it says. */
  swipes?: string[]
  swipeIndex?: number
  /** The model's reasoning for each swipe, parallel to `swipes` (holes where none/absent). */
  reasonings?: (string | undefined)[]
  /** What the Author asked for when producing each swipe, parallel to `swipes`. A plain re-roll
   *  leaves a hole. */
  instructions?: (string | undefined)[]
  context: BlockContext
}

/** What a Chapter contributes once its prose has been degraded to beat instructions. 'both' gives
 *  the title-and-summary header over the beat lines. 'summary' keeps the header alone, 'beats'
 *  the beat lines under a bare title, 'off' nothing. */
export type GuideSend = 'off' | 'beats' | 'summary' | 'both'

/** An ordered unit of a Story: a title, a recap, and its prose as an ordered list of Blocks. */
export interface Chapter {
  id?: number
  ownerId: string
  storyId: number
  order: number // position within the Story
  title: string
  /** Recap only: what the Chapter turned out to contain. Intent lives in the beats. */
  summary: string
  /** The Chapter's prose and its plan, in one ordered list. Every Block is a beat. */
  blocks: Block[]
  /** Words this Chapter is meant to run to, divided across its beats by their weights. 0 = unset. */
  targetWords: number
  /** What this Chapter contributes once the budget has degraded its prose to beat instructions. */
  guideSend: GuideSend
  createdAt: number
  updatedAt: number
}

export type BlockSource =
  | 'text' // freeform; chat stacks swap {{char}} / {{user}}, story stacks the Story tokens
  | 'characterDescription' // resolves the active description variant
  | 'characterPersonality'
  | 'characterScenario'
  | 'characterExampleDialogue'
  // The card's system_prompt / post_history_instructions. On these two the block's own `content`
  // is the fallback used when the character has none, and is what {{original}} resolves to.
  | 'characterSystemPrompt'
  | 'characterPostHistory'
  | 'personaDescription' // the active persona's description
  | 'authorNote' // the chat's author's note; skipped when empty. Chat stacks only.
  // The three lorebook slots, one per EntryPosition.
  | 'worldInfo' // matched entries positioned beforeChar
  | 'worldInfoAfter' // matched entries positioned afterChar
  | 'worldInfoDepth' // matched entries positioned atDepth
  | 'chatHistory' // mandatory, exactly one per chat stack
  // Story-stack bound sources (Write mode).
  | 'cast' // the Story's enabled characters/personas (full cards)
  | 'storyContext' // the scrolling Story prose; mandatory, exactly one per story stack
  | 'storyTrailing' // prose after the caret, to the end of the active Chapter; empty with no caret

export interface PromptBlock {
  id: string // crypto.randomUUID()
  label: string // 'Block 1' on creation, renamed in the modal
  source: BlockSource
  role: 'system' | 'user' | 'assistant'
  content: string // only meaningful when source === 'text' with no options; the text before any children
  /** Named content variants for a text block. Absent = plain single `content`. Two or more makes
   *  the block pickable in chat settings; `activeOption` chooses which one is used. */
  options?: { name: string; content: string }[]
  activeOption?: number
  /** Text after the children, the closing half of a wrapper (`</characters>`). */
  closeContent?: string
  /** Only meaningful on an authorNote block: inject N messages from the end of history.
   *  Undefined = the block sits where it sits in the stack. */
  depth?: number
  /** Switched off: contributes nothing, children included, but keeps its place in the stack. */
  disabled?: boolean
  /** Shown in chat settings as an on/off checkbox. The on/off value is `disabled`. */
  toggleable?: boolean
  /** Creator's explanation of this block, shown as the tooltip on its control in chat settings. */
  info?: string
  /** Present (even empty) makes this a container. Children render between content and closeContent,
   *  newline-joined, and inherit this block's role. Chat History can't be nested. */
  children?: PromptBlock[]
  /** Present makes this an input block: {{blockVal}} in the content resolves to `value` and
   *  {{blockVal2}} to `value2`. `kind` picks the control shown in chat settings. */
  input?: BlockInput
}

/** Only the range arm is built today. A range carries two values, the two ends of a span, dragged
 *  separately. `value2` is held at or above `value`. Omit `value2` for a single-value scroll. */
export type BlockInput = {
  kind: 'range'
  min: number
  max: number
  step: number
  value: number
  value2?: number
}

export interface PromptStack {
  id?: number
  ownerId: string
  name: string
  /** Chat stacks and Story (Write mode) stacks share this table but never mix. Absent = 'chat'
   *  for rows written before the field existed. */
  kind?: 'chat' | 'story'
  active: PromptBlock[] // order = array order
  /** Tokens the three World info slots may take between them. Absent or 0 = no cap. Entries are
   *  filled in priority order (`entry.order`) and the rest are dropped. */
  worldInfoBudget?: number
  /** Overrides for the small utility prompts (`core/prompt/miscPrompts.ts`), keyed by def id.
   *  Absent, or a blank entry, means the built-in wording. */
  miscPrompts?: Record<string, string>
}

/**
 * One played game. Append-only: the seed reproduces the deal and the events reproduce every state
 * after it. A game is not a chat: it sees no chat history and writes no messages.
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
