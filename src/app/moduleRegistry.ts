import type { RemixiconComponentType } from '@remixicon/react'
import { lazy, type ComponentType } from 'react'

export interface AppModule {
  id: string
  label: string
  icon: RemixiconComponentType
  route: string
  component: ComponentType
  // [hashId, label] pairs shown as sub-items in the sidebar on hover; the view reads the hash.
  tabs?: readonly (readonly [string, string])[]
  // Listed in Settings > Miscellaneous > Plugins, and off until enabled there.
  plugin?: boolean
  // Sections contributed to the chat sidebar. Order follows module registration order in main.tsx,
  // same as the sidebar. A panel that shouldn't show renders null; there is no visibility API.
  chatPanels?: readonly { label: string; component: ComponentType }[]
  // Text appended to the outgoing user message, before token substitution. '' contributes nothing.
  // ctx is exactly what the one current caller (body map) needs. Widen it when a second
  // contributor wants more. It's a compile error in one place. Guessing wider now buys nothing.
  decorateMessage?(ctx: MessageContext): string | Promise<string>
}

/** What a decorator gets told about the message being sent. */
export interface MessageContext {
  chatId: number
  user: string
  char: string
}

export const modules: AppModule[] = []

/** Whether a module is active. Non-plugin modules always are; plugins wait for their setting.
 *  Takes the record rather than reading the store so components can subscribe and re-render. */
export function isEnabled(mod: AppModule, enabledPlugins: Record<string, boolean>) {
  return !mod.plugin || enabledPlugins[mod.id] === true
}

export function registerModule(mod: AppModule) {
  modules.push(mod)
}

type ViewLoader = () => Promise<{ default: ComponentType }>

// A lazy component keeps its loader private. The same import has to be handed to us to prefetch.
// lazyView pairs the two: React gets the lazy wrapper, the registry keeps the loader.
const loaders = new Map<ComponentType, ViewLoader>()

/** Use in place of `lazy()` for a module's route view: it can also be prefetched. */
export function lazyView(load: ViewLoader) {
  const component = lazy(load) as unknown as ComponentType
  loaders.set(component, load)
  return component
}

let preloading = false

/** Fetch every registered module's chunk, one at a time: a tab is already in memory when it is
 *  clicked. Sequential and idle-scheduled: the point is to stay out of the way of whatever the user
 *  is doing, not to win a race. The browser cache and the import map dedupe against the real
 *  navigation. A click mid-prefetch costs nothing. */
export function preloadModules() {
  if (preloading) return
  preloading = true
  const queue = modules.map((mod) => loaders.get(mod.component)).filter((load) => load !== undefined)
  const idle: (cb: () => void) => void = window.requestIdleCallback
    ? (cb) => void window.requestIdleCallback(cb)
    : (cb) => void setTimeout(cb, 200)
  const next = () => {
    const load = queue.shift()
    if (!load) return
    // A failed chunk is not worth reporting: the route's own Suspense boundary retries on click.
    idle(() => void load().then(next, next))
  }
  next()
}

/** Every chat-sidebar section, in module registration order. */
export function chatPanels(enabledPlugins: Record<string, boolean>) {
  return modules.filter((mod) => isEnabled(mod, enabledPlugins)).flatMap((mod) => mod.chatPanels ?? [])
}
