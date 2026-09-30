import { useEffect } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../connectors/connectorInterface'
import { sendMessage } from '../connectors/openaiCompatible'
import { maxTokensOf } from '../params/connectionParams'
import { activeConnection, useSettings, type Connection } from './settingsStore'

/**
 * Ask is the sidebar's side conversation. One shared thread, whatever page you're on. The page
 * decides what a send does: a page that registers an `AskContext` (the Look tab, Palettes) turns
 * the message into a change on what you're looking at; anywhere else it's a plain chat with no
 * character and no system prompt.
 *
 * The thread persists to localStorage (`nessuTavern.ask`) as a preference of this browser. Backups
 * and sync leave it out.
 */
export interface AskTurn {
  id: number
  role: 'user' | 'assistant'
  content: string
  /** The context that produced this turn, for Undo. Absent on a plain chat turn. */
  contextId?: string
}

export interface AskResult {
  /** What the reply bubble says. */
  reply: string
  /** Puts back what the change replaced. Held in memory only: a reload drops it. */
  undo?: () => void
}

/** What the current page offers Ask. Registered by the page with `useAskContext`. */
export interface AskContext {
  id: string
  /** The header badge, e.g. "Prompt stacks → Look". */
  label: string
  /** The header blurb. Empty shows none. */
  info: string
  /** `history` is the thread before this message, only the turns this context produced. */
  run(text: string, signal: AbortSignal, connection: Connection, history: AskTurn[]): Promise<AskResult>
}

/** A context failure with something worth showing under the error, like the model's raw reply. */
export class AskError extends Error {
  detail?: string
  constructor(message: string, detail?: string) {
    super(message)
    this.detail = detail
  }
}

let nextId = 1
let abort: AbortController | null = null
// Not state: closures don't persist, and a turn's Undo only exists while this map holds it.
const undos = new Map<number, () => void>()

interface AskState {
  turns: AskTurn[]
  /** Whether the sidebar shows Ask instead of its normal body. */
  open: boolean
  streaming: boolean
  streamingText: string
  error: string
  errorDetail: string
  context: AskContext | null
  /** Ask's own pick. Null, or a deleted id, falls back to the active connection. Ask-wide on
   *  purpose: picking here leaves chats on theirs. */
  connectionId: string | null
  setConnection(id: string | null): void
  setOpen(open: boolean): void
  send(text: string): Promise<void>
  stop(): void
  newChat(): void
  undo(id: number): void
  canUndo(turn: AskTurn): boolean
  dismissError(): void
}

export const useAsk = create<AskState>()(
  persist(
    (set, get) => {
      const turn = (role: AskTurn['role'], content: string, contextId?: string): AskTurn => ({
        id: nextId++,
        role,
        content,
        contextId,
      })

      return {
        turns: [],
        open: false,
        streaming: false,
        streamingText: '',
        error: '',
        errorDetail: '',
        context: null,
        connectionId: null,

        setConnection: (connectionId) => set({ connectionId }),
        setOpen: (open) => set({ open }),

        send: async (text) => {
          if (get().streaming || !text.trim()) return
          const connection = askConnection()
          if (!connection) {
            set({ error: 'No active connection. Pick one in Connections.', errorDetail: '' })
            return
          }
          const context = get().context
          const turns = [...get().turns, turn('user', text, context?.id)]
          set({ turns, streaming: true, streamingText: '', error: '', errorDetail: '' })
          const controller = new AbortController()
          abort = controller

          try {
            if (context) {
              const history = get().turns.filter((t) => t.contextId === context.id)
              const result = await context.run(text, controller.signal, connection, history)
              const reply = turn('assistant', result.reply, context.id)
              if (result.undo) undos.set(reply.id, result.undo)
              set({ turns: [...turns, reply] })
              return
            }

            const messages: ChatMessage[] = turns.map((t) => ({ role: t.role, content: t.content }))
            let reply = ''
            let finishReason = ''
            try {
              for await (const chunk of sendMessage(messages, connection, controller.signal)) {
                if (chunk.content) {
                  reply += chunk.content
                  set({ streamingText: reply })
                }
                if (chunk.finishReason) finishReason = chunk.finishReason
              }
            } finally {
              // Whatever streamed is kept, on Stop and on failure alike.
              if (reply) set({ turns: [...turns, turn('assistant', reply)] })
            }
            if (finishReason === 'length') {
              set({ error: `Response stopped at the ${maxTokensOf(connection)} token limit. Raise Max tokens in the connection.` })
            }
          } catch (err) {
            if (!controller.signal.aborted) {
              set({ error: (err as Error).message, errorDetail: err instanceof AskError ? (err.detail ?? '') : '' })
            }
          } finally {
            abort = null
            set({ streaming: false, streamingText: '' })
          }
        },

        stop: () => abort?.abort(),

        newChat: () => {
          abort?.abort()
          undos.clear()
          set({ turns: [], error: '', errorDetail: '' })
        },

        undo: (id) => {
          undos.get(id)?.()
          undos.delete(id)
          // A fresh array so the bubble re-renders without its button.
          set((s) => ({ turns: [...s.turns] }))
        },

        // Only on the page that made the change: the Look tab's Undo writes through that tab's editor.
        canUndo: (t) => undos.has(t.id) && t.contextId === get().context?.id,

        dismissError: () => set({ error: '', errorDetail: '' }),
      }
    },
    {
      name: 'nessuTavern.ask',
      partialize: (s) => ({ turns: s.turns, connectionId: s.connectionId }),
      // Ids keep climbing past a reloaded thread, or a new turn would collide with one.
      onRehydrateStorage: () => (state) => {
        for (const t of state?.turns ?? []) nextId = Math.max(nextId, t.id + 1)
      },
    },
  ),
)

/**
 * Registers a page's Ask context while the page is mounted. Pass a stable object (useMemo with no
 * deps); `run` should read the page's latest state through a ref.
 */
export function useAskContext(context: AskContext) {
  useEffect(() => {
    useAsk.setState({ context })
    return () => {
      if (useAsk.getState().context === context) useAsk.setState({ context: null })
    }
  }, [context])
}

/** The connection Ask sends with: its own pick if it still exists, else the active one. */
export function askConnection(): Connection | undefined {
  const id = useAsk.getState().connectionId
  return useSettings.getState().connections.find((c) => c.id === id) ?? activeConnection()
}
