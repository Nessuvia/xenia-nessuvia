import type { MoveQuality } from '../games/goFish'
import type { GameEvent, GameKind } from '../games/gameEvent'
import type { NessuPassOverride } from '../nessuPass/resolve.ts'

export interface Character {
  id?: number
  ownerId: string
  name: string
  displayName?: string // shown in lists, the character page, and chats; '' or unset falls back to name. {{char}} and the API payload always use name.
  avatar: string // base64 data URL of the ORIGINAL, uncropped image; '' when unset
  avatarCrop?: AvatarCrop // how to frame `avatar`; unset shows the whole image
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  altDescriptions: { title: string; content: string }[]
  activeDescriptionIndex: number // -1 = use `description` verbatim
  alternateGreetings: string[]
  // Labels for the greetings above, by the same index, the card spec has nowhere to put them, so
  // they ride in our own extensions block and are dropped by any other reader. Absent or short
  // means the rest are unnamed; only the editor writes it, and it splices alongside a delete.
  greetingTitles?: string[]
  // Externally hosted image URLs; nothing is downloaded or stored locally. When local images land,
  // the bytes belong in a `galleryImages` table keyed on characterId (not on this record, which
  // every list load pulls in full) and this becomes an array of {url} | {imageId} objects.
  gallery: string[]
  // Free-text tags. Order matters: tags[0] is the character's group in the picker's grouped view.
  // Unindexed on purpose, the whole roster is in memory, so filtering is an array pass.
  tags: string[]
  /** Card `system_prompt`. Reaches the model through a `characterSystemPrompt` block; empty falls
   *  back to that block's own content. Character-level, so it applies to every chat with them.
   *  per-chat override belongs on Chat as an optional field, when one chat needs to
   *  differ from the rest. */
  systemPrompt: string
  /** Card `post_history_instructions`, the "ujb/jailbreak". Same rules as `systemPrompt`. */
  postHistoryInstructions: string
  // The three below are card metadata. The spec forbids all of them in prompt engineering, so
  // nothing in core/prompt may read them.
  creatorNotes: string
  creator: string
  characterVersion: string
  rawCard?: unknown // original parsed card, untouched
  paramOverrides?: ParamOverrides
  stackId?: number // declared now, no UI until it's wanted
  /** Lorebooks that travel with this character: attached in every chat they speak in. An imported
   *  card's `character_book` lands here as a single id. Absent = none. */
  lorebookIds?: number[]
  createdAt: number
  updatedAt: number
  colors: CharacterColors // per-speaker overrides; each '' = fall through to the global appearance color
}

/**
 * The visible window onto an avatar image, as fractions (0–1) of its natural size. Stored instead
 * of a second cropped copy of the pixels: `avatar` keeps the original the user uploaded, the crop
 * is applied at render time by <Avatar>, and the Gallery can show the whole image.
 */
export interface AvatarCrop {
  x: number
  y: number
  w: number
  h: number
}

/**
 * A lorebook: a named set of entries that exists on its own. Attached to characters
 * (`Character.lorebookIds`), to a single chat (`Chat.lorebookIds`), or to everything at once via
 * `global`. The entries are the big payload and live in the `worldInfo` table, keyed by `bookId`.
 */
export interface Lorebook {
  id?: number
  ownerId: string
  name: string
  description: string
  scanDepth?: number // card's `scan_depth`: the default for entries that don't override it
  tokenBudget?: number // card's `token_budget`: cap on what this book may add to one prompt
  /** Applies to every chat, on top of whatever the character and the chat attach. */
  global: boolean
}

/** Where a matched entry goes in the prompt. `beforeChar`/`afterChar` order it within the World
 *  info block; `atDepth` lifts it out of that block and splices it N messages from the end of
 *  history, the way an author's note with a depth is placed. */
export type EntryPosition = 'beforeChar' | 'afterChar' | 'atDepth'

/**
 * One lorebook entry, owned by one book.
 */
