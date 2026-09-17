import { create } from 'zustand'

/**
 * Whether the onboarding tour is running. Which tour runs isn't stored: TourHost reads the route
 * and looks it up, so navigating isn't a state to keep in sync.
 *
 * Nothing persists here. Every run starts at step 1; resume after a refresh isn't a feature.
 */
export const useTour = create<{ running: boolean; start(): void; stop(): void }>((set) => ({
  running: false,
  start: () => set({ running: true }),
  stop: () => set({ running: false }),
}))
