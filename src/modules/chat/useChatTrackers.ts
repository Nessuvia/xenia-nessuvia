import { useSyncExternalStore } from 'react'
import { useChats } from '../../core/stores/chatStore'
import { useCharacters } from '../../core/stores/charactersStore'
import { trackerValues } from '../../core/trackers/trackerState'

/** The open chat's card trackers and their current values. Null when the card has none. */
export function useChatTrackers() {
  const chat = useChats((s) => s.chat)
  const messages = useChats((s) => s.messages)
  const setValue = useChats((s) => s.setTrackerValue)
  // First card only. Group chats read the same card the prompt does.
  const character = useCharacters((s) => s.characters.find((c) => c.id === chat?.characterId))
  const defs = character?.trackers ?? []
  if (!chat || !character || !defs.length) return null
  return { character, defs, values: trackerValues(defs, messages, chat.trackerOverrides), setValue }
}

/**
 * Docked or floating, and the floating box. A browser preference: straight to localStorage, left
 * out of backups. The event keeps the sidebar panel and the floating one in step.
 */
export interface TrackerPanelPref {
  floating: boolean
  x: number
  y: number
  w: number
  h: number
}

const prefKey = 'nessuTavern.trackerPanel'
const prefEvent = 'nessuTavern.trackerPanel'
const defaultPref: TrackerPanelPref = { floating: false, x: 80, y: 80, w: 260, h: 320 }

let cachedRaw: string | null = null
let cached = defaultPref

function readPref(): TrackerPanelPref {
  const raw = localStorage.getItem(prefKey)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      cached = { ...defaultPref, ...(raw ? JSON.parse(raw) : {}) }
    } catch {
      cached = defaultPref
    }
  }
  return cached
}

export function setTrackerPanelPref(patch: Partial<TrackerPanelPref>) {
  localStorage.setItem(prefKey, JSON.stringify({ ...readPref(), ...patch }))
  window.dispatchEvent(new Event(prefEvent))
}

export function useTrackerPanelPref(): TrackerPanelPref {
  return useSyncExternalStore((notify) => {
    window.addEventListener(prefEvent, notify)
    return () => window.removeEventListener(prefEvent, notify)
  }, readPref)
}