export interface WorldInfoEntry {
  id?: number
  ownerId: string
  bookId: number
  name: string // row label; cards keep it in `comment`, so import falls back through name and keys
  keys: string[] // trigger words; matched case-insensitively unless `caseSensitive`
  /** Gated keys: a primary hit only counts once these pass `selectiveLogic`. Empty = no gate. */
  secondaryKeys: string[]
  /** How `secondaryKeys` gate a primary hit. SillyTavern's numbering, which is what imports carry:
   *  0 AND_ANY (any secondary present), 1 NOT_ALL (fails when all are present), 2 NOT_ANY (fails
   *  when any is present), 3 AND_ALL (all must be present). */
  selectiveLogic: number
  caseSensitive?: boolean // absent = insensitive, which is what most books want
  content: string
  always: boolean // inject regardless of keys (a card's `constant`)
  enabled: boolean
  scanDepth?: number // trailing messages to scan for keys; absent = the book's, then defaultDepth
  order: number // position among matches (a card's `insertion_order`)
  position: EntryPosition
  depth?: number // messages from the end, for `atDepth` only; absent = 4, SillyTavern's default
  // The untouched card entry, same contract as Character.rawCard. This is what keeps the fields
  // this release ignores, probability, excludeRecursion, characterFilter, group weighting, from
  // being lost on import and re-export.
  raw?: unknown
}

/** Anything that renders as an avatar. Character and Persona both satisfy it structurally. */
export interface AvatarSource {
  avatar: string
  avatarCrop?: AvatarCrop
}

/** Per-speaker color overrides. Same set as the global appearance knobs; an empty string on any
 *  field means "no override, use the global color". Flat and named (mirrors Appearance) so it can
 *  grow a field when we actually add one, not an open Record. */
export interface CharacterColors {
  textColor: string
  emphasisColor: string
  boldColor: string
  quoteColor: string
}

export function emptyColors(): CharacterColors {
  return { textColor: '', emphasisColor: '', boldColor: '', quoteColor: '' }
}

/** Partial patches over a Connection's params. Field names mirror Connection exactly, no mapping
 *  layer. An unset field falls through to the next level down (chat > character > connection). */
export interface ParamOverrides {
  contextLimit?: number
  safetyMarginPct?: number
  /** Sampler overrides, keyed by the param's JSON key (`temperature`, `dry_multiplier`, …). A key
   *  absent here inherits; a key the connection doesn't carry is ignored, since overrides change
   *  what a sampler is set to and never which samplers get sent. */
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
  avatar: string // base64 data URL of the ORIGINAL, uncropped image; '' when unset
  avatarCrop?: AvatarCrop // how to frame `avatar`; unset shows the whole image
  description: string
  createdAt: number
  updatedAt: number
  colors: CharacterColors // per-speaker overrides; each '' = fall through to the global appearance color
}

