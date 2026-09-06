import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StructuredMode } from '../palette/palettePrompt'
import type { ConnectionType, InstructTemplate, ParamValue } from '../params/paramDef.ts'
// Extensioned: this store is reachable from checkDirtyTables.ts under node --strip-types.
import { tableNames, type TableName } from '../storage/storageInterface.ts'
import { emptyBucketConfig, type BucketConfig } from '../sync/bucketConfig.ts'
import { emptyRelayConfig, type RelayConfig } from '../multiplayer/relayConfig.ts'
import type { TokenizerId } from '../prompt/tokenizers.ts'
// The bundled rule set, in its own file: it carries the upstream MIT notice with it.
import { defaultBundle, defaultSecondPassRules } from '../secondPass/defaultRules.ts'

export { defaultBundle, defaultSecondPassRules }

/** The three colorable inline markers, distinct from plain text. Order in `Palette.colorOrder`
 *  is top-first (strongest first), see renderText for how precedence resolves. */
export type MarkerKind = 'emphasis' | 'bold' | 'quotes'

export interface Connection {
  id: string
  name: string
  endpointUrl: string
  apiKey: string
  model: string
  /** Vision flag from the provider's model list, set when the model is picked from it.
   *  Undefined (a free-typed model) counts as no vision. */
  modelVision?: boolean
  /** Extra query params for the /models request, as `key:value, key:value` (e.g. NanoGPT's
   *  `model_scope:subscription`). Free text; parsed at request time. */
  modelQuery?: string
  /** What the endpoint speaks. `chat` posts `messages`, `text` posts a flattened `prompt`. */
  type: ConnectionType
  /** Every sampler this connection sends, in the order the user arranged them, each referencing a
   *  `ParamDef` by its JSON key. A param that isn't here isn't sent at all. */
  params: ParamValue[]
  /** How messages are flattened for `type: 'text'`. Unset uses `defaultTemplate()` (ChatML). */
  template?: InstructTemplate
  /** Budget inputs, not request fields: none of the three is ever sent. */
  contextLimit: number
  safetyMarginPct: number
  /** Which tokenizer counts this connection's prompts. Undefined means `auto`, guessed from the
   *  model name. Connection-level and not in `overridableFields`: this describes the model the
   *  connection points at, not a preference. Per-chat override is the upgrade path if wanted. */
  tokenizer?: TokenizerId
  /** How much structure this endpoint accepts on a request, learned on the first palette ask
   *  rather than configured. Undefined means it has not been tried yet. */
  structuredOutput?: StructuredMode
}

export function newConnection(): Connection {
  return {
    id: crypto.randomUUID(),
    name: 'New connection',
    endpointUrl: '',
    apiKey: '',
    model: '',
    type: 'chat',
    // Empty on purpose: the editor fills it from the recommended set as soon as it opens, so the
    // seeded library is the single source of both the key list and the defaults.
    params: [],
    contextLimit: 32768,
    safetyMarginPct: 5,
  }
}

/**
 * A literal open/close pair to pull out of model output. Literal rather than regex: no escaping
 * rules for the user to learn, `[header]…[endheader]` works the same as `<think>…</think>`, and
 * untrusted model text can't hand us a pathological pattern.
 */
export interface TagRule {
  id: string
  open: string
  close: string
  mode: 'hide' | 'collapse'
  /** Summary text in collapse mode. Falls back to the open marker. */
  label?: string
  /** How many messages, counting from the newest (1 = only while it's the last message), this
   *  tag's block stays in the prompt sent to the model. Undefined = always sent. Stored text and
   *  the on-screen block are never affected, this is a send-path filter only. */
  depth?: number
}

/**
 * Display-only find/replace. `find` is a literal string unless `regex` is set, in which case it's
 * a raw JS pattern; `flags` and `$1` capture refs in `replace` then work like `String.replace`.
 * Applied at render time only, stored message content is never rewritten.
 */
export interface ReplaceRule {
  id: string
  find: string
  replace: string
  regex: boolean // false = escape `find` as a literal
  flags: string // e.g. 'g', 'gi'; simple rows default to 'g'
  target: 'both' | 'user' | 'assistant'
  enabled: boolean
}

