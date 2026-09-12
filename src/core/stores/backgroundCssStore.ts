import { create } from 'zustand'
import type { BackgroundSlot } from '../palette/palette'

/**
 * CSS and HTML being edited but not saved. The Backgrounds panel writes here as the user types and
 * the background layer prefers it over the palette's stored value: the page restyles live. The
 * layer also renders `slot` rather than the route's: a chat background is visible while the panel
 * that edits it is open.
 *
 * In memory only, nothing here survives a reload, which is the point: a reload is a way out of
 * css/html that made the page unreadable.
 */
interface BackgroundCssState {
  preview: { slot: BackgroundSlot; css: string; html: string } | null
  setPreview(slot: BackgroundSlot, css: string, html: string): void
  clearPreview(): void
}

export const useBackgroundCss = create<BackgroundCssState>()((set) => ({
  preview: null,
  setPreview: (slot, css, html) => set({ preview: { slot, css, html } }),
  clearPreview: () => set({ preview: null }),
}))
