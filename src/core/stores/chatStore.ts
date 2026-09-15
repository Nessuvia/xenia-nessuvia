import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Character, Chat, Message, PromptStack, SpeakerAs } from '../storage/types'
import { sendMessage } from '../connectors/openaiCompatible'
import { snapshotOf } from '../connectors/snapshot'
import { buildPrompt } from '../prompt/buildPrompt'
import { blocksMentionCondition } from '../prompt/conditions'
import { loadTokenizer } from '../prompt/budget'
import { reasoningSpan } from '../prompt/reasoning'
import { parseState, type StateParse, type TrackerValue } from '../trackers/parseState'
import { trackerValues, withTrackerUpdate } from '../trackers/trackerState'
import { tokenizerFor } from '../prompt/tokenizers'
import type { Connection } from './settingsStore'
import { activeConnection, resolveConnection, useSettings } from './settingsStore'
import { resolveParams } from '../settings/resolveParams'
import { displayName, useCharacters } from './charactersStore'
import { usePersonas } from './personasStore'
import { useStacks } from './stacksStore'
import { chatTitle } from './chatTitle'
import {
  continued,
  deletedSwipes,
  passOriginalFor,
  passSummaryFor,
  passed,
  regenerated,
  revertPass,
  selectSwipe,
  swipeIndex,
  withPass,
} from './swipes'
import { runAgent, type Complete } from '../agent/runAgent'
import { resolveChatAgent } from '../agent/agentConfig'
import type { AgentStage } from '../agent/stage'
import { isSentinel } from '../connectors/sentinel'
import { autoTurns, nextSpeakerIndex, participants } from './roster'
import { parseCommand, stripEscape } from './slashCommands'
import { continuePrompt, oldMessageInstruction, rewritePrompt } from '../prompt/rewrite'
import { isEnabled, modules } from '../../app/moduleRegistry'
import { chatTokens, swapTokens } from '../prompt/swapTokens'
import { emptyWorldInfo, resolveWorldInfo, type ResolvedWorldInfo } from '../prompt/worldInfo'
import { useWorldInfo } from './worldInfoStore'
import { bookIdsFor, useLorebooks } from './lorebooksStore'
import { useBlips } from './blipStore'
import { isNarrator, narratorCharacter, narratorId } from '../multiplayer/narrator'
import { narratorBookIds } from './narratorBooks'
import { budgetOf, maxTokensOf, withParam } from '../params/connectionParams'

/**
 * The active session's people as `Name: description` lines, filling {{personas}}, or undefined
 * outside a session. The Narrator's instructions are not here and never were a store concern:
 * they come from the prompt stack's `[if Narrator]` branch, the one place the user can edit them.
 */
let _sessionPersonas: string | undefined = undefined
export function setSessionPersonas(personas: string | undefined): void {
  _sessionPersonas = personas
}

/** The session roster in host-chosen slot order, filling {{char1}} through {{char4}}, or undefined
 *  outside a session. Set by `hostSession`, same module-level shape as the Narrator prompt above. */
let _sessionCast: Character[] | undefined = undefined
export function setSessionCast(cast: Character[] | undefined): void {
  _sessionCast = cast
}

const byTime = (a: Message, b: Message) => a.createdAt - b.createdAt || a.id! - b.id!

/** What a pass leaves behind: the text to store, and the three parallel-array fields. */
interface PassResult {
  /** What goes in `content` and the selected swipe. */
  text: string
  /** The pre-pass text, set only when the pass changed something. */
  original?: string
  /** Rewrites that kept the original. */
  failed?: string
  /** What the pass did, in one line. Set only when it changed something. */
  summary?: string
}

/**
 * The agent pass around one finished generation.
 * Off, or a sentinel connection, returns the text untouched.
 * Abort throws through. A failed call counts as a rejected candidate.
 */
async function agentPass(
  chat: Chat,
  text: string,
  signal: AbortSignal,
  onProgress: (text: string, pending: string[], stage?: AgentStage) => void,
  /** Set by the manual action, which runs whether or not auto is on. */
  force = false,
): Promise<PassResult> {
  const config = useSettings.getState().agent
  if (!force && !resolveChatAgent(config, chat.agent).enabled) return { text }
  const connection = resolveConnection(config.connectionId)
  if (!connection || isSentinel(connection.endpointUrl)) return { text }

  const wide = withParam(connection, 'max_tokens', Math.max(maxTokensOf(connection), Math.ceil(text.length / 4) + 200))
  const complete: Complete = async (messages) => {
    let out = ''
    try {
      for await (const chunk of sendMessage(messages, wide, signal)) out += chunk.content ?? ''
    } catch (err) {
      if (signal.aborted) throw err
      return ''
    }
    return out
  }
  const wait = (config.style ?? 'stylized') === 'stylized' ? (ms: number) => new Promise<void>((done) => setTimeout(done, ms)) : undefined
  const outcome = await runAgent(text, config, complete, onProgress, wait).finally(() => onProgress(text, []))
  return {
    text: outcome.text,
    original: outcome.text === text ? undefined : text,
    summary: outcome.summary,
    failed: outcome.failed,
  }
}

// Not state: nothing renders from it, and `streaming` already drives the button.
let abort: AbortController | null = null

// Stop has to end the whole self-reply run, not just the reply that's mid-stream.
let stopped = false

// finish_reason 'length' means max_tokens ended the reply mid-sentence. The reply is kept; this
// only explains why it stopped where it did.
const lengthNotice = (maxTokens: number) =>
  `Reply stopped at the ${maxTokens} token limit. Raise Max tokens in the connection.`

/**
 * The stack this chat should actually use: its own override, or the globally active one. The
 * override keeps a multiplayer session's stack from leaking into every ordinary chat. The
 * global is what the Prompts tab and the Settings picker write, and a session must not repoint it.
 * Falls back to the global when the override names a stack that has since been deleted.
 */
export async function stackFor(chat: Chat | null): Promise<PromptStack> {
  const stacks = useStacks.getState()
  // No override: the path an ordinary chat has always taken, one call and no extra read.
  if (chat?.stackId === undefined) return stacks.ensureActive()
  await stacks.load()
  const own = useStacks.getState().stacks.find((s) => s.id === chat.stackId)
  return own ?? stacks.ensureActive()
}

/**
 * The connection as this chat should actually use it, the only place override precedence is
 * applied. It lives in the store rather than the view: the store is what sends. The
 * budget, the request body and the preview all read the same resolved object.
 */
