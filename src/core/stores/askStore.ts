import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../connectors/connectorInterface'
import { sendMessage } from '../connectors/openaiCompatible'
import { snapshotOf } from '../connectors/snapshot'
import { currentOwnerId } from '../storage/storageInterface'
import type { Message } from '../storage/types'
import { activeConnection, defaultAssistantPrompt, useSettings } from './settingsStore'
import { useCharacters } from './charactersStore'
import { deletedSwipes, regenerated, selectSwipe } from './swipes'
import { rewritePrompt, oldMessageInstruction } from '../prompt/rewrite'
import { characterTokens, swapTokens } from '../prompt/swapTokens'
import { maxTokensOf } from '../params/connectionParams'

/**
 * Ask turns are `Message` records so the whole Chat message UI works on them unchanged, swipes,
 * snapshots, reasoning, edit, delete. They live in localStorage rather than Dexie: there is one
 * Ask conversation, not a list of them, and `chatId` is 0 for all of them.
 */
export type AskTurn = Message

// Ids only have to be unique within the one saved transcript. A counter seeded past whatever
// was reloaded is enough. No store to hand them out.
let nextId = 1
const withId = (turn: Omit<Message, 'id'>): Message => ({ ...turn, id: nextId++ })

// Not state: nothing renders from it, `streaming` already drives the button.
let abort: AbortController | null = null

interface AskState {
  /** The single saved conversation. Starting a new one erases it. */
  turns: AskTurn[]
  streaming: boolean
  streamingText: string
  /** Reasoning as it arrives. Only reset when a stream starts; nothing renders it while idle. */
  streamingReasoning: string
  /** The turn being re-rolled: the stream renders in place instead of at the bottom. */
  regeneratingId: number | null
  error: string
  send(text: string): Promise<void>
  /** Re-roll an assistant turn into a new swipe. With an instruction, it's a rewrite. */
  regenerate(messageId: number, instruction?: string): Promise<void>
  /** Pick an alternate. No generation. */
  swipeTo(messageId: number, index: number): void
  /** Drop alternates by index. Dropping the last one drops the turn. */
  deleteSwipes(messageId: number, indices: number[]): void
  editMessage(id: number, content: string): void
  /** Drop one turn. The rest keep their order: the next send carries the edited transcript. */
  deleteMessage(id: number): void
  stop(): void
  newChat(): void
  dismissError(): void
}

/** The character Ask is currently framed as, if any. */
export function askCharacter() {
  const id = useSettings.getState().askCharacterId
  return id ? useCharacters.getState().characters.find((c) => c.id === id) : undefined
}

function askTokens() {
  // `{{user}}` maps to itself: Ask has no persona. Leave the token in the text rather than
  // blanking it. With no character picked there's nothing to resolve against and every token
  // stays literal.
  const character = askCharacter()
  return character ? characterTokens(character, '{{user}}') : undefined
}

/** Token substitution as Ask does it. A no-op when no character is picked. */
function askSwap(text: string): string {
  const tokens = askTokens()
  return tokens ? swapTokens(text, tokens) : text
}

/**
 * The whole request. Built here rather than through the prompt stack system: Ask has no cards, no
 * persona and no lore. The prompt is the system box, the transcript and the suffix.
 *
 * `history` is what the model sees as the conversation, the full transcript on a send, everything
 * before the target on a re-roll. `appendSystem` carries the rewrite instruction.
 */
function buildAskMessages(history: AskTurn[], appendSystem?: string): ChatMessage[] {
  const { askSystemPrompt, askSuffix, askAssistantPrompt } = useSettings.getState()
  const character = askCharacter()
  const tokens = askTokens()
  const swap = askSwap

  const messages: ChatMessage[] = []
  if (askSystemPrompt.trim()) messages.push({ role: 'system', content: swap(askSystemPrompt) })
  if (character && tokens) {
    const prompt = askAssistantPrompt.trim() || defaultAssistantPrompt
    const framing = swap(prompt)
    // The card travels with the framing, the prompt asks the model to weigh what kind of
    // character this is, which it can only do from the card. A prompt that places
    // {{charDescription}} itself has already said where the card goes. It isn't appended
    // a second time.
    const card = /\{\{charDescription\}\}/i.test(prompt)
      ? ''
      : [tokens.chardescription, tokens.charpersonality]
          .map((t) => (t || '').trim())
          .filter(Boolean)
          .join('\n\n')
    messages.push({ role: 'system', content: card ? `${framing}\n\n${card}` : framing })
  }
  for (const turn of history) messages.push({ role: turn.role, content: turn.content })
  if (askSuffix.trim()) messages.push({ role: 'user', content: swap(askSuffix) })
  if (appendSystem?.trim()) messages.push({ role: 'system', content: appendSystem })
  return messages
}