export interface Chat {
  id?: number
  ownerId: string
  characterId: number // stays populated (first participant) so existing queries keep working
  title: string
  /** Group chats. Empty/absent = solo, and `characterId` remains the character. */
  participantIds?: number[]
  /** Round-robin cursor: index into participantIds of whoever spoke last. */
  lastSpeakerIndex?: number
  /** Pinned responder: only this participant replies to your messages, until cleared. Absent =
   *  round robin. Clicking a roster avatar still triggers anyone manually. */
  respondWith?: number
  /** Label every turn with who said it, even with a one-character roster. Several *people* speak
   *  in a multiplayer session even when one character replies, so the labels earn their tokens.
   *  Absent = labels only in a genuine group, as `isGroup` decides. */
  nameSpeakers?: boolean
  /** This chat's own prompt stack, overriding the globally active one. Absent = use the global.
   *  A multiplayer session sets it so the session's stack cannot leak into ordinary chats. */
  stackId?: number
  /** Keep the round robin going after your message instead of stopping at one reply. */
  selfReply?: boolean
  /** How many characters reply to each of your messages. Capped at the roster size, so nobody
   *  speaks twice in a row. Default 1. */
  selfReplyCount?: number
  /** Width of the chat area as a percentage of its container. Default 100. */
  chatWidth?: number
  /** Lorebooks attached to this chat alone, on top of the speaker's and every global one. Absent =
   *  none. Never exported with the chat: book ids mean nothing on another device. */
  lorebookIds?: number[]
  authorNote?: string
  authorNoteDepth?: number // messages from the end; default 2
  /** Pinned to the sidebar for quick access. Absent = not bookmarked. */
  bookmarked?: boolean
  paramOverrides?: ParamOverrides
  /** Per-chat Nessu's Pass override: whether the pass runs here, and which pipeline it runs.
   *  The chat toggle writes *this* record, never the pipeline and never the global default. A
   *  chat that never touches the override inherits global. */
  nessuPass?: NessuPassOverride
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
  // Stamped on user turns at send time. The name is a copy on purpose: delete the persona and
  // old turns still show who said them. Absent on assistant turns and on pre-persona messages.
  personaId?: number
  personaName?: string
  /** Alternates for an assistant message. Empty/absent = never regenerated.
   *  `content` always mirrors swipes[swipeIndex]; readers that don't care about swipes keep working.
   *  swipes duplicate the chosen text into content, one denormalised field beats
   *  touching every reader. */
  swipes?: string[]
  swipeIndex?: number
  /** The model's reasoning for each swipe, parallel to `swipes` (holes where none/absent). Kept out
   *  of `content` so it's rendered separately and never fed back into history on later turns. */
  reasonings?: (string | undefined)[]
  /** Which character said this, in a group chat. Absent = the chat's single character. */
  speakerId?: number
  speakerName?: string
  /** The request that produced each swipe, parallel to `swipes`, for the inspector. Each entry is
   *  a key-free JSON string, a string so Dexie never indexes into it, and undefined where the
   *  snapshot was never taken or was past ~256 KB. The field is unindexed, so its shape can change
   *  without a schema version. */
  requestSnapshots?: (string | undefined)[]
  /** The text as the writing model produced it, for each swipe Nessu's Pass changed. `content`
   *  and `swipes[i]` hold what the pass produced; this holds what was said first. Kept so a
   *  manual re-run always starts from the original rather than compounding, and so the user can
   *  revert. Holes on swipes the pass left alone. Unindexed, like the other parallel arrays.
   *
   *  Original and final only: a pipeline can have any number of stages, and storing every
   *  intermediate would grow the record with text nobody reads twice. */
  passOriginals?: (string | undefined)[]
  /** What the pass did to each swipe, in one line, for the bubble. Absent where it did nothing. */
  passSummaries?: (string | undefined)[]
  /** Why a stage's candidate was thrown away, parallel to `swipes`. Drives the marker and the
   *  retry action, and is cleared on a run that keeps something. A reason rather than a boolean so
   *  the marker can name which failure it was without a second field. */
  passFailed?: (string | undefined)[]
  /** A `/break` row: a rule drawn across the chat, with empty content. Kept in `messages` so it
   *  holds its place in the order; `buildPrompt` drops it, so the model never sees it. */
  divider?: boolean
  createdAt: number
}

/** A Story is the top-level Write work: title + Cover, plus its attached cast. It holds no stack id
 * , the Story stack is globally active (sub-goal B). Its prose lives in Chapters, not here. */
export interface Story {
  id?: number
  ownerId: string
  title: string
  cover: string // cropped 3:4 data URL, '' when unset (placeholder shown)
  /** Attached characters/personas with their per-entry on/off state. Cast wiring is sub-goal C;
   *  the shape lands now so the Story row doesn't need a schema bump later. */
  cast: CastEntry[]
  /** The Author's standing instruction for this Story: read on every generation, never cleared,
   *  and sent as the final user turn. The Direction box in the Story panel writes it. */
  direction: string
  /** Percent of the editor column the prose is displayed at. Per Story, like the Chat record's
   *  `chatWidth`, reading width is a property of the work, not a global default. Absent = 100. */
  storyWidth?: number
  /** Sampling overrides for this Story, over the connection's own values. The cast contributes
   *  nothing: with several characters attached there is no non-arbitrary winner. */
  paramOverrides?: ParamOverrides
  /** The opening situation, edited on the Plot Layout tab before Chapter 1. Reaches the model only
   *  through {{premise}}, if the Story stack places it. */
  premise?: string
  /** The intended ending, edited on the Plot Layout tab after the last Chapter. Reaches the model
   *  only through {{ending}}, if the Story stack places it. */
  ending?: string
  /** What the work is meant to be about, one line or a list. Feeds Story generation and reaches the
   *  model through {{themes}}. */
  themes?: string
  genre?: string
  tone?: string
  setting?: string
  /** The whole work's word target, set by the length preset on the Story generation screen. Kept so
   *  regenerating an outline opens on what was asked for last time, and so the Plot Layout can show
   *  the Story's chapter targets against a whole. 0 or absent = unset. */
  targetWords?: number
  /** Premise and Ending render as thin markers on the Plot Layout strip when true. */
  capsCollapsed?: boolean
  /** Standalone lorebooks the Author attached to this Story. Books a cast character carries are
   *  not listed here: those are derived from the cast, so adding the character is what attaches
   *  them. Absent = none. Never exported with the Story: book ids mean nothing on another device. */
  lorebookIds?: number[]
  /** Book ids switched off for this Story, whichever way the book got here. The row greys out and
   *  its entries stop reaching the prompt; the attachment itself is left alone. Absent = all on. */
  lorebookOff?: number[]
  /** Book ids the Author removed from this Story's list that this Story did not attach itself: a
   *  cast character's book, or a global one. Without this the next render would derive them
   *  straight back. Absent = nothing removed. */
  lorebookDropped?: number[]
  createdAt: number
  updatedAt: number
}

