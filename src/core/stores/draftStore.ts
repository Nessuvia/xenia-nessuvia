import { create } from 'zustand'

/**
 * What's typed in the composer but not sent yet. A store of its own: the preview renders in the
 * sidebar, nowhere near the composer, and can see it without ChatView re-rendering the whole
 * message list on every keystroke.
 */
interface DraftState {
  text: string
  setText(text: string): void
}

export const useDraft = create<DraftState>()((set) => ({
  text: '',
  setText: (text) => set({ text }),
}))