export function resolvedConnection(character: Character, chat: Chat): Connection | undefined {
  const connection = activeConnection()
  return connection && resolveParams(connection, character, chat)
}

/**
 * Where an inline think block ends in a finished reply, recorded on the message. The text is stored
 * whole; this is only the offset. A reader can skip the thinking without re-parsing it against a
 * connection that may since have changed. Undefined when there is no block to skip, which keeps the
 * field off the record entirely for the usual reply.
 */
function reasoningEndOf(text: string, connection: Connection): number | undefined {
  const config = connection.template?.reasoning
  if (!config?.autoParse) return undefined
  return reasoningSpan(text, config)?.end
}

/**
 * The `<state>` parse of a reply against the chat card's trackers. Reads the text the writing model
 * produced: an agent pass could rewrite the tag. Undefined when the card has no trackers.
 */
function trackerUpdate(character: Character, chat: Chat, history: Message[], text: string, connection: Connection): StateParse | undefined {
  const defs = character.trackers ?? []
  if (!defs.length) return undefined
  const reply = text.slice(reasoningEndOf(text, connection) ?? 0)
  return parseState(reply, defs, trackerValues(defs, history, chat.trackerOverrides))
}

/**
 * The character at a roster position, falling back to the chat's own character, a participant
 * deleted out from under the roster still leaves a turn that can be generated.
 */
function characterAt(chat: Chat, index: number, fallback: Character): Character {
  // Check the Narrator first before the roster lookup. The Narrator is not in participantIds:
  // without this branch it would hit the fallback and silently generate a normal character.
  if (isNarrator(index)) return narratorCharacter()
  const id = participants(chat)[index]
  return useCharacters.getState().characters.find((c) => c.id === id) ?? fallback
}

/**
 * Every roster member's lorebooks, for a Narrator turn. The store lookup lives here; the union
 * itself is `narratorBookIds`, which is pure and checked. A participant whose card has been
 * deleted contributes nothing rather than throwing.
 */
function rosterBookIds(chat: Chat | null): number[] {
  if (!chat) return []
  const cards = useCharacters.getState().characters
  return narratorBookIds(participants(chat).map((id) => cards.find((c) => c.id === id)?.lorebookIds))
}

/**
 * The lorebook content for a turn, from three attachment levels at once: every global book, the
 * *speaker's* books, in a group chat the character replying brings their own, not the chat's first
 * participant, and the books attached to this chat.
 *
 * The Narrator is the one speaker with no books of its own, so it borrows the whole roster's
 * instead. Narrating a world the characters can see and the Narrator cannot is the failure this
 * avoids, and in a group there is no single character whose books are the right ones.
 */
export async function worldInfoFor(
  speaker: Character,
  chat: Chat | null,
  messages: Message[],
  /** The stack's `worldInfoBudget`. Passed in rather than read here: which stack is in play is the
   *  caller's business, and this function already takes every other input it needs. */
  budget?: number,
): Promise<ResolvedWorldInfo> {
  const state = useLorebooks.getState()
  // The list is loaded once and kept; a send that races a first load would otherwise see no
  // global books at all.
  if (!state.books.length && !state.loading) await state.load()
  const books = useLorebooks.getState().books
  const own = isNarrator(speaker.id) ? rosterBookIds(chat) : speaker.lorebookIds
  const ids = bookIdsFor(books, own, chat?.lorebookIds)
  if (!ids.length) return emptyWorldInfo
  const entries = await useWorldInfo.getState().fetchForBooks(ids)
  if (!entries.length) return emptyWorldInfo
  return resolveWorldInfo(entries, messages, new Map(books.map((b) => [b.id!, b])), budget)
}

/** Per character: how many chats it has, and when its newest message was (0 = none). */
export interface CharacterSummary {
  count: number
  latest: number
  /** Most recently updated chat: the picker can resume without loading a character's chat list. */
  lastChatId?: number
  /** `updatedAt` of that chat, only used to pick it. */
  lastChatAt?: number
}

