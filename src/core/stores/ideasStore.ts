import { create } from 'zustand'
import type { Message } from '../storage/types'
import { sendMessage } from '../connectors/openaiCompatible'
import type { MiscPrompts } from '../prompt/miscPrompts'
import { ideasMessages, parseIdeas, type IdeaNames } from '../prompt/ideasPrompt'
import { resolveConnection, useSettings } from './settingsStore'

/**
 * Suggested ideas for what happens next in a chat. Transient: nothing here is stored. Separate from
 * post-processing, and chat-only. `chatStore` reads the picked idea on send; this store never reads
 * the chat store, so the chat's messages and wording are handed in.
 */
interface IdeasState {
  /** The chat the ideas belong to. Ideas for any other chat are neither shown nor sent. */
  chatId: number | null
  ideas: string[]
  /** The idea held for the next send, or null. */
  picked: string | null
  suggesting: boolean
  /** Why the last suggestion came back with nothing. Empty otherwise. */
  note: string
  /** One request through the ideas connection for three ideas. */
  suggest(chatId: number, messages: Message[], prompts: MiscPrompts, names: IdeaNames): Promise<void>
  /** Hold an idea for the next send. Picking the held one again clears it. */
  pick(idea: string): void
  /** Drop the ideas, and a suggestion still running. */
  clear(): void
  /** On send in `chatId`: the held idea, if any, and the chips clear. Another chat's ideas are left alone. */
  takePicked(chatId: number): string | undefined
}

export const useIdeas = create<IdeasState>()((set, get) => ({
  chatId: null,
  ideas: [],
  picked: null,
  suggesting: false,
  note: '',

  suggest: async (chatId, messages, prompts, names) => {
    const connection = resolveConnection(useSettings.getState().ideas.connectionId)
    if (!connection) {
      set({ chatId, ideas: [], picked: null, note: 'No connection to ask. Set one up in Settings.' })
      return
    }
    set({ chatId, ideas: [], picked: null, suggesting: true, note: '' })
    let out = ''
    try {
      for await (const chunk of sendMessage(ideasMessages(messages, names, prompts), connection)) {
        out += chunk.content ?? ''
      }
    } catch (err) {
      // Shown beside the button rather than in the chat's error bar, whose Retry re-rolls a reply.
      if (get().chatId === chatId) set({ suggesting: false, note: (err as Error).message })
      return
    }
    // Cleared, or asked again from another chat, while this ran: the result is stale.
    if (get().chatId !== chatId || !get().suggesting) return
    const ideas = parseIdeas(out)
    set({ suggesting: false, ideas, note: ideas.length ? '' : 'No ideas came back.' })
  },

  pick: (idea) => set({ picked: get().picked === idea ? null : idea }),

  clear: () => set({ chatId: null, ideas: [], picked: null, suggesting: false, note: '' }),

  takePicked: (chatId) => {
    if (get().chatId !== chatId) return undefined
    const picked = get().picked ?? undefined
    set({ ideas: [], picked: null, note: '' })
    return picked
  },
}))