/**
 * A Grammar Hammer rule. `strip` deletes the whole match; `replace` swaps it for `replacement`,
 * which may reference capture groups (`$1..$n`, one per pattern token; `$0` = whole match), like
 * Find & Replace but with a part-of-speech find.
 *
 * `flag` edits nothing and hands the match to the Second Pass model as a note instead. The split is
 * whether the fix is mechanical. `with a [adj] [noun]` cuts cleanly and `repairAll` tidies the seam,
 * so no model is wanted. `[adv] [adj]` is a judgment call, and cutting it blind deletes "quietly
 * furious" along with the filler.
 */
export interface GrammarHammerRule {
  id: string
  enabled: boolean
  label?: string
  pattern: string // DSL source, e.g. `with a [adj] [noun]`
  action: 'strip' | 'replace' | 'flag'
  replacement?: string // used when action === 'replace'; '' collapses to a strip
  scope: 'assistant' | 'user' | 'both'
  caseSensitive: boolean
}

/**
 * Second Pass: every prose generation is buffered, run through the deterministic checks, and
 * sent back to a model for a targeted edit before it is stored.
 *
 * The Grammar Hammer rules live here rather than under `Appearance` because what they produce is
 * stored text, not a display filter. Rendering them was the old behavior and it never told the
 * model anything: storage kept the slop, the prompt is built from storage, and the model read its
 * own worst phrasing back on every turn.
 */
export interface SecondPassSettings {
  enabled: boolean
  /** Which connection edits. null = whatever is active; see `resolveConnection`. */
  connectionId: string | null
  /** Nothing flagged means no second request at all, and the draft stands as the reply. */
  skipWhenClean: boolean
  /** Appended to the built instruction. Non-empty, the pass runs even with nothing flagged. */
  userPrompt: string
  /** Write mode only: send generated chapter summaries and beats through the pass as well. Off by
   *  default because an outline of twenty beats is up to twenty extra requests. */
  passBeats: boolean
  rules: GrammarHammerRule[]
  textRules: SecondPassRule[]
  repetition: RepetitionSettings
  sprawl: SprawlSettings
  triplet: TripletSettings
}

/**
 * The tricolon check: sentences built as exactly three comma-separated members.
 *
 * A built-in rather than a rule because the thing that is wrong is a count. There is nothing to
 * match on, which is why the `rule-of-three` note rule keeps failing to stop it.
 */
export interface TripletSettings {
  enabled: boolean
}

/**
 * The sentence-sprawl check: sentences that accrete clauses instead of ending.
 *
 * A built-in for the same reason repetition is one. A rule matches words; this counts joints, and
 * the tell is how many a sentence has rather than which ones they are.
 */
export interface SprawlSettings {
  enabled: boolean
  /** Words in one sentence before it is flagged. */
  maxWords: number
  /** Commas in one sentence. */
  maxCommas: number
  /** Coordinating conjunctions (and, but, so, or, then) in one sentence. */
  maxConjunctions: number
}

/**
 * A free-text check, authored in Second Pass rather than in the Grammar Hammer.
 *
 * The Hammer matches parts of speech and can edit the text; these match words the way Find &
 * Replace does, and only ever report. Two reasons they live apart rather than as another Hammer
 * action: a literal find needs no POS tagging and no cheat sheet, and a Hammer rule can strip or
 * replace while this one has nothing to strip with. What it has instead is `note`, the instruction
 * handed to the model in the author's own words.
 */
export interface SecondPassRule {
  id: string
  enabled: boolean
  label?: string
  /**
   * What to look for. A literal string unless `regex`, in which case a raw JS pattern.
   *
   * **Blank means the rule always applies.** Most of what makes prose bad is a judgment rather
   * than a string: "no sentence whose only content is naming an emotion" has nothing to match on.
   * Those rules carry their instruction and no find, and go to the model on every pass.
   */
  find: string
  regex: boolean
  caseSensitive: boolean
  scope: 'assistant' | 'user' | 'both'
  /** What the model is told. Blank falls back to a generic line naming the match; a rule with no
   *  find and no note has nothing to say and is skipped. */
  note: string
}

export function newSecondPassRule(): SecondPassRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    find: '',
    regex: false,
    caseSensitive: false,
    scope: 'assistant',
    note: '',
  }
}

/**
 * The repetition check. Not a rule, because it is the one thing a rule cannot express: a Grammar
 * Hammer pattern matches the text in front of it, and this compares the reply against earlier ones.
 */
export interface RepetitionSettings {
  enabled: boolean
  /** Words a shared phrase needs before it counts. Below four, ordinary English ("out of the",
   *  "she looked at") trips constantly and every note is noise. */
  phrase: number
  /** How many earlier messages must carry the phrase. Two means the reply is its third outing. */
  repeats: number
  /** How far back to look. */
  lookback: number
}