export const useAsk = create<AskState>()(
  persist(
    (set, get) => ({
      turns: [],
      streaming: false,
      streamingText: '',
      streamingReasoning: '',
      regeneratingId: null,
      error: '',

      send: async (text) => {
        if (get().streaming || !text.trim()) return
        const connection = activeConnection()
        if (!connection) {
          set({ error: 'No active connection, pick one in Settings.' })
          return
        }

        // Expanded as you send: what lands in the transcript is the resolved text, and the
        // transcript is never substituted again.
        const turns: AskTurn[] = [
          ...get().turns,
          withId({ ownerId: currentOwnerId(), chatId: 0, role: 'user', content: askSwap(text), createdAt: Date.now() }),
        ]
        set({ turns, streaming: true, streamingText: '', streamingReasoning: '', error: '' })

        const messages = buildAskMessages(turns)
        const controller = new AbortController()
        abort = controller
        let reply = ''
        let reasoning = ''
        let finishReason = ''
        const snapshot = snapshotOf(messages, connection)
        try {
          for await (const chunk of sendMessage(messages, connection, controller.signal)) {
            if (chunk.reasoning) {
              reasoning += chunk.reasoning
              set({ streamingReasoning: reasoning })
            }
            if (chunk.content) {
              reply += chunk.content
              set({ streamingText: reply })
            }
            if (chunk.finishReason) finishReason = chunk.finishReason
          }
        } catch (err) {
          if (!controller.signal.aborted) {
            abort = null
            // Whatever streamed is kept, same as Stop.
            set({
              turns: reply ? [...turns, assistantTurn(reply, snapshot, reasoning)] : turns,
              streaming: false,
              streamingText: '',
                  error: (err as Error).message,
            })
            return
          }
        } finally {
          abort = null
        }

        set({
          turns: reply ? [...turns, assistantTurn(reply, snapshot, reasoning)] : turns,
          streaming: false,
          streamingText: '',
              error:
            finishReason === 'length'
              ? `Response stopped at the ${maxTokensOf(connection)} token limit. Raise Max tokens in the connection.`
              : '',
        })
      },

      regenerate: async (messageId, instruction) => {
        if (get().streaming) return
        const connection = activeConnection()
        if (!connection) {
          set({ error: 'No active connection, pick one in Settings.' })
          return
        }
        const at = get().turns.findIndex((t) => t.id === messageId)
        const target = get().turns[at]
        if (!target || target.role !== 'assistant') return

        set({ streaming: true, streamingText: '', streamingReasoning: '', error: '', regeneratingId: messageId })

        // Your instruction if you gave one; otherwise, on an old turn, the default that tells the
        // model what came after it. Re-rolling the last turn appends nothing.
        // As if this turn didn't exist yet: history is everything before it. Anything after it is
        // neither sent nor touched, it only reaches the model through the instruction.
        const later = get().turns.slice(at + 1)
        const appendSystem = instruction?.trim()
          ? rewritePrompt(target.content, askSwap(instruction))
          : oldMessageInstruction(later, assistantName())
        const messages = buildAskMessages(get().turns.slice(0, at), appendSystem)

        const controller = new AbortController()
        abort = controller
        let text = ''
        let reasoning = ''
        let finishReason = ''
        const snapshot = snapshotOf(messages, connection)
        try {
          for await (const chunk of sendMessage(messages, connection, controller.signal)) {
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
        } catch (err) {
          // A deliberate stop keeps the partial as a swipe; a real failure changes nothing.
          if (!controller.signal.aborted) {
            set({
              streaming: false,
              streamingText: '',
                  regeneratingId: null,
              error: (err as Error).message,
            })
            return
          }
        } finally {
          abort = null
        }

        const updated = regenerated(target, text, snapshot, reasoning)
        set((s) => ({
          streaming: false,
          streamingText: '',
              regeneratingId: null,
          turns: updated ? s.turns.map((t) => (t.id === messageId ? updated : t)) : s.turns,
          error:
            finishReason === 'length'
              ? `Response stopped at the ${maxTokensOf(connection)} token limit. Raise Max tokens in the connection.`
              : '',
        }))
      },

      swipeTo: (messageId, index) =>
        set((s) => ({
          turns: s.turns.map((t) => (t.id === messageId ? selectSwipe(t, index) : t)),
        })),

      deleteSwipes: (messageId, indices) =>
        set((s) => ({
          turns: s.turns.flatMap((t) => {
            if (t.id !== messageId) return [t]
            const updated = deletedSwipes(t, indices)
            return updated ? [updated] : []
          }),
        })),

      editMessage: (id, content) =>
        set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, content } : t)) })),

      deleteMessage: (id) => set((s) => ({ turns: s.turns.filter((t) => t.id !== id) })),

      stop: () => abort?.abort(),

      newChat: () => {
        abort?.abort()
        set({ turns: [], streaming: false, streamingText: '', regeneratingId: null, error: '' })
      },

      dismissError: () => set({ error: '' }),
    }),
    {
      name: 'nessuTavern.ask',
      // Only the transcript is worth reloading; stream state is per-session.
      partialize: (s) => ({ turns: s.turns }),
      // Ids have to keep climbing past a reloaded transcript or a new turn would collide with one.
      // Turns saved before ids existed get one here, without it every action keys off undefined.
      onRehydrateStorage: () => (state) => {
        for (const turn of state?.turns ?? []) {
          if (turn.id === undefined) turn.id = nextId++
          else nextId = Math.max(nextId, turn.id + 1)
        }
      },
    },
  ),
)

/** Who the assistant is, for headers and for the old-message instruction. */
export function assistantName(): string {
  return askCharacter()?.name || 'Assistant'
}

function assistantTurn(content: string, snapshot: string, reasoning: string): AskTurn {
  return withId({
    ownerId: currentOwnerId(),
    chatId: 0,
    role: 'assistant',
    content,
    // Parallel to swipes: this reply is swipe 0 even before there's a swipes array.
    requestSnapshots: [snapshot],
    reasonings: [reasoning || undefined],
    createdAt: Date.now(),
  })
}
