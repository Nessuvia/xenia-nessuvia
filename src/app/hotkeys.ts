import { useSettings } from '../core/stores/settingsStore'

/** Page-level shortcuts are off on a phone (as in SillyTavern), when turned off in Settings, and
 *  while a dialog is open: its keys belong to it. */
export function hotkeysOn(): boolean {
  if (useSettings.getState().hotkeysOff) return false
  if (window.matchMedia('(max-width: 700px)').matches) return false
  return !document.querySelector('.dialog')
}

/** An arrow key in a field moves the caret. An empty textarea (the idle composer) doesn't count. */
export function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLTextAreaElement) return target.value !== ''
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target.isContentEditable
}