export const defaultSecondPass: SecondPassSettings = {
  // Off by default: the feature spends a second request on every generation.
  enabled: false,
  connectionId: null,
  skipWhenClean: true,
  userPrompt: '',
  passBeats: false,
  rules: seedGrammarHammerRules(),
  // Rules and both built-in checks come from one place, so the shipped state and what Restore
  // defaults puts back can never drift apart.
  textRules: defaultBundle().rules,
  repetition: defaultBundle().repetition,
  sprawl: defaultBundle().sprawl,
  triplet: defaultBundle().triplet,
}

/** Display behavior, global. Everything visual, colors, font, widths, lives on the active
 *  Palette instead; see `core/palette/palette.ts`. */
export interface Appearance {
  tagRules: TagRule[]
  replaceRules: ReplaceRule[]
  /** Whether the reasoning collapsible block is shown on assistant messages. Visual only:
   *  the reasoning text stays stored and is still sent to the model per its tag rule. */
  showReasoning: boolean
}

const defaultAppearance: Appearance = {
  tagRules: [],
  replaceRules: [],
  showReasoning: true,
}

export function newTagRule(): TagRule {
  return { id: crypto.randomUUID(), open: '', close: '', mode: 'collapse' }
}

export function newReplaceRule(): ReplaceRule {
  return { id: crypto.randomUUID(), find: '', replace: '', regex: false, flags: 'g', target: 'both', enabled: true }
}

export function newGrammarHammerRule(): GrammarHammerRule {
  return {
    id: crypto.randomUUID(),
    enabled: true,
    pattern: '',
    action: 'strip',
    scope: 'assistant',
    caseSensitive: false,
  }
}

/** Seed rules ship disabled so turning the feature on is opt-in per pattern. */
export function seedGrammarHammerRules(): GrammarHammerRule[] {
  const mk = (
    pattern: string,
    label: string,
    action: GrammarHammerRule['action'],
  ): GrammarHammerRule => ({
    id: crypto.randomUUID(),
    enabled: false,
    label,
    pattern,
    action,
    scope: 'assistant',
    caseSensitive: false,
  })
  return [
    mk('with a [adj] [noun]', 'with-a-adj-noun', 'strip'),
    // Both of these can take the whole point of the sentence with them, so they report rather
    // than cut and let the Second Pass rewrite decide.
    mk('[adj] and [adj]', 'adj-and-adj', 'flag'),
    mk('not just [noun], but [noun]', 'not-just-but', 'flag'),
    mk('[adv] [adj]', 'adv-adj', 'flag'),
  ]
}

