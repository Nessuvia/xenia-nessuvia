import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Characters whose reply finished while you were somewhere else. A reminder, not an inbox: there is
 * no count and no per-chat detail. Just "this one said something since you looked".
 *
 * character ids only. Per-chat blips are the upgrade path if a character with several
 * running chats ever needs to say *which* one replied.
 */
/**
 * Two short notes, synthesized. Browsers ship no notification sound a page can play (the
 * Notification API's chime comes with a permission prompt and a system toast), and WebAudio is
 * shorter than shipping an audio file.
 *
 * fixed notes at a fixed volume, and a mute is the obvious next knob, appearance in
 * settingsStore is where it would live.
 */
function playBlip() {
  // Autoplay policy: a chat reply always follows a click, so the context is allowed to start.
  const ctx = new AudioContext()
  const gain = ctx.createGain()
  gain.connect(ctx.destination)
  // Ramps rather than steps: an abrupt start or stop on a sine is heard as a click.
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02)
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.34)
  for (const [at, hz] of [[0, 880], [0.14, 1174.7]] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz
    osc.connect(gain)
    osc.start(ctx.currentTime + at)
    osc.stop(ctx.currentTime + at + 0.08)
  }
  setTimeout(() => ctx.close(), 600)
}

interface BlipState {
  /** Character ids with an unseen reply. An array rather than a Set so it persists as JSON. */
  blips: number[]
  mark(characterId: number | undefined): void
  clear(characterId: number | undefined): void
  clearAll(): void
}

export const useBlips = create<BlipState>()(
  persist(
    (set) => ({
      blips: [],
      mark: (characterId) =>
        set((s) => {
          // Only on a character that wasn't already blipping: a run of replies isn't a run of
          // chimes.
          if (!characterId || s.blips.includes(characterId)) return s
          playBlip()
          return { blips: [...s.blips, characterId] }
        }),
      clear: (characterId) =>
        set((s) => (characterId ? { blips: s.blips.filter((id) => id !== characterId) } : s)),
      clearAll: () => set((s) => (s.blips.length ? { blips: [] } : s)),
    }),
    { name: 'nessuTavern.blips' },
  ),
)