export interface CastEntry {
  kind: 'character' | 'persona'
  id: number
  enabled: boolean
}

/** How long a beat runs relative to the others in its Chapter. Five named sizes rather than a word
 *  count: the Author is saying "this one is the big scene", and the words fall out of the Chapter's
 *  target. Multipliers live in `core/prompt/beatWeights.ts`. */
export type BeatWeight = 'sketch' | 'brief' | 'normal' | 'long' | 'major'

/** How much of the surrounding prose a Block's generation sees. `both` is the default; the other
 *  three are how you write a passage that shouldn't be coloured by what sits around it, a flashback,
 *  an opening drafted before the scene leading into it exists. */
export type BlockContext = 'before' | 'after' | 'both' | 'none'

/**
 * One beat of a Chapter, and the unit prose is actually stored in. A Chapter is an ordered list of
 * these, and there is no second kind: free prose was removed, so an empty `beat` is an ordinary
 * unwritten beat rather than a different sort of Block.
 */
export interface Block {
  id: string // crypto.randomUUID(); Blocks have no table, so they need their own key
  /** The instructions: what is meant to happen here, one line or many. '' is a beat the Author has
   *  not planned yet. When the prose no longer fits the window, this is what the Block sends. */
  beat: string
  /** How long this beat runs relative to its neighbours. The Chapter's word target is divided by
   *  these, so a climax gets more words than a transition. There is no per-beat word number: see
   *  `core/prompt/beatWeights.ts`, which derives them. */
  weight: BeatWeight
  /** The prose. Named `content` so `core/stores/swipes.ts` accepts a Block unchanged; it always
   *  mirrors `swipes[swipeIndex]`, the same denormalisation `Message` uses. */
  content: string
  /** Alternate versions, in the order they were generated. Absent = the one thing it says. */
  swipes?: string[]
  swipeIndex?: number
  /** The model's reasoning for each swipe, parallel to `swipes` (holes where none/absent). */
  reasonings?: (string | undefined)[]
  /** What the Author asked for when producing each swipe, parallel to `swipes`. A plain re-roll
   *  leaves a hole. Regenerating sends every instruction up to the selected swipe, so this is the
   *  record of what the current take was asked to be, not decoration. */
  instructions?: (string | undefined)[]
  context: BlockContext
}

/** What a Chapter contributes once its prose has been degraded to beat instructions, which is the
 *  only time this is read: full prose is sent whatever it says. 'both' is the default and the
 *  useful one, giving the Chapter's title-and-summary header over its beat lines. 'summary' keeps
 *  the header alone, 'beats' the beat lines under a bare title, 'off' nothing at all. */
export type GuideSend = 'off' | 'beats' | 'summary' | 'both'

/** An ordered unit of a Story: a title, a recap, and its prose as an ordered list of Blocks. A
 *  Story is a list of these, starting at one. The plan is the beat Blocks; the summary is the
 *  recap. */