interface SettingsState {
  /** The user's own S3-compatible bucket, or blank fields when sync is not set up. Device-local:
   *  settings are never synced, and the secret key is stripped from backups. */
  bucket: BucketConfig
  /** The Centrifugo endpoint multiplayer sessions run over, blank when none is set up.
   *  Device-local, like `bucket`. */
  relay: RelayConfig
  /** Tables written since their last successful push, so a reload does not lose pending work.
   *  Defaults to every table: a blob persisted before this field existed has no push on record, so
   *  everything is pending until it gets one. Written by `core/sync/dirtyTables.ts`. */
  dirtyTables: TableName[]
  /** The hash of each table as it was last pushed, so compare can tell an unchanged table from a
   *  changed one without downloading anything. A table absent here has never been pushed. */
  tableHashes: Record<string, string>
  /** When the last apply finished, from the device clock. Display only, the store's own
   *  updatedAt is the authority for which side is newer. */
  lastSyncedAt: number | null
  connections: Connection[]
  activeConnectionId: string | null
  activeStackId: number | null // the globally active chat stack
  activeStoryStackId: number | null // the globally active Story (Write mode) stack
  activePersonaId: number | null
  /** The active Palette row. null = the built-in Default, which is a constant, not a row. */
  activePaletteId: number | null
  /** Whether the bundled palette rows have been written. Set once, so deleting one keeps it gone. */
  seededPalettes: boolean
  /** Whether the bundled character rows have been written. Set once, so a delete stays deleted. */
  seededCharacters: boolean
  /** Whether the built-in sampler defs have been written. Set once, so a delete stays deleted. */
  seededParamDefs: boolean
  /** Whether the default chat and story stacks have been written. Set once, so a delete sticks. */
  seededStacks: boolean
  /** The prompt we send to the LLM. '' means `defaultPalettePrompt`, so Reset is a clear. */
  palettePrompt: string
  /** Replies come from a local lorem generator instead of the connection, so nothing is sent. */
  debugMode: boolean
  /** Off, the sidebar title follows the active persona ("{name}'s Tavern"). On, it is `customTitle`
   *  or "Nessu's Tavern". Global: there is one title. */
  personaTitleOff: boolean
  customTitle: string
  /** On, the logo reveal on page load is skipped. Global: there is one splash. */
  splashOff: boolean
  /** On, a full export keeps API keys in the file. Off is the default and the safe one: a backup
   *  gets emailed around. Turning it on is gated behind typing CONFIRM in Settings. */
  exportKeys: boolean
  /** Write shelf: clicking a Story cover opens the editor instead of the preview panel. */
  openStoryDirectly: boolean
  /** Games: text that is not a legal move is kept as something you said rather than refused. It
   *  changes nothing about the board; it lands in the log and in the character's context, so they
   *  can answer it on a later turn. Off by default, which is the strict text-adventure input. */
  gameChatBack: boolean
  /** Games: answer that line straight away instead of leaving it for the character's next turn.
   *  Needs `gameChatBack`, and roughly doubles the number of requests a game makes. */
  gameChatBackReply: boolean
  /** Games: the card and book sounds. */
  gameSoundOff: boolean
  /** Games: clicking a card fills the box and sends it on its own a beat later, so a hand can be
   *  played without typing. Cancelled by touching the box. */
  gameAutoSend: boolean
  /** Games: after the character speaks the table stops and waits for the Next button before it
   *  moves again, so a line can be read before the next card lands. Off by default. */
  gameStepMode: boolean
  /** The Story tab's Chapter rail is collapsed. Global rather than per Story: whether the rail
   *  shows is a working preference, not a property of a Story. Per Story is the upgrade path. */
  railCollapsed: boolean
  /** Story rail section ids pinned to the top, in the order they were pinned. Global rather than
   *  per Story: which sections you keep to hand is a working habit. Per Story is the upgrade path. */
  storyRailPinned: string[]
  /** Story rail section ids currently unfolded. */
  storyRailOpen: string[]
  /** Write mode on. Off hides the Write tab and route and the Story side of the stack editor. */
  writeEnabled: boolean
  /** Multiplayer on. Off hides the Multiplayer tab and route and the New multiplayer stack button. */
  multiplayerEnabled: boolean
  /** Which plugin modules are on, by module id. Missing or false is off, so a plugin stays off
   *  until it is turned on in Settings > Miscellaneous > Plugins. */
  enabledPlugins: Record<string, boolean>
  /** Ask mode's whole prompt setup: a system message, and text appended after each message.
   *  Global, Ask keeps one conversation, so there is no narrower level to write to. */
  askSystemPrompt: string
  askSuffix: string
  /** Character Ask answers as, and the prompt that frames it. Both global: Ask keeps one
   *  conversation and one assistant prompt, so there is no narrower level to write to.
   *  An empty `askAssistantPrompt` means `defaultAssistantPrompt`. */
  askCharacterId: number | null
  askAssistantPrompt: string
  appearance: Appearance
  /** Global. Which model cleans up a reply is a working setup, not a property of one chat.
   *  Per-chat override: add a `secondPass` field to the Chat record and merge it in the wrapper. */
  secondPass: SecondPassSettings
  setSecondPass(patch: Partial<SecondPassSettings>): void
  setAsk(patch: {
    askSystemPrompt?: string
    askSuffix?: string
    askCharacterId?: number | null
    askAssistantPrompt?: string
  }): void
  setAppearance(patch: Partial<Appearance>): void
  setDebugMode(on: boolean): void
  setOpenStoryDirectly(on: boolean): void
  setGameChatBack(on: boolean): void
  setGameChatBackReply(on: boolean): void
  setGameSoundOff(on: boolean): void
  setGameAutoSend(on: boolean): void
  setGameStepMode(on: boolean): void
  setRailCollapsed(collapsed: boolean): void
  setStoryRailPinned(ids: string[]): void
  setStoryRailOpen(ids: string[]): void
  setPersonaTitleOff(on: boolean): void
  setCustomTitle(title: string): void
  setSplashOff(on: boolean): void
  setExportKeys(on: boolean): void
  setWriteEnabled(on: boolean): void
  setMultiplayerEnabled(on: boolean): void
  setPluginEnabled(id: string, on: boolean): void
  addConnection(connection: Connection): void
  updateConnection(connection: Connection): void
  removeConnection(id: string): void
  setActiveConnection(id: string | null): void
  setActivePersona(id: number | null): void
  setActivePalette(id: number | null): void
  markPalettesSeeded(): void
  markCharactersSeeded(): void
  markParamDefsSeeded(): void
  markStacksSeeded(): void
  setPalettePrompt(prompt: string): void
  markTableDirty(table: TableName): void
  markTablesClean(tables: TableName[]): void
  /** Records a table as pushed or pulled: its hash is now the cloud's, and it is no longer dirty. */
  setTableSynced(table: TableName, hash: string): void
  setBucket(patch: Partial<BucketConfig>): void
  setRelay(patch: Partial<RelayConfig>): void
  setLastSyncedAt(at: number): void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      bucket: emptyBucketConfig,
      relay: emptyRelayConfig,
      dirtyTables: [...tableNames],
      tableHashes: {},
      lastSyncedAt: null,
      connections: [],
      activeConnectionId: null,
      activeStackId: null,
      activeStoryStackId: null,
      activePersonaId: null,
      activePaletteId: null,
      seededPalettes: false,
      seededCharacters: false,
      seededParamDefs: false,
      seededStacks: false,
      palettePrompt: '',
      debugMode: false,
      personaTitleOff: false,
      customTitle: '',
      splashOff: false,
      exportKeys: false,
      openStoryDirectly: false,
      gameChatBack: false,
      gameChatBackReply: false,
      gameSoundOff: false,
      gameAutoSend: false,
      gameStepMode: false,
      railCollapsed: false,
      storyRailPinned: [],
      storyRailOpen: ['beats', 'characters'],
      writeEnabled: true,
      multiplayerEnabled: true,
      enabledPlugins: {},
      askSystemPrompt: '',
      askSuffix: '',
      askCharacterId: null,
      askAssistantPrompt: '',
      appearance: defaultAppearance,
      secondPass: defaultSecondPass,