interface ChatState {
  chats: Chat[]
  /** Bookmarked chats across all characters, for the sidebar. */
  bookmarks: Chat[]
  summaries: Record<number, CharacterSummary>
  chat: Chat | null
  messages: Message[]
  streamingText: string
  /** Reasoning as it arrives: the thinking is visible before any reply text shows up.
   *  Only reset when a stream starts, nothing renders it while `streaming` is false. */
  streamingReasoning: string
  streaming: boolean
  /** A pass stage's candidate is streaming over a reply that already finished. The text in
   *  `streamingText` is being replaced as it arrives, which is the intended feel; this is what
   *  lets the bubble say so. */
  passing: boolean
  /** Sentences the agent is still reworking inside `streamingText`. */
  streamingPending: string[]
  /** Stylized runs only: the marked reply and its beat. Null otherwise. */
  streamingStage: AgentStage | null
  /** Which chat the stream belongs to: opening another chat mid-generation doesn't show its
   *  reply there. Null when idle. */
  streamingChatId: number | null
  /** The chat ChatView currently has open, or null when no chat is on screen. Separate from `chat`,
   *  which stays loaded after you navigate away, this is the one that says you're *looking* at it,
   *  and it's what decides whether a finished reply blips instead of landing quietly. */
  viewingChatId: number | null
  setViewing(chatId: number | null): void
  error: string
  /** History messages the budget dropped on the last send, normal operation, not an error. */
  trimmedCount: number
  /** The open chat's stack's utility-prompt overrides, for views that show one before it is sent.
   *  The send path re-reads them off the stack it loads rather than trusting this copy. */
  miscPrompts: Record<string, string> | undefined
  /** The message being re-rolled, so the stream renders in place instead of at the bottom. */
  regeneratingId: number | null
  /** Whose reply is streaming, for the placeholder header. Empty when nothing is streaming. */
  speakingName: string
  /** The streaming speaker's id, so the placeholder can use their colors too. Null when idle. */
  speakingId: number | null
  /** What the error bar's Retry should do: re-roll the message that failed, not append a new one. */
  failed: { messageId: number; instruction?: string } | null
  /** Every message in the character's chats, loaded on demand for searching inside them. */
  searchMessages: Message[]
  loadChats(characterId: number): Promise<void>
  /** One read of a character's messages, so typing a query filters in memory. */
  loadSearchIndex(characterId: number): Promise<void>
  /** One pass over chats + messages, keyed by characterId, for the picker cards. */
  loadSummaries(): Promise<void>
  /** The character's most recent chat, for the stack editor's preview. Doesn't touch chat state. */
  load(chatId: number): Promise<void>
  /** A chat's messages in order, without opening it, what the chat list's export reads. */
  messagesOf(chatId: number): Promise<Message[]>
  createChat(characterId: number): Promise<number>
  renameChat(id: number, title: string): Promise<void>
  /** Write straight to the open chat: the settings panel debounces, there's no dirty state. */
  patchChat(patch: Partial<Chat>): Promise<void>
  /** All bookmarked chats, newest first, the sidebar list. */
  loadBookmarks(): Promise<void>
  /** Flip a chat's bookmark by id, whether or not it's in the current per-character list. */
  toggleBookmark(id: number): Promise<void>
  deleteChat(id: number): Promise<void>
  /** `speakerId` sends to one chosen participant (single reply, no round robin). */
  send(character: Character, text: string, speakerId?: number, as?: SpeakerAs): Promise<void>
  /** The send path minus persisting the user message: generates a new trailing message.
   *  `speakerId` hands the turn to a specific participant instead of taking the next in order. */
  retry(character: Character, speakerId?: number): Promise<void>
  /** What the error bar offers: whatever just failed, tried again. */
  retryLast(character: Character): Promise<void>
  /** Close the error bar without retrying. */
  clearError(): void
  /** Re-roll any assistant message into a new swipe. With an instruction, it's a rewrite. */
  regenerate(character: Character, messageId: number, instruction?: string): Promise<void>
  /** Carry the last reply on from where it stopped, into the swipe that's showing. */
  continueLast(character: Character): Promise<void>
  /** Pick an alternate. No generation. */
  swipeTo(messageId: number, index: number): Promise<void>
  /** Drop alternates by index. Deleting the last one deletes the message. */
  deleteSwipes(messageId: number, indices: number[]): Promise<void>
  /** Run the agent pass over an assistant message by hand. Always starts from the stored original, so
   *  running it twice does not compound, and replaces the previous rewrite. */
  passMessage(messageId: number): Promise<void>
  /** Put the pre-Gold-Pass text back and forget the rewrite. */
  revertMessagePass(messageId: number): Promise<void>
  /** Hide the "kept after N tries" notice on the selected swipe. */
  dismissPassFailure(messageId: number): Promise<void>
  stop(): void
  editMessage(id: number, content: string): Promise<void>
  /** A player tracker edit. Lands on the last message, so it carries forward and outlives that message's swipes. */
  setTrackerValue(key: string, value: TrackerValue): Promise<void>
  deleteMessage(id: number): Promise<void>
  deleteMessages(ids: number[]): Promise<void>
}

