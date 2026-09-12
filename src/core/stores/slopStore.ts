import { create } from 'zustand'

/**
 * The handoff buffer between a chat message and the Slop-dentifier screen.
 *
 * Not persisted and not in a backup: it holds one passage for the length of a navigation. A chat
 * quick action drops the message text here and routes to /slopdentifier. The view picks it up on
 * mount and clears it. Opening the screen later starts empty rather than showing whatever was
 * last inspected.
 */
interface SlopState {
  sample: string
  setSample(text: string): void
  takeSample(): string
}

export const useSlopSample = create<SlopState>()((set, get) => ({
  sample: '',
  setSample: (text) => set({ sample: text }),
  takeSample: () => {
    const { sample } = get()
    if (sample) set({ sample: '' })
    return sample
  },
}))