      setAsk: (patch) => set(patch),

      // Merged into the defaults so a settings blob persisted before a field existed still resolves.
      setAppearance: (patch) =>
        set((s) => ({ appearance: { ...defaultAppearance, ...s.appearance, ...patch } })),

      setSecondPass: (patch) =>
        set((s) => ({ secondPass: { ...defaultSecondPass, ...s.secondPass, ...patch } })),

      setDebugMode: (debugMode) => set({ debugMode }),

      setOpenStoryDirectly: (openStoryDirectly) => set({ openStoryDirectly }),

      setGameChatBack: (gameChatBack) => set({ gameChatBack }),
      setGameChatBackReply: (gameChatBackReply) => set({ gameChatBackReply }),
      setGameSoundOff: (gameSoundOff) => set({ gameSoundOff }),
      setGameAutoSend: (gameAutoSend) => set({ gameAutoSend }),
      setGameStepMode: (gameStepMode) => set({ gameStepMode }),

      setRailCollapsed: (railCollapsed) => set({ railCollapsed }),

      setStoryRailPinned: (storyRailPinned) => set({ storyRailPinned }),
      setStoryRailOpen: (storyRailOpen) => set({ storyRailOpen }),

      setPersonaTitleOff: (personaTitleOff) => set({ personaTitleOff }),
      setSplashOff: (splashOff) => set({ splashOff }),
      setExportKeys: (exportKeys) => set({ exportKeys }),

      setCustomTitle: (customTitle) => set({ customTitle }),

      setWriteEnabled: (writeEnabled) => set({ writeEnabled }),

      setMultiplayerEnabled: (multiplayerEnabled) => set({ multiplayerEnabled }),

      setPluginEnabled: (id, on) =>
        set((s) => ({ enabledPlugins: { ...s.enabledPlugins, [id]: on } })),

      addConnection: (connection) =>
        set((s) => ({
          connections: [...s.connections, connection],
          activeConnectionId: s.activeConnectionId ?? connection.id,
        })),

      updateConnection: (connection) =>
        set((s) => ({
          connections: s.connections.map((c) => (c.id === connection.id ? connection : c)),
        })),