export interface Chapter {
  id?: number
  ownerId: string
  storyId: number
  order: number // position within the Story
  title: string
  /** Recap only: what the Chapter turned out to contain. Intent lives in the beats. */
  summary: string
  /** The Chapter's prose and its plan, in one ordered list. Every Block is a beat. Empty is the
   *  ordinary state of a Chapter that has not been outlined yet; the editor offers to generate. */
  blocks: Block[]
  /** Words this Chapter is meant to run to, divided across its beats by their weights. 0 = unset,
   *  which leaves every derived beat target at 0 and sends no length instruction. */
  targetWords: number
  /** What this Chapter contributes once the budget has degraded its prose to beat instructions.
   *  Its full prose sends whatever this says, for as long as it fits. */
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
  // The three lorebook slots, one per EntryPosition. Each is skipped when nothing matched for it.
  // `worldInfo` keeps its name rather than becoming `worldInfoBefore`: stacks written before the
  // split carry it, and it still means the same slot.
  | 'worldInfo' // matched entries positioned beforeChar
  | 'worldInfoAfter' // matched entries positioned afterChar
  // Entries positioned atDepth. The block carries the role they're injected with; each entry's own
  // `depth` decides how far back it lands, so the block's place in the stack doesn't matter.
  | 'worldInfoDepth'
  | 'chatHistory' // mandatory, exactly one per chat stack
  // Story-stack bound sources (Write mode). Wiring lives in sub-goal C; here they're just sources.
  | 'cast' // the Story's enabled characters/personas (full cards)
  | 'storyContext' // the scrolling Story prose; mandatory, exactly one per story stack
  | 'storyTrailing' // prose after the caret, to the end of the active Chapter; empty with no caret

export interface PromptBlock {
  id: string // crypto.randomUUID()
  label: string // 'Block 1' on creation, renamed in the modal
  source: BlockSource
  role: 'system' | 'user' | 'assistant'
  content: string // only meaningful when source === 'text' with no options; the text *before* any children
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
   *  {{blockVal2}} to `value2`. `kind` picks the control shown in chat settings; the substitution
   *  is the same for every kind. */
  input?: BlockInput
}

/** Only the range arm is built today; add a new arm + its modal/chat control per new kind.
 *  A range carries two values, the two ends of a span, dragged separately. `value2` is held at
 *  or above `value`. Omit `value2` for a single-value scroll: one thumb, and {{blockVal2}}
 *  resolves to `value` too. */
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
  /** Tokens the three World info slots may take between them. Absent or 0 = no cap, which is what
   *  every stack has until it's set. Entries are filled in priority order (`entry.order`) and the
   *  rest are dropped, so lore yields to the budget instead of chat history yielding to lore.
   *  A plain field, not indexed: no Dexie version bump. */
  worldInfoBudget?: number
  /** Overrides for the small utility prompts (`core/prompt/miscPrompts.ts`), keyed by def id.
   *  Absent, or a blank entry, means the built-in wording. Not indexed and not versioned, a plain
   *  field, so an older row simply has none. */
  miscPrompts?: Record<string, string>
}

/**
 * One played game. Append-only: the seed reproduces the deal and the events reproduce every state
 * after it, so nothing about the board is stored and a finished game replays turn by turn.
 * A game is not a chat. It sees no chat history and writes no messages.
 */
export interface Game {
  id?: number
  ownerId: string
  /** Which game this is, and which half of `GameEvent` its log is. */
  kind: GameKind
  characterId: number
  characterName: string // copied, so it survives deleting the character
  personaId?: number
  personaName?: string
  stackId?: number
  /** How well the character plays. Go Fish only today; Blackjack's dealer has no decisions to
   *  make. Absent = 'average', which is what every game before the setting existed was played at. */
  difficulty?: MoveQuality
  /** Standing instruction for this game, the same field a chat carries. Reaches the prompt through
   *  the stack's Author's note block; empty or absent contributes nothing. */
  authorNote?: string
  seed: number
  /** Unindexed, so the event shape can change without a schema version. */
  events: GameEvent[]
  status: 'playing' | 'finished' | 'abandoned'
  createdAt: number
  updatedAt: number
}

/**
 * An uploaded background image. Its own table rather than a field on the palette: a palette list
 * load pulls every row in full, and a wallpaper as base64 is orders of magnitude bigger than the
 * rest of the record. Referenced by `Background.imageId`.
 */
export interface BackgroundImage {
  id?: number
  ownerId: string
  name: string // the uploaded file's name, shown in the picker
  dataUrl: string // base64 data URL, the same way avatars are stored
}