export const useChats = create<ChatState>()((set, get) => ({
  chats: [],
  bookmarks: [],
  summaries: {},
  chat: null,
  messages: [],
  streamingText: '',
  streamingReasoning: '',
  streaming: false,
  passing: false,
  streamingPending: [],
  streamingStage: null,
  streamingChatId: null,
  viewingChatId: null,
  setViewing: (chatId) => set({ viewingChatId: chatId }),
  error: '',
  clearError: () => set({ error: '' }),
  trimmedCount: 0,
  miscPrompts: undefined,
  regeneratingId: null,
  speakingName: '',
  speakingId: null,
  failed: null,
  searchMessages: [],

  loadChats: async (characterId) => {
    const rows = (await storage.find('chats', 'characterId', characterId)) as unknown as Chat[]
    set({ chats: rows.sort((a, b) => a.createdAt - b.createdAt) })
  },

  loadSearchIndex: async (characterId) => {
    const chats = (await storage.find('chats', 'characterId', characterId)) as unknown as Chat[]
    const ids = new Set(chats.map((c) => c.id))
    // One pass over the whole table, like loadSummaries: a query per chat would be a dozen reads
    // for the same answer.
    const rows = (await storage.getAll('messages')) as unknown as Message[]
    set({ searchMessages: rows.filter((m) => ids.has(m.chatId)) })
  },

  loadSummaries: async () => {
    // reads every chat and message once. Fine at local-first sizes; if it drags,
    // keep a lastMessageAt on Chat and drop the messages pass.
    const chats = (await storage.getAll('chats')) as unknown as Chat[]
    const messages = (await storage.getAll('messages')) as unknown as Message[]
    const characterOf = new Map(chats.map((c) => [c.id!, c.characterId]))
    const summaries: Record<number, CharacterSummary> = {}
    for (const chat of chats) {
      const s = (summaries[chat.characterId] ??= { count: 0, latest: 0 })
      s.count++
      // Same "last" the profile used to compute: last written to, not last created.
      if (s.lastChatAt === undefined || chat.updatedAt >= s.lastChatAt) {
        s.lastChatAt = chat.updatedAt
        s.lastChatId = chat.id
      }
    }
    for (const message of messages) {
      const characterId = characterOf.get(message.chatId)
      if (characterId === undefined) continue
      const s = summaries[characterId]
      if (s && message.createdAt > s.latest) s.latest = message.createdAt
    }
    set({ summaries })
  },

  load: async (chatId) => {
    const chat = (await storage.get('chats', chatId)) as unknown as Chat | undefined
    const rows = (await storage.find('messages', 'chatId', chatId)) as unknown as Message[]
    // Resolved here: the view can show the same wording the send path will use, the rewrite box
    // prefills with the old-message instruction, and reading it off the stack in a component would
    // mean an async lookup per message row.
    const miscPrompts = chat ? (await stackFor(chat)).miscPrompts : undefined
    set({ chat: chat ?? null, messages: rows.sort(byTime), trimmedCount: 0, miscPrompts })
  },

  messagesOf: async (chatId) => {
    const rows = (await storage.find('messages', 'chatId', chatId)) as unknown as Message[]
    return rows.sort(byTime)
  },

  createChat: async (characterId) => {
    const character = useCharacters.getState().characters.find((c) => c.id === characterId)
    const name = character?.name || 'Chat'
    const existing = (await storage.find('chats', 'characterId', characterId)) as unknown as Chat[]
    const now = Date.now()
    const id = await storage.put('chats', {
      ownerId: currentOwnerId(),
      characterId,
      title: chatTitle(name, now, existing.map((c) => c.title)),
      createdAt: now,
      updatedAt: now,
    })
    // The greeting seeds the first assistant message with every greeting as a swipe: swiping it
    // picks another greeting rather than calling the model. Tokens resolve here, once, as the
    // card data becomes a real message, after that it's transcript like any other turn.
    const persona = await usePersonas.getState().ensureActive()
    const greetings = character
      ? [character.firstMessage, ...character.alternateGreetings]
          .filter((g) => g.trim())
          .map((g) => swapTokens(g, chatTokens(character, persona)))
      : []
    if (greetings.length) {
      await storage.put('messages', {
        ownerId: currentOwnerId(),
        chatId: id,
        role: 'assistant',
        content: greetings[0],
        // One swipe is just the message; more than one gives the loop something to cycle.
        ...(greetings.length > 1 ? { swipes: greetings, swipeIndex: 0 } : {}),
        createdAt: now,
      })
    }
    return id
  },

  renameChat: async (id, title) => {
    const chat = get().chats.find((c) => c.id === id)
    if (!chat) return
    await storage.put('chats', { ...chat, title, updatedAt: Date.now() } as unknown as StoredRecord)
    await get().loadChats(chat.characterId)
  },

  patchChat: async (patch) => {
    const chat = get().chat
    if (!chat) return
    const next = { ...chat, ...patch, updatedAt: Date.now() }
    await storage.put('chats', next as unknown as StoredRecord)
    set({ chat: next })
  },

  loadBookmarks: async () => {
    const rows = (await storage.getAll('chats')) as unknown as Chat[]
    set({ bookmarks: rows.filter((c) => c.bookmarked).sort((a, b) => b.updatedAt - a.updatedAt) })
  },

  toggleBookmark: async (id) => {
    const chat = (await storage.get('chats', id)) as unknown as Chat | undefined
    if (!chat) return
    const next = { ...chat, bookmarked: !chat.bookmarked, updatedAt: Date.now() }
    await storage.put('chats', next as unknown as StoredRecord)
    // Keep every list that might show this chat in sync without a full reload.
    set((s) => ({
      chats: s.chats.map((c) => (c.id === id ? next : c)),
      chat: s.chat?.id === id ? next : s.chat,
    }))
    await get().loadBookmarks()
  },

  deleteChat: async (id) => {
    const chat = get().chats.find((c) => c.id === id)
    for (const message of await storage.find('messages', 'chatId', id)) {
      await storage.remove('messages', message.id!)
    }
    await storage.remove('chats', id)
    if (chat) await get().loadChats(chat.characterId)
    await get().loadBookmarks()
  },

  send: async (character, text, speakerId, as) => {
    const chat = get().chat
    if (!chat) return

    // Commands are read here rather than in the composer: this is the one funnel. An
    // ordinary chat, the host's own turn, and a guest's `say` off the wire all arrive through
    // `send`. A guest can type a command without the protocol carrying one.
    const roster = participants(chat)
    const cards = useCharacters.getState().characters
    const inRoster = roster
      .map((id) => cards.find((c) => c.id === id))
      .filter((c): c is Character => !!c)
    const command = parseCommand(text, inRoster.map(displayName))
    // Neither command runs a request: nothing downstream would clear a stale error banner.
    if (command) set({ error: '' })

    if (command?.name === 'sendas') {
      const speaker = inRoster.find(
        (c) => displayName(c).toLowerCase() === command.target?.toLowerCase(),
      )
      if (!speaker) {
        set({ error: `No character named "${command.target}" in this chat.` })
        return
      }
      if (!command.text.trim()) {
        set({ error: 'No message after the character name.' })
        return
      }
      // The same fields `retry` stamps on a reply, minus the request snapshot and reasoning:
      // there was no request. Nothing records that a human wrote it: from here on it is that
      // character's line like any other.
      await storage.put('messages', {
        ownerId: currentOwnerId(),
        chatId: chat.id!,
        role: 'assistant',
        content: swapTokens(command.text, chatTokens(character, await usePersonas.getState().ensureActive())),
        speakerId: speaker.id,
        speakerName: displayName(speaker), // copied, not looked up: survives deleting the character
        createdAt: Date.now(),
      })
      // Move the cursor as a real reply would: the round robin picks up after this character
      // rather than handing them the next turn too.
      await get().patchChat({ lastSpeakerIndex: roster.indexOf(speaker.id!) })
      await get().load(chat.id!)
      return
    }

    // A divider row: nothing is sent, nothing is generated. Role is 'user' only: the field
    // is required. Every reader that cares checks `divider` first.
    if (command?.name === 'break') {
      await storage.put('messages', {
        ownerId: currentOwnerId(),
        chatId: chat.id!,
        role: 'user',
        content: '',
        divider: true,
        createdAt: Date.now(),
      })
      await get().load(chat.id!)
      return
    }

    // Nothing of yours is posted: `/continue` is a second pass at the reply that's already there.
    if (command?.name === 'continue') {
      await get().continueLast(character)
      return
    }

    const persona = await usePersonas.getState().ensureActive()
    // Tokens resolve as you send, and the expanded text is what's stored, the message becomes
    // transcript the moment it lands, and transcript is never substituted again.
    // In a group this resolves {{char}} against the chat's first participant, not whoever replies
    // next: you type before the round robin picks. Per-message speaker choice is the upgrade path
    // if that turns out to be the wrong one.
    // Module-contributed text rides along in the message, not as a separate prompt block: the
    // tag rules can collapse it from view the same way any other tag is collapsed. An unregistered
    // module contributes nothing. A WIP module left out of the build appends nothing either.
    const ctx = { chatId: chat.id!, user: as?.name ?? persona.name, char: displayName(character) }
    const blocks: string[] = []
    const enabledPlugins = useSettings.getState().enabledPlugins
    for (const mod of modules) {
      if (!isEnabled(mod, enabledPlugins)) continue
      const block = await mod.decorateMessage?.(ctx)
      if (block) blocks.push(block)
    }
    // `/noreply` is an ordinary user turn with the command word taken off; everything else
    // (decoration, tokens, the record itself) is the same, and only the reply is skipped below.
    // `/narrate` is an ordinary user turn with the command word taken off, same as `/noreply`.
    // Only who replies changes, and that is decided below. Bare `/narrate` posts nothing and
    // simply asks the Narrator for a beat on the transcript as it stands.
    const narrating = command?.name === 'narrate'
    const body = command?.name === 'noreply' || narrating ? command!.text : stripEscape(text)
    if (command?.name === 'noreply' && !body.trim()) return
    if (narrating && !body.trim()) {
      stopped = false
      await get().retry(character, narratorId)
      return
    }
    const withBlock = [body, ...blocks].join('\n')
    const content = swapTokens(withBlock, chatTokens(character, persona))
    // Persisted before the request goes out: a failure can never lose what you typed.
    await storage.put('messages', {
      ownerId: currentOwnerId(),
      chatId: chat.id!,
      role: 'user',
      content,
      // `as` bypasses the active persona entirely: the name is stamped and personaId is left
      // absent. A guest's id is a string and has no business in a numeric Dexie key, and a guest
      // must not be attributed to one of this browser's real personas.
      ...(as ? { personaName: as.name } : { personaId: persona.id, personaName: persona.name }),
      createdAt: Date.now(),
    })
    await get().load(chat.id!)
    if (command?.name === 'noreply') return

    // A chosen speaker is one reply from that participant, no round robin, no self-reply run.
    stopped = false
    // `/narrate` is exactly that, aimed at the Narrator, and it overrides a pinned responder for
    // this one turn. The next ordinary send goes back to whoever was pinned.
    if (narrating) {
      await get().retry(character, narratorId)
      return
    }
    if (speakerId !== undefined) {
      await get().retry(character, speakerId)
      return
    }
    // Self-reply: keep the round robin going for a few turns instead of stopping at one reply.
    // Off is a run of one: this is the same loop either way.
    for (let turn = 0; turn < autoTurns(chat); turn++) {
      await get().retry(character)
      if (stopped || get().error) break
    }
  },

  retry: async (character, speakerId) => {
    const chat = get().chat
    if (!chat) return
    // The Narrator is deliberately not in chat.participantIds. Branch before the index maths:
    // they never meet (both use -1 as a sentinel). If asked by Narrator, resolve speaker
    // directly without touching lastSpeakerIndex.
    if (isNarrator(speakerId)) {
      const speaker = narratorCharacter()
      // Params resolve against the speaker, not the chat's first participant.
      const connection = resolvedConnection(speaker, chat)
      if (!connection) {
        set({ error: 'No active connection, pick one in Settings.' })
        return
      }

      const controller = new AbortController()
      abort = controller
      set({ streaming: true, streamingChatId: chat.id ?? null, streamingText: '', streamingReasoning: '', error: '', failed: null, speakingName: speaker.name, speakingId: speaker.id ?? null })

      let text = ''
        let reasoning = ''
      let finishReason = ''
      let snapshot: string | undefined
      let passOriginal: string | undefined
      let passFail: string | undefined
      let passSummary: string | undefined
      try {
        const stack = await stackFor(chat)
        // Stack first, Settings second. A stack with an `[if Narrator]` branch has already said
        // what the Narrator is, and handing it the global text as well would be two voices
        // arguing. Only a stack that never mentions the Narrator gets the fallback, which rides
        // in on the card's systemPrompt so it lands where a character's own would.
        const told = blocksMentionCondition(stack.active, 'narrator')
          ? speaker
          : narratorCharacter(useSettings.getState().narratorPrompt)
        const persona = await usePersonas.getState().ensureActive()
        await loadTokenizer(tokenizerFor(connection))
        const promptMessages = buildPrompt(
          {
            stack,
            character,
            persona,
            chat,
            speaker: told,
            messages: get().messages,
            worldInfo: await worldInfoFor(speaker, chat, get().messages, stack.worldInfoBudget),
            tagRules: useSettings.getState().appearance.tagRules,
            cast: _sessionCast,
            personas: _sessionPersonas,
          },
          budgetOf(connection),
        )
        set({ trimmedCount: promptMessages.droppedCount })
        snapshot = snapshotOf(promptMessages.messages, connection)
        for await (const chunk of sendMessage(
          promptMessages.messages,
          connection,
          controller.signal,
        )) {
          if (chunk.reasoning) {
            reasoning += chunk.reasoning
            set({ streamingReasoning: reasoning })
          }
          if (chunk.content) {
            text += chunk.content
            set({ streamingText: text })
          }
          if (chunk.finishReason) finishReason = chunk.finishReason
        }

        // Agent pass over the finished reply.
        if (text && !controller.signal.aborted) {
          set({ passing: true })
          const pass = await agentPass(chat, text, controller.signal, (t, pending, stage) => set({ streamingText: t, streamingPending: pending, streamingStage: stage ?? null }))
          text = pass.text
          passOriginal = pass.original
          passFail = pass.failed
          passSummary = pass.summary
          set({ streamingText: text })
        }
      } catch (err) {
        // A deliberate stop keeps the partial; a real failure discards it and keeps the error.
        if (!controller.signal.aborted) {
          set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: (err as Error).message })
          return
        }
      } finally {
        abort = null
        set({ passing: false })
      }

      // A clean stream that never produced reply text: don't vanish silently, say so, and name the
      // reasoning-only case. A reasoning model that hits its token limit while thinking is the
      // usual cause.
      if (!text && !controller.signal.aborted) {
        const message = reasoning
          ? `The model produced ${reasoning.length} characters of reasoning but no reply, it likely hit the token limit while thinking. Raise max tokens, or turn off the model's thinking mode.`
          : 'The model returned an empty response.'
        set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: message })
        return
      }

      set({
        streaming: false,
        streamingChatId: null,
        streamingText: '',
        speakingName: '',
        speakingId: null,
        error: finishReason === 'length' ? lengthNotice(maxTokensOf(connection)) : '',
      })
      if (text) {
        await storage.put('messages', {
          ownerId: currentOwnerId(),
          chatId: chat.id!,
          role: 'assistant',
          content: text,
          speakerId: speaker.id,
          speakerName: speaker.name, // copied, not looked up: survives deleting the character
          // Parallel to swipes: this reply is swipe 0 even before there's a swipes array.
          requestSnapshots: [snapshot],
          reasonings: [reasoning || undefined],
          reasoningEnd: reasoningEndOf(text, connection),
          // Parallel to swipes as well: what the writing model said, before the pass.
          passOriginals: [passOriginal],
          passFailed: [passFail],
          passSummaries: [passSummary],
          trackerUpdates: [trackerUpdate(character, chat, get().messages, passOriginal ?? text, connection)],
          createdAt: Date.now(),
        })
        // The cursor only moves on a reply that happened: a failed turn doesn't skip anyone.
        // Both of these write through the *current* chat. Skip them if you navigated to another
        // one while this streamed, the message above already landed in the right chat.
        if (get().chat?.id === chat.id) {
          await get().patchChat({ lastSpeakerIndex: -1 }) // Narrator doesn't advance round robin
          await get().load(chat.id!)
        }
        if (get().viewingChatId !== chat.id) useBlips.getState().mark(speaker.id)
      }
      return
    }
    // Round robin, unless an avatar was clicked. A solo chat is a roster of one: this is the
    // same code path either way, index 0, every time.
    const asked = speakerId === undefined ? -1 : participants(chat).indexOf(speakerId)
    const index = asked >= 0 ? asked : nextSpeakerIndex(chat)
    const speaker = characterAt(chat, index, character)
    // Params resolve against the speaker, not the chat's first participant.
    const connection = resolvedConnection(speaker, chat)
    if (!connection) {
      set({ error: 'No active connection, pick one in Settings.' })
      return
    }

    const controller = new AbortController()
    abort = controller
    set({ streaming: true, streamingChatId: chat.id ?? null, streamingText: '', streamingReasoning: '', error: '', failed: null, speakingName: speaker.name, speakingId: speaker.id ?? null })

    let text = ''
    let reasoning = ''
    let finishReason = ''
    let passOriginal: string | undefined
    let passFail: string | undefined
    let passSummary: string | undefined
    let snapshot: string | undefined
    try {
      const stack = await stackFor(chat)
      const persona = await usePersonas.getState().ensureActive()
      await loadTokenizer(tokenizerFor(connection))
      const promptMessages = buildPrompt(
        {
          stack,
          character,
          persona,
          chat,
          speaker,
          messages: get().messages,
          worldInfo: await worldInfoFor(speaker, chat, get().messages, stack.worldInfoBudget),
          tagRules: useSettings.getState().appearance.tagRules,
          cast: _sessionCast,
          personas: _sessionPersonas,
        },
        budgetOf(connection),
      )
      set({ trimmedCount: promptMessages.droppedCount })
      snapshot = snapshotOf(promptMessages.messages, connection)
      for await (const chunk of sendMessage(
        promptMessages.messages,
        connection,
        controller.signal,
      )) {
        if (chunk.reasoning) {
          reasoning += chunk.reasoning
          set({ streamingReasoning: reasoning })
        }
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }

      // Agent pass over the finished reply.
      if (text && !controller.signal.aborted) {
        set({ passing: true })
        const pass = await agentPass(chat, text, controller.signal, (t, pending, stage) => set({ streamingText: t, streamingPending: pending, streamingStage: stage ?? null }))
        text = pass.text
        passOriginal = pass.original
        passFail = pass.failed
        passSummary = pass.summary
        set({ streamingText: text })
      }
    } catch (err) {
      // A deliberate stop keeps the partial; a real failure discards it and keeps the error.
      if (!controller.signal.aborted) {
        set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: (err as Error).message })
        return
      }
    } finally {
      abort = null
      set({ passing: false })
    }

    // A clean stream that never produced reply text: don't vanish silently, say so, and name the
    // reasoning-only case, since a reasoning model that hits its token limit while thinking is the
    // usual cause.
    if (!text && !controller.signal.aborted) {
      const message = reasoning
        ? `The model produced ${reasoning.length} characters of reasoning but no reply, it likely hit the token limit while thinking. Raise max tokens, or turn off the model's thinking mode.`
        : 'The model returned an empty response.'
      set({ streaming: false, streamingChatId: null, streamingText: '', speakingName: '', speakingId: null, error: message })
      return
    }

    set({
      streaming: false,
      streamingChatId: null,
      streamingText: '',
      speakingName: '',
      speakingId: null,
      error: finishReason === 'length' ? lengthNotice(maxTokensOf(connection)) : '',
    })
    if (text) {
      await storage.put('messages', {
        ownerId: currentOwnerId(),
        chatId: chat.id!,
        role: 'assistant',
        content: text,
        speakerId: speaker.id,
        speakerName: speaker.name, // copied, not looked up: survives deleting the character
        // Parallel to swipes: this reply is swipe 0 even before there's a swipes array.
        requestSnapshots: [snapshot],
        reasonings: [reasoning || undefined],
        reasoningEnd: reasoningEndOf(text, connection),
        // Parallel to swipes as well: what the writing model said, before the pass.
        passOriginals: [passOriginal],
        passFailed: [passFail],
        passSummaries: [passSummary],
        trackerUpdates: [trackerUpdate(character, chat, get().messages, passOriginal ?? text, connection)],
        createdAt: Date.now(),
      })
      // The cursor only moves on a reply that happened, so a failed turn doesn't skip anyone.
      // Both of these write through the *current* chat, so skip them if you navigated to another
      // one while this streamed, the message above already landed in the right chat.
      if (get().chat?.id === chat.id) {
        await get().patchChat({ lastSpeakerIndex: index })
        await get().load(chat.id!)
      }
      if (get().viewingChatId !== chat.id) useBlips.getState().mark(speaker.id)
    }
  },

  retryLast: async (character) => {
    const failed = get().failed
    // Gone (deleted while the error was up) falls back to a normal trailing generation.
    const stillThere = failed && get().messages.some((m) => m.id === failed.messageId)
    if (failed && stillThere) await get().regenerate(character, failed.messageId, failed.instruction)
    else await get().retry(character)
  },

  regenerate: async (character, messageId, instruction) => {
    const chat = get().chat
    if (!chat) return
    const at = get().messages.findIndex((m) => m.id === messageId)
    const target = get().messages[at]
    if (!target || target.role !== 'assistant') return

    // Re-rolled as whoever said it, not as whoever is up next: the snapshot stays truthful and
    // the reply keeps the same voice, card and params.
    const speaker =
      useCharacters.getState().characters.find((c) => c.id === target.speakerId) ?? character
    const connection = resolvedConnection(speaker, chat)
    if (!connection) {
      set({ error: 'No active connection, pick one in Settings.' })
      return
    }

    const controller = new AbortController()
    abort = controller
    set({
      streaming: true,
      streamingChatId: chat.id ?? null,
      streamingText: '',
      streamingReasoning: '',
      error: '',
      failed: null,
      regeneratingId: messageId,
      speakingName: target.speakerName ?? speaker.name,
    })

    // Loaded before the instruction is built, not inside the try below: both re-roll wordings are
    // the stack's to override. The stack has to be in hand first.
    const stack = await stackFor(chat)
    // Your instruction if you gave one; otherwise, on an old message, the default that tells the
    // model what came after it. Re-rolling the last message appends nothing, exactly as Phase 1.
    // Only your half is token-swapped: the quoted message and transcript stay verbatim.
    const rewriteTokens = chatTokens(speaker, await usePersonas.getState().ensureActive())
    const appendSystem = instruction?.trim()
      ? rewritePrompt(target.content, swapTokens(instruction, rewriteTokens), stack.miscPrompts)
      : oldMessageInstruction(get().messages.slice(at + 1), speaker.name, stack.miscPrompts)

    let text = ''
    let reasoning = ''
    let passOriginal: string | undefined
    let passFail: string | undefined
    let passSummary: string | undefined
    let finishReason = ''
    let snapshot: string | undefined
    try {
      const persona = await usePersonas.getState().ensureActive()
      await loadTokenizer(tokenizerFor(connection))
      // As if this message didn't exist yet: history is everything before it. Anything after it
      // is neither sent nor touched, it only reaches the model through the instruction above.
      const prompt = buildPrompt(
        {
          stack,
          character,
          persona,
          chat,
          speaker,
          messages: get().messages.slice(0, at),
          worldInfo: await worldInfoFor(speaker, chat, get().messages.slice(0, at), stack.worldInfoBudget),
          appendSystem,
          tagRules: useSettings.getState().appearance.tagRules,
          cast: _sessionCast,
          personas: _sessionPersonas,
        },
        budgetOf(connection),
      )
      set({ trimmedCount: prompt.droppedCount })
      snapshot = snapshotOf(prompt.messages, connection)
      for await (const chunk of sendMessage(
        prompt.messages,
        connection,
        controller.signal,
      )) {
        if (chunk.reasoning) {
          reasoning += chunk.reasoning
          set({ streamingReasoning: reasoning })
        }
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }

      // Agent pass, same as the send path.
      if (text && !controller.signal.aborted) {
        set({ passing: true })
        const pass = await agentPass(chat, text, controller.signal, (t, pending, stage) => set({ streamingText: t, streamingPending: pending, streamingStage: stage ?? null }))
        text = pass.text
        passOriginal = pass.original
        passFail = pass.failed
        passSummary = pass.summary
        set({ streamingText: text })
      }
    } catch (err) {
      // A deliberate stop keeps the partial as a swipe; a real failure changes nothing.
      if (!controller.signal.aborted) {
        set({
          streaming: false,
          streamingChatId: null,
          streamingText: '',
          regeneratingId: null,
          speakingName: '',
          error: (err as Error).message,
          // Retry means "this re-roll again", not "add a new message at the bottom".
          failed: { messageId, instruction },
        })
        return
      }
    } finally {
      abort = null
      set({ passing: false })
    }

    set({
      streaming: false,
      streamingChatId: null,
      streamingText: '',
      regeneratingId: null,
      speakingName: '',
      error: finishReason === 'length' ? lengthNotice(maxTokensOf(connection)) : '',
    })
    const regen = regenerated(target, text, snapshot, reasoning, instruction)
    // Applied after rather than threaded through `regenerated`: it pads both arrays to the swipe
    // count itself. An older message's holes stay where they belong.
    const passedRegen = regen && withPass(regen, passOriginal, passFail, passSummary)
    const tracked = passedRegen && trackerUpdate(character, chat, get().messages.slice(0, at), passOriginal ?? text, connection)
    const updated = tracked ? withTrackerUpdate(passedRegen, tracked) : passedRegen
    if (updated) {
      await storage.put('messages', updated as unknown as StoredRecord)
      // Same as retry: don't reload if you've moved to another chat mid-stream, blip instead.
      if (get().chat?.id === chat.id) await get().load(chat.id!)
      if (get().viewingChatId !== chat.id) {
        useBlips.getState().mark(target.speakerId ?? chat.characterId)
      }
    }
  },

  continueLast: async (character) => {
    const chat = get().chat
    if (!chat) return
    const target = get().messages.at(-1)
    if (!target || target.role !== 'assistant') {
      set({ error: 'Nothing to continue, the last message is not a reply.' })
      return
    }
    // Trailing whitespace is not part of what was said, and some endpoints reject a prefill that
    // ends in it. Trimmed once here: the text sent and the text appended to are the same string.
    const prefix = target.content.replace(/\s+$/, '')
    if (!prefix) {
      set({ error: 'Nothing to continue, the last reply is empty.' })
      return
    }

    // Continued as whoever said it, like a re-roll: same voice, card and params.
    const speaker =
      useCharacters.getState().characters.find((c) => c.id === target.speakerId) ?? character
    const connection = resolvedConnection(speaker, chat)
    if (!connection) {
      set({ error: 'No active connection, pick one in Settings.' })
      return
    }

    const controller = new AbortController()
    abort = controller
    set({
      streaming: true,
      streamingChatId: chat.id ?? null,
      // The bubble renders streamingText in place of the message: it carries the partial too.
      // Otherwise the reply would appear to vanish and regrow from the join.
      streamingText: prefix,
      streamingReasoning: '',
      error: '',
      failed: null,
      regeneratingId: target.id ?? null,
      speakingName: target.speakerName ?? speaker.name,
    })

    let added = ''
    let reasoning = ''
    let finishReason = ''
    let snapshot: string | undefined
    try {
      const stack = await stackFor(chat)
      const persona = await usePersonas.getState().ensureActive()
      await loadTokenizer(tokenizerFor(connection))
      // History is everything before this message; the message itself goes in as the prefill:
      // it appears once rather than twice. Deliberately unlabelled in a group chat, where history
      // turns carry a `Name:` prefix, the continuation should come back as bare text.
      const prompt = buildPrompt(
        {
          stack,
          character,
          persona,
          chat,
          speaker,
          messages: get().messages.slice(0, -1),
          worldInfo: await worldInfoFor(speaker, chat, get().messages.slice(0, -1), stack.worldInfoBudget),
          appendSystem: continuePrompt(stack.miscPrompts),
          appendAssistant: prefix,
          tagRules: useSettings.getState().appearance.tagRules,
          cast: _sessionCast,
          personas: _sessionPersonas,
        },
        budgetOf(connection),
      )
      set({ trimmedCount: prompt.droppedCount })
      snapshot = snapshotOf(prompt.messages, connection)
      // Deliberately not passed. A continuation's reply is the accepted prefix plus
      // what the model just added, and `continued` writes the whole thing back over the swipe. A
      // second pass would edit text the user already kept. Wiring it needs the pass to be told which
      // span is new and to leave the rest alone.
      //
      // The pass is skipped here for the same reason, and more strongly: a rewrite stage remakes a whole
      // passage rather than a flagged span. It would restate the prefix the user accepted. The
      // manual action on the message is how a continued reply gets rewritten.
      for await (const chunk of sendMessage(prompt.messages, connection, controller.signal)) {
        if (chunk.reasoning) {
          reasoning += chunk.reasoning
          set({ streamingReasoning: reasoning })
        }
        if (chunk.content) {
          added += chunk.content
          set({ streamingText: prefix + added })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      // A deliberate stop keeps what arrived; a real failure leaves the message as it was. `failed`
      // stays null on purpose: the error bar's Retry re-rolls, and a re-roll is the opposite of
      // this. Run `/continue` again instead. Upgrade path is a kind on `failed`.
      if (!controller.signal.aborted) {
        set({
          streaming: false,
          streamingChatId: null,
          streamingText: '',
          regeneratingId: null,
          speakingName: '',
          error: (err as Error).message,
        })
        return
      }
    } finally {
      abort = null
    }

    set({
      streaming: false,
      streamingChatId: null,
      streamingText: '',
      regeneratingId: null,
      speakingName: '',
      // A continuation can hit the limit as readily as the reply did, and then it can be continued
      // again, the notice is the same one either way.
      error: finishReason === 'length' ? lengthNotice(maxTokensOf(connection)) : '',
    })
    // Joined raw. What the model sent is what's stored, and it decides its own leading space.
    const joined = added ? continued(target, prefix + added, snapshot, reasoning) : null
    // The whole reply parses again against the history before it: the continuation may carry the tag.
    const tracked = joined && trackerUpdate(character, chat, get().messages.slice(0, -1), joined.content, connection)
    const updated = tracked ? withTrackerUpdate(joined, tracked) : joined
    if (updated) {
      await storage.put('messages', updated as unknown as StoredRecord)
      if (get().chat?.id === chat.id) await get().load(chat.id!)
      if (get().viewingChatId !== chat.id) {
        useBlips.getState().mark(target.speakerId ?? chat.characterId)
      }
    }
  },

  passMessage: async (messageId) => {
    const chat = get().chat
    if (!chat) return
    const at = get().messages.findIndex((m) => m.id === messageId)
    const target = get().messages[at]
    if (!target || target.role !== 'assistant') return

    // Always from the stored original: running this twice passes the reply again rather than
    // passing what the last run produced.
    const source = passOriginalFor(target) ?? target.content
    if (!source.trim()) return

    const speaker = useCharacters
      .getState()
      .characters.find((c) => c.id === target.speakerId)

    const controller = new AbortController()
    abort = controller
    set({
      streaming: true,
      passing: true,
      streamingChatId: chat.id ?? null,
      // The bubble renders streamingText in place of the message: it starts as the source and
      // is overwritten as the rewrite arrives.
      streamingText: source,
      streamingReasoning: '',
      error: '',
      regeneratingId: messageId,
      speakingName: target.speakerName ?? speaker?.name ?? '',
    })

    let result: PassResult
    try {
      result = await agentPass(chat, source, controller.signal, (t, pending, stage) => set({ streamingText: t, streamingPending: pending, streamingStage: stage ?? null }), true)
    } catch {
      // Only an abort reaches here, and a stopped rewrite leaves the message exactly as it was.
      set({ streaming: false, passing: false, streamingChatId: null, streamingText: '', regeneratingId: null, speakingName: '' })
      abort = null
      return
    }
    abort = null
    set({ streaming: false, passing: false, streamingChatId: null, streamingText: '', regeneratingId: null, speakingName: '' })

    const updated = result.original
      ? passed(target, result.text, result.original ?? source, result.summary, result.failed)
      : withPass(selectSwipe(target, swipeIndex(target)), passOriginalFor(target), result.failed)
    await storage.put('messages', updated as unknown as StoredRecord)
    if (get().chat?.id === chat.id) await get().load(chat.id!)
  },

  dismissPassFailure: async (messageId) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message) return
    // Clears the notice on the selected swipe only. The passed text and its original stay.
    await storage.put('messages', withPass(message, passOriginalFor(message), undefined, passSummaryFor(message)) as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  revertMessagePass: async (messageId) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message) return
    const updated = revertPass(message)
    if (!updated) return
    await storage.put('messages', updated as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  swipeTo: async (messageId, index) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message) return
    await storage.put('messages', selectSwipe(message, index) as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  deleteSwipes: async (messageId, indices) => {
    const message = get().messages.find((m) => m.id === messageId)
    if (!message) return
    const updated = deletedSwipes(message, indices)
    if (!updated) return get().deleteMessage(messageId)
    await storage.put('messages', updated as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  stop: () => {
    stopped = true
    abort?.abort()
  },

  setTrackerValue: async (key, value) => {
    const chat = get().chat
    if (!chat) return
    const last = get().messages.at(-1)
    if (!last) return get().patchChat({ trackerOverrides: { ...chat.trackerOverrides, [key]: value } })
    await storage.put('messages', { ...last, trackerOverrides: { ...last.trackerOverrides, [key]: value } } as unknown as StoredRecord)
    await get().load(chat.id!)
  },

  editMessage: async (id, content) => {
    const message = get().messages.find((m) => m.id === id)
    if (!message) return
    await storage.put('messages', { ...message, content } as unknown as StoredRecord)
    await get().load(message.chatId)
  },

  deleteMessage: async (id) => {
    const chatId = get().chat?.id
    await storage.remove('messages', id)
    if (chatId) await get().load(chatId)
  },

  deleteMessages: async (ids) => {
    const chatId = get().chat?.id
    // sequential removes, one reload at the end. Bulk delete if ranges get huge.
    for (const id of ids) await storage.remove('messages', id)
    if (chatId) await get().load(chatId)
  },
}))
