import { create } from 'zustand'
import { storage } from '../../core/storage/db'
import { currentOwnerId } from '../../core/storage/storageInterface'
import type { StoredRecord } from '../../core/storage/storageInterface'
import type { Character, Chat, Game, Message, Persona, PromptStack } from '../../core/storage/types'
import type { GoFishEvent, GoFishState, MoveQuality, Side } from '../../core/games/goFish'
import { initialState, legalAsks, reduce, resolveAsk } from '../../core/games/goFish'
import type { BlackjackEvent, BlackjackState } from '../../core/games/blackjack'
import * as blackjack from '../../core/games/blackjack'
import type { AnyGameState } from '../../core/games/driver'
import { driveGuard, drivers } from '../../core/games/driver'
import type { GameEvent, GameKind } from '../../core/games/gameEvent'
import { gameLabels } from '../../core/games/gameEvent'
import type { Rank } from '../../core/games/deck'
import { parseAction, parseAsk } from '../../core/games/parseMove'
import { buildStateBlock, describeEvent } from '../../core/games/gameState'
import * as blackjackState from '../../core/games/blackjackState'
import { resolvedConnection } from '../../core/stores/chatStore'
import { runSecondPass } from '../../core/secondPass/runSecondPass'
import { buildPrompt } from '../../core/prompt/buildPrompt'
import { loadTokenizer } from '../../core/prompt/budget'
import { tokenizerFor } from '../../core/prompt/tokenizers'
import { budgetOf } from '../../core/params/connectionParams'
import { useSettings } from '../../core/stores/settingsStore'
import { displayName, useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { defaultGameStack, useStacks } from '../../core/stores/stacksStore'
import { bookSound, cardSound } from './sounds'
import { motionSettled } from './cardMotion'

/**
 * A game is not a chat. It reads no chat history, writes no messages, and carries its own log.
 * The board moves first and the character's line arrives after, so a dead connection costs you the
 * commentary and nothing else.
 */

/** The character always sits on the 'char' side; you are always 'player'. */
export const playerSide: Side = 'player'

/**
 * The beat between the parts of a move. Asking and then drawing in the same frame reads as one
 * event rather than two, and the board has nothing else to say that it happened.
 */
const moveBeat = 500

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** How long a character's line may take before the table stops waiting on it. */
const replyCutoffMs = 90000

/** The reply in flight, so closing a game can drop it. One game is open at a time. */
let live: AbortController | null = null

/** Whether the table is already playing itself out. Opening a game starts a run that nobody awaits,
 *  and a move landing in the middle of it would write two batches into the same log. */
let driving = false

/** A drive asked for while one was already running: the board changed under it. */
let wanted = false

/**
 * The step gate: the resolve of the promise the driver is parked on, or null when it is running.
 * With `gameStepMode` on the table stops after the character has spoken and only moves again when
 * Next is clicked, so a line can be read before the next card lands on top of it.
 */
let stepGate: (() => void) | null = null

function releaseStep() {
  const resume = stepGate
  stepGate = null
  resume?.()
}

/**
 * The wait before the next event lands: the cards finish moving, then the beat. An arrival takes
 * seconds, and writing the next event while one is still in the air replaces the card in flight
 * with the same card in its final place.
 */
async function beat(ms = moveBeat) {
  await motionSettled()
  await pause(ms)
}

export type { AnyGameState }

/**
 * The per-game pieces everything generic needs. Two implementations, so this is a table rather
 * than an abstraction: the casts inside it are the one place `Game.kind` deciding which half of
 * `GameEvent` a log is has to be said out loud.
 */
interface GameRules {
  initial(seed: number): AnyGameState
  reduce(state: AnyGameState, event: GameEvent): AnyGameState
  /** The `<gameState>` block, from the character's side of the table. `before` is the board as it
   *  stood when the move being described began, where a game has something to say about it. */
  block(state: AnyGameState, tag: string, before?: AnyGameState): string
  describe(events: GameEvent[]): string
}

const rules: Record<GameKind, GameRules> = {
  goFish: {
    initial: (seed) => initialState(seed),
    reduce: (state, event) => reduce(state as GoFishState, event as GoFishEvent),
    block: (state, tag, before) => buildStateBlock(state as GoFishState, { tag, before: before as GoFishState | undefined }),
    describe: (events) => describeEvent(events as GoFishEvent[]),
  },
  blackjack: {
    initial: (seed) => blackjack.initialState(seed),
    reduce: (state, event) => blackjack.reduce(state as BlackjackState, event as BlackjackEvent),
    block: (state, tag) => blackjackState.buildStateBlock(state as BlackjackState, { tag }),
    describe: (events) => blackjackState.describeEvent(events as BlackjackEvent[]),
  },
}

/** The board a log adds up to. The only way state is ever produced. */
export function boardState(game: Game, upTo?: number): AnyGameState {
  const kind = rules[game.kind]
  const slice = upTo === undefined ? game.events : game.events.slice(0, upTo)
  return slice.reduce(kind.reduce, kind.initial(game.seed))
}

function newGame(
  kind: GameKind,
  character: Character,
  persona: Persona | undefined,
  stackId: number | undefined,
): Game {
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    kind,
    characterId: character.id!,
    characterName: displayName(character),
    personaId: persona?.id,
    personaName: persona?.name,
    stackId,
    // Milliseconds are seed enough: two games started in the same millisecond would need the same
    // character too, and the shuffle only has to be unguessable to a person, not to an attacker.
    seed: now >>> 0,
    events: [],
    status: 'playing',
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * The log projected into chat messages. The character's lines are the assistant turns; each move
 * is a user turn.
 *
 * Only the newest user turn carries the `<gameState>` block. An old board is not the board, and
 * repeating one per turn would fill the context with hands that no longer exist.
 */
function gameMessages(game: Game, tag: string): Message[] {
  const kind = rules[game.kind]
  const messages: Message[] = []
  let current = kind.initial(game.seed)
  // The board as it stood when the current batch started, so the block can name what left the hand.
  let opening = current
  let batch: GameEvent[] = []
  let clock = game.createdAt

  const pushMove = (state: AnyGameState, events: GameEvent[], withBlock: boolean, from: AnyGameState) => {
    const line = kind.describe(events)
    if (!line) return
    const block = withBlock ? `${kind.block(state, tag, from)}\n\n` : ''
    // What the player typed, verbatim, on every turn they typed on. The event line is the
    // unambiguous fact; their words are the turn, and a character that only ever saw the fact
    // could not answer what was actually said to it.
    const said = events.find((e) => e.kind === 'ask' && e.by === 'player' && e.text)
    // Before the fact line, never after. The line already reports the ask and how it resolved, so a
    // quote of the ask sitting after it reads as a second ask that nothing has answered yet, and the
    // character replies to that instead of to the move. Speech first, then what it caused.
    const quote = said?.kind === 'ask' && said.text ? `They said: "${said.text}"\n\n` : ''
    messages.push({
      ownerId: game.ownerId,
      chatId: 0,
      role: 'user',
      content: block + quote + line,
      createdAt: clock++,
    })
  }

  for (const event of game.events) {
    if (event.kind === 'say') {
      pushMove(current, batch, false, opening)
      batch = []
      opening = current
      // The player's own line is a user turn, quoted the same way an ask is, so the character
      // reads it as something said to them rather than as another fact about the table.
      messages.push({
        ownerId: game.ownerId,
        chatId: 0,
        role: event.by === 'char' ? 'assistant' : 'user',
        content: event.by === 'char' ? event.text : `They said: "${event.text}"`,
        createdAt: clock++,
      })
      continue
    }
    batch.push(event)
    current = kind.reduce(current, event)
  }
  // The trailing batch is the move being reacted to right now, so it gets the board. When the log
  // ends on something the player said there is no trailing batch, and the block goes on that line
  // instead: a reply with no board in the prompt is the character guessing.
  if (batch.length > 0) {
    pushMove(current, batch, true, opening)
  } else {
    const last = [...messages].reverse().find((m) => m.role === 'user')
    if (last) last.content = `${kind.block(current, tag)}\n\n${last.content}`
  }
  return messages
}

/**
 * Board zoom and log width are non-portable preferences: they belong to this screen on this
 * monitor, not to the user's data. Straight to localStorage, no store table, out of the export.
 */
const scaleKey = 'nessuTavern.gamesBoardScale'
const widthKey = 'nessuTavern.gamesLogWidth'
const openKey = 'nessuTavern.gamesLogOpen'

function readNumber(key: string, fallback: number): number {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

interface GamesState {
  games: Game[]
  loading: boolean
  /** The open game, or null on the Play/History screens. */
  game: Game | null
  /** Rebuilt from the log on every write. Components read this, never the log, and narrow it on
   *  `game.kind`. */
  state: AnyGameState
  streaming: boolean
  streamingText: string
  /** A failed reply. The board is already correct, so this is not a rollback. */
  error: string
  /** Unparsable input: shown briefly, nothing is logged. */
  notice: string
  /** The table is parked on the step gate, waiting for Next. */
  awaitingNext: boolean

  /** 1 to 4. A 4k monitor renders the board at a fraction of the screen otherwise. */
  boardScale: number
  /** Width of the log panel in px. */
  logWidth: number
  logOpen: boolean
  setBoardScale(scale: number): void
  setLogWidth(width: number): void
  setLogOpen(open: boolean): void

  load(): Promise<void>
  start(kind: GameKind, characterId: number): Promise<number | null>
  open(id: number): Promise<void>
  close(): void
  submit(text: string): Promise<void>
  setDifficulty(quality: MoveQuality): Promise<void>
  setAuthorNote(note: string): Promise<void>
  abandon(): Promise<void>
  next(): void
  remove(id: number): Promise<void>
  clearNotice(): void
}

/** The stack a game runs on: its own, else one named Game, else a fresh one saved as an ordinary
 *  row. Never touches the globally active chat stack. */
async function gameStack(game: Game): Promise<PromptStack> {
  const stacks = useStacks.getState()
  const own = game.stackId !== undefined && stacks.stacks.find((s) => s.id === game.stackId)
  if (own) return own
  const named = stacks.stacks.find((s) => s.name === 'Game')
  if (named) return named
  const id = await stacks.save(defaultGameStack())
  return useStacks.getState().stacks.find((s) => s.id === id) ?? defaultGameStack()
}

/** buildPrompt reads `chat` only for the author's note, speaker labels and group detection, so a
 *  record that has none of those is safe and a game never needs a Chat row. The note is the game's
 *  own, carried here because the author's note block is the route it already has to the prompt. */
function syntheticChat(game: Game): Chat {
  return {
    id: 0,
    ownerId: game.ownerId,
    characterId: game.characterId,
    authorNote: game.authorNote,
    title: `${gameLabels[game.kind]} with ${game.characterName}`,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
  }
}

export const useGames = create<GamesState>()((set, get) => ({
  games: [],
  loading: false,
  game: null,
  state: initialState(0),
  streaming: false,
  streamingText: '',
  error: '',
  notice: '',
  awaitingNext: false,

  boardScale: readNumber(scaleKey, 1),
  logWidth: readNumber(widthKey, 320),
  logOpen: localStorage.getItem(openKey) !== '0',

  setBoardScale: (scale) => {
    localStorage.setItem(scaleKey, String(scale))
    set({ boardScale: scale })
  },
  setLogWidth: (width) => {
    localStorage.setItem(widthKey, String(width))
    set({ logWidth: width })
  },
  setLogOpen: (open) => {
    localStorage.setItem(openKey, open ? '1' : '0')
    set({ logOpen: open })
  },

  clearNotice: () => set({ notice: '' }),

  load: async () => {
    set({ loading: true })
    const rows = (await storage.getAll('games')) as unknown as Game[]
    set({ games: rows.sort((a, b) => b.updatedAt - a.updatedAt), loading: false })
  },

  start: async (kind, characterId) => {
    const character = useCharacters.getState().characters.find((c) => c.id === characterId)
    if (!character) return null
    const persona = await usePersonas.getState().ensureActive()
    const game = newGame(kind, character, persona, undefined)
    // Go Fish deals itself in `initialState`. Blackjack has no cards on the table until a round is
    // opened, and opening one is an event like any other.
    const seeded: Game =
      kind === 'blackjack'
        ? { ...game, events: blackjack.dealRound(blackjack.initialState(game.seed)) }
        : game
    const id = await storage.put('games', seeded as unknown as StoredRecord)
    await get().load()
    set({
      game: { ...seeded, id },
      state: boardState(seeded),
      error: '',
      notice: '',
      streamingText: '',
    })
    // A hand dealt as a natural settles itself, so a new game can already be waiting on the driver
    // rather than on the player.
    void drive(get, set)
    return id
  },

  open: async (id) => {
    const row = (await storage.get('games', id)) as unknown as Game | undefined
    if (!row) return
    set({ game: row, state: boardState(row), error: '', notice: '', streamingText: '' })
    // Reopening picks up a table that was left mid-runout, by a closed tab or by an older build.
    void drive(get, set)
  },

  close: () => {
    live?.abort()
    live = null
    // Let the parked driver run on: its next check sees a different game and stops the run. Left
    // parked it would hold `driving` forever and the next game would never move.
    releaseStep()
    set({ game: null, error: '', notice: '', streaming: false, streamingText: '', awaitingNext: false })
  },

  next: () => releaseStep(),

  submit: async (text) => {
    const game = get().game
    if (!game || get().streaming || driving || get().state.over) return

    const myTurn = get().state.turn === playerSide
    const move =
      !myTurn
        ? null
        : game.kind === 'goFish'
          ? parseAsk(text, legalAsks(get().state as GoFishState, playerSide))
          : parseAction(text)

    // Off your turn, or on it with something that is not a move: with chat back on the words are
    // kept as something you said. Nothing about the board moves and no reply is generated; the
    // character reads it on its next turn, which is when it has something to answer with.
    if (!move) {
      if (!useSettings.getState().gameChatBack) {
        set({
          notice:
            game.kind === 'goFish'
              ? 'That is not a rank you hold. Try "got any sevens".'
              : 'Say hit or stand.',
        })
        return
      }
      set({ notice: '' })
      await appendEvents(get, set, [{ kind: 'say', by: playerSide, text: text.trim() }])
      if (useSettings.getState().gameChatBackReply) await react(get, set)
      return
    }
    set({ notice: '' })
    // Stored as typed. Trimmed of surrounding whitespace and nothing else: what the player wrote
    // is what the log shows and what the model reads.
    await playMove(get, set, move as Rank | blackjack.Action, text.trim())
  },

  setDifficulty: async (difficulty) => {
    const game = get().game
    if (!game) return
    await persist(get, set, { ...game, difficulty })
  },

  // This game only. A note that applied to every game with a character would be the character's
  // own field, and one that applied to every game would be the stack's block content.
  setAuthorNote: async (note) => {
    // Read the game here rather than taking one from the caller: the panel debounces, and a move
    // can have landed and appended events since the last keystroke.
    const game = get().game
    if (!game) return
    await persist(get, set, { ...game, authorNote: note })
  },

  abandon: async () => {
    const game = get().game
    if (!game) return
    await persist(get, set, { ...game, status: 'abandoned' })
  },

  remove: async (id) => {
    await storage.remove('games', id)
    if (get().game?.id === id) get().close()
    await get().load()
  },
}))

type Get = () => GamesState
type Set = (patch: Partial<GamesState>) => void

/**
 * The player's move, then the table playing itself out until it is waiting on them again.
 *
 * The pacing is the whole point. Every batch here is already decided; writing it all at once means
 * the card is drawn before you have read who asked for what, and the run of dealer hits lands as
 * one frame. So events go in one at a time with a beat between, and the driver is asked what comes
 * next until it says nothing does.
 */
async function playMove(get: Get, set: Set, move: Rank | blackjack.Action, text: string) {
  const game = get().game
  if (!game) return

  if (game.kind === 'blackjack') {
    // The words the player typed ride on their own turn, the way an ask carries them in Go Fish.
    await appendEvents(get, set, [{ kind: 'say', by: playerSide, text }])
    await pace(get, set, blackjack.resolveAction(get().state as BlackjackState, move as blackjack.Action))
  } else {
    await pace(get, set, resolveAsk(get().state as GoFishState, playerSide, move as Rank, text))
  }
  await react(get, set)

  await drive(get, set)
}

/**
 * Everything nobody is deciding: the dealer's runout, the next round, the character's asks. Runs
 * until the driver says the table is waiting on the player again.
 *
 * The guard is a backstop. Both games are bounded by their own deck, so reaching it means a rule
 * changed underneath this and a bug is better than a spinning tab.
 */
async function drive(get: Get, set: Set) {
  if (driving) {
    // A run for the game that was open when this started is about to stop on its own id check.
    // Remember that this one still wants driving rather than dropping the request.
    wanted = true
    return
  }
  driving = true
  try {
    do {
      wanted = false
      const id = get().game?.id
      let guard = 0
      while (guard++ < driveGuard) {
        const game = get().game
        // The board was closed, or another game was opened, while a beat was in the air.
        if (!game || game.id !== id) break
        const batch = drivers[game.kind](get().state, { difficulty: game.difficulty })
        // Nothing left to do here: the table is waiting on the player, who can read at their own
        // pace anyway. The gate goes after this check so it never sits in front of your own turn.
        if (!batch || batch.length === 0) break
        await waitForNext(get, set)
        if (get().game?.id !== id) break
        // A beat before they move again, so a run of turns reads as several moves.
        await beat()
        await pace(get, set, batch)
        await react(get, set)
      }
    } while (wanted)
  } finally {
    driving = false
  }
}

/**
 * Park the table until Next is clicked.
 *
 * Only where there is something to read: the gate exists for the character's line, so a log that
 * has not ended on one since the last gate goes on without stopping. `driving` is still set here,
 * which is what holds the player's move off until they let the table go.
 */
async function waitForNext(get: Get, set: Set) {
  if (!useSettings.getState().gameStepMode) return
  const events = get().game?.events
  const last = events?.[events.length - 1]
  if (last?.kind !== 'say' || last.by !== 'char') return
  set({ awaitingNext: true })
  await new Promise<void>((resolve) => {
    stepGate = resolve
  })
  set({ awaitingNext: false })
}

/**
 * One batch of already-decided events, landing one at a time.
 *
 * Only the events with something to show cost a beat. Whose turn it is and the end of the game are
 * bookkeeping, and pausing on them reads as the table hesitating over nothing.
 */
const silent = new Set(['turn', 'end'])

async function pace(get: Get, set: Set, events: GameEvent[]) {
  for (const [i, event] of events.entries()) {
    if (i > 0 && !silent.has(event.kind)) await beat(event.kind === 'say' ? moveBeat / 2 : moveBeat)
    await appendEvents(get, set, [event])
  }
}

async function appendEvents(get: Get, set: Set, events: GameEvent[]) {
  const game = get().game
  if (!game || events.length === 0) return
  if (!useSettings.getState().gameSoundOff) {
    if (events.some((e) => e.kind === 'book' || e.kind === 'settle')) bookSound()
    else if (events.some((e) => e.kind === 'give' || e.kind === 'draw' || e.kind === 'hit' || e.kind === 'deal')) {
      cardSound()
    }
  }
  const log = [...game.events, ...events]
  const state = boardState({ ...game, events: log })
  await persist(get, set, { ...game, events: log, status: state.over ? 'finished' : game.status }, state)
}

async function persist(get: Get, set: Set, game: Game, state?: AnyGameState) {
  const row: Game = { ...game, updatedAt: Date.now() }
  const id = await storage.put('games', row as unknown as StoredRecord)
  set({ game: { ...row, id }, state: state ?? boardState(row) })
  await get().load()
}

/**
 * Stream the character's line for whatever just happened and append it as a `say` event.
 *
 * The send path is store to connector, the same as every other generation: nothing here calls
 * fetch, so the CLAUDE.md rule stands.
 */
async function react(get: Get, set: Set) {
  const game = get().game
  if (!game) return
  const character = useCharacters.getState().characters.find((c) => c.id === game.characterId)
  if (!character) return

  const connection = resolvedConnection(character, syntheticChat(game))
  if (!connection) {
    set({ error: 'No active connection, pick one in Settings.' })
    return
  }

  const persona =
    usePersonas.getState().personas.find((p) => p.id === game.personaId) ??
    (await usePersonas.getState().ensureActive())

  // A stream that never yields and never fails used to leave `streaming` set forever, and every
  // control on both boards is gated on it. The cutoff costs the commentary, never the table.
  const controller = new AbortController()
  live = controller
  const cutoff = setTimeout(() => controller.abort(), replyCutoffMs)
  set({ streaming: true, streamingText: '', error: '' })
  let text = ''
  try {
    const stack = await gameStack(game)
    await loadTokenizer(tokenizerFor(connection))
    const built = buildPrompt(
      {
        stack,
        character,
        persona,
        chat: syntheticChat(game),
        messages: gameMessages(game, 'gameState'),
        game: gameLabels[game.kind],
        tagRules: useSettings.getState().appearance.tagRules,
      },
      budgetOf(connection),
    )
    for await (const chunk of runSecondPass(built.messages, connection, controller.signal)) {
      if (chunk.content) {
        text += chunk.content
        set({ streamingText: text })
      }
    }
  } catch (err) {
    // The board already moved and the log is correct. A game with no reply is still a game.
    set({ streaming: false, streamingText: '', error: (err as Error).message })
    return
  } finally {
    clearTimeout(cutoff)
    if (live === controller) live = null
  }

  set({ streaming: false, streamingText: '' })
  if (!text.trim()) return
  const current = get().game
  if (!current || current.id !== game.id) return
  await persist(get, set, { ...current, events: [...current.events, { kind: 'say', by: 'char', text: text.trim() }] })
}