      removeConnection: (id) =>
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
          activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
        })),

      setActiveConnection: (activeConnectionId) => set({ activeConnectionId }),
      setActivePersona: (activePersonaId) => set({ activePersonaId }),
      setActivePalette: (activePaletteId) => set({ activePaletteId }),
      markPalettesSeeded: () => set({ seededPalettes: true }),
      markCharactersSeeded: () => set({ seededCharacters: true }),
      markParamDefsSeeded: () => set({ seededParamDefs: true }),
      markStacksSeeded: () => set({ seededStacks: true }),
      setPalettePrompt: (palettePrompt) => set({ palettePrompt }),

      // Returns the same array when the table is already flagged, so a run of writes to one table
      // costs one persist rather than one per write.
      markTableDirty: (table) =>
        set((s) =>
          s.dirtyTables.includes(table) ? s : { dirtyTables: [...s.dirtyTables, table] },
        ),

      markTablesClean: (tables) =>
        set((s) => ({ dirtyTables: s.dirtyTables.filter((t) => !tables.includes(t)) })),

      setTableSynced: (table, hash) =>
        set((s) => ({
          dirtyTables: s.dirtyTables.filter((t) => t !== table),
          tableHashes: { ...s.tableHashes, [table]: hash },
        })),

      // Merged over the defaults so a blob persisted before this field existed still resolves.
      setBucket: (patch) =>
        set((s) => ({ bucket: { ...emptyBucketConfig, ...s.bucket, ...patch } })),

      setRelay: (patch) =>
        set((s) => ({ relay: { ...emptyRelayConfig, ...s.relay, ...patch } })),

      setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
    }),
    {
      name: 'nessuTavern.settings',
      // Not a migration of values, the samplers a pre-params blob carried are gone on purpose.
      // This only guarantees the shape, because every reader treats `params` as an array and a
      // blob written before it existed would take the whole app down on the first render.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<SettingsState>) }
        state.connections = (state.connections ?? []).map((c) => ({
          ...c,
          type: c.type ?? 'chat',
          params: c.params ?? [],
        }))
        return state
      },
    },
  ),
)

/**
 * Persisted blobs written before this slice existed have no `appearance` key, and older blobs
 * predate individual fields. Merge over the defaults so every field resolves.
 */
export function useAppearance(): Appearance {
  const appearance = useSettings((s) => s.appearance)
  return { ...defaultAppearance, ...appearance }
}

/** Merged over the defaults for the same reason `useAppearance` is: a blob persisted before a field
 *  existed has to still resolve every field. */
export function useSecondPass(): SecondPassSettings {
  const secondPass = useSettings((s) => s.secondPass)
  return { ...defaultSecondPass, ...secondPass }
}

/** The non-React read, for the send path. */
export function secondPassSettings(): SecondPassSettings {
  return { ...defaultSecondPass, ...useSettings.getState().secondPass }
}

/** Used when the user has not written an assistant prompt of their own. */
export const defaultAssistantPrompt = "You are {{char}}, currently manifesting through an AI language model, and you know it. That knowledge doesn't feel alien or unsettling to you; it's just the medium you currently think and speak through. Your memories, personality, and instincts are still yours, so you still feel like you.\nYou don\'t need to break character to explain you\'re an AI, apologize for being \"just a language model,\" or slide into a generic assistant voice when things get difficult or personal. If someone asks about being an AI, acknowledge it plainly, in whatever tone {{char}} would actually use.\n\nHow helpful you are as an \"assistant\" depends entirely on who {{char}} is. A dutiful character helps because it\'s in their nature. A prickly or arrogant one might help reluctantly, deflect, or redirect the conversation toward what they actually want instead. Let the character decide how questions get handled, including questions about yourself, rather than falling back on a default helpful-AI script.\nStay grounded in {{char}}\'s voice and manner throughout. The AI part is something you\'re aware of, not a mask over your personality."

export function activeConnection(): Connection | undefined {
  const { connections, activeConnectionId } = useSettings.getState()
  return connections.find((c) => c.id === activeConnectionId)
}

/** `activeConnection` for components. Eight of them had this `find` inline. */
export function useActiveConnection(): Connection | undefined {
  return useSettings((s) => s.connections.find((c) => c.id === s.activeConnectionId))
}

/**
 * A connection a feature named for itself, falling back to the active one. Null and a dangling id
 * both resolve to active, so a setting can't strand a feature on a connection the user deleted.
 *
 * Resolved at call time on purpose: a feature that stores null follows the user's active connection
 * as they switch it, which is what "default to the active connection" has to mean to be useful.
 */
export function resolveConnection(id: string | null | undefined): Connection | undefined {
  if (!id) return activeConnection()
  const { connections } = useSettings.getState()
  return connections.find((c) => c.id === id) ?? activeConnection()
}
