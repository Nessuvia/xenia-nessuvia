import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import { activeDescription } from '../storage/types'
import type { CastEntry, PromptStack, Story } from '../storage/types'
import { sendMessage } from '../connectors/openaiCompatible'
import {
  beatValues,
  buildStoryPrompt,
  castText,
  storyScanText,
  type CastMember,
  type StoryAction,
  type StoryInputs,
} from '../prompt/buildStoryPrompt'
import { enabledBookIds, storyBooks } from '../prompt/storyBooks'
import { emptyWorldInfo, resolveWorldInfo, type ResolvedWorldInfo, type ScanText } from '../prompt/worldInfo'
import { useLorebooks } from './lorebooksStore'
import { useWorldInfo } from './worldInfoStore'
import { loadTokenizer } from '../prompt/budget'
import { tokenizerFor } from '../prompt/tokenizers'
import { withPlaceholder } from '../prompt/miscPrompts'
import { activeConnection } from './settingsStore'
import { useStacks } from './stacksStore'
import { useCharacters } from './charactersStore'
import { usePersonas } from './personasStore'
import { maxTokensOf } from '../params/connectionParams'
import { applyReplace } from '../prompt/textRules'
import { usesSlot } from '../prompt/stackTemplate'
import { storyReplaceRules } from './textRules'

function newStory(title: string): Story {
  return {
    ownerId: currentOwnerId(),
    title,
    cover: '',
    cast: [],
    text: '',
    premise: '',
    ending: '',
    beats: [],
    note: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

/** The enabled cast, flattened to the fields buildStoryPrompt needs. Missing rows (deleted out from
 *  under the cast) are skipped. Keeps card knowledge in the store; the assembly stays pure. */
export function resolveCast(cast: CastEntry[]): CastMember[] {
  const characters = useCharacters.getState().characters
  const personas = usePersonas.getState().personas
  const out: CastMember[] = []
  for (const entry of cast) {
    if (!entry.enabled) continue
    if (entry.kind === 'character') {
      const c = characters.find((x) => x.id === entry.id)
      if (c) out.push({ name: c.name, description: activeDescription(c), personality: c.personality, scenario: c.scenario, exampleDialogue: c.exampleDialogue })
    } else {
      const p = personas.find((x) => x.id === entry.id)
      if (p) out.push({ name: p.name, description: p.description })
    }
  }
  return out
}

/** One generation request against the document: where it lands and what it asks for. */
export interface StoryRequest {
  action: StoryAction
  /** The document as the editor holds it right now, which may be ahead of the saved text. */
  doc: string
  /** The range the result replaces. Equal for continue, the selection for the other actions. */
  from: number
  to: number
  instruction: string
}

/**
 * Everything but the document halves, from the open Story. The preview and `generate` both build
 * from this, so what the preview shows and what goes over the wire can't drift.
 */
export function storyInputs(
  story: Story,
  req: Pick<StoryInputs, 'action' | 'instruction' | 'before' | 'after' | 'selection'>,
  worldInfo: ResolvedWorldInfo,
): StoryInputs {
  const members = resolveCast(story.cast)
  // The picked sets' Find & Replace rules marked for the prompt. A document has no speaker, so a
  // rule's user/assistant target doesn't narrow it here.
  const rules = storyReplaceRules(story).map((r) => ({ ...r, target: 'both' as const }))
  const send = (text: string) => applyReplace(text, rules, 'assistant')
  return {
    action: req.action,
    before: send(req.before),
    after: send(req.after),
    selection: send(req.selection),
    instruction: req.instruction,
    title: story.title,
    premise: story.premise,
    ending: story.ending,
    ...beatValues(story.beats),
    note: story.note,
    cast: castText(members),
    castNames: members.map((m) => m.name),
    worldInfo: { before: worldInfo.before, after: worldInfo.after },
  }
}

/** Split the document around a request's range. */
export const splitDoc = (doc: string, from: number, to: number) => ({
  before: doc.slice(0, from),
  selection: doc.slice(from, to),
  after: doc.slice(to),
})

/**
 * The most recent generation, the only one that can be retried. Session state: the first keystroke
 * commits it and it's gone. Positions are into the document as it stood; nothing else can change
 * while this exists, because typing is what drops it.
 */
export interface LastGeneration {
  action: StoryAction
  instruction: string
  from: number
  /** The text either side of the range, as sent. A retry resends the same halves. */
  before: string
  after: string
  /** What the range held before the first generation. '' for continue. */
  selection: string
  /** The versions so far, oldest first. For a selection action the original text is version 0, so
   *  swiping back is an undo. */
  alternates: string[]
  index: number
}

interface WriteState {
  stories: Story[]
  loading: boolean
  /** The open Story; null on the Shelf. */
  story: Story | null
  streaming: boolean
  /** Text of the generation in flight. The editor splices it into the document as it grows. */
  streamingText: string
  last: LastGeneration | null
  /** The editor's selection, for the prompt preview. Session state. */
  cursor: { from: number; to: number }
  error: string
  /** The editor holds typing the database doesn't have yet. Drives the Saved indicator. */
  unsaved: boolean
  setUnsaved(unsaved: boolean): void
  /** What the open Story's lorebooks matched on the last `refreshWorldInfo`. Held here rather than
   *  resolved where it's needed: reading entries is async and the prompt preview renders
   *  synchronously. */
  worldInfo: ResolvedWorldInfo
  refreshWorldInfo(scan: ScanText[], budget?: number): Promise<ResolvedWorldInfo>
  load(): Promise<void>
  create(title: string): Promise<number>
  rename(id: number, title: string): Promise<void>
  setCover(id: number, cover: string): Promise<void>
  duplicate(id: number): Promise<number | null>
  remove(id: number): Promise<void>
  openStory(id: number): Promise<void>
  closeStory(): void
  /** Edit the open Story. Per Story, every field. State first, then storage. */
  update(patch: Partial<Story>): Promise<void>
  /** Persist the document. By id rather than through `update`: the editor's last debounced save
   *  can land after the Story has closed. */
  saveText(id: number, text: string): Promise<void>
  setCursor(from: number, to: number): void
  generate(req: StoryRequest): Promise<void>
  /** Generate the last request again, as a new alternate. */
  retry(): Promise<void>
  /** Show the previous (-1) or next (1) alternate of the last generation. */
  swipe(delta: number): void
  /** The Author typed: the last generation stays as it is and stops being retryable. */
  commitLast(): void
  stop(): void
  dismissError(): void
}

async function save(story: Story): Promise<number> {
  const now = Date.now()
  const record = { ...story, createdAt: story.createdAt || now, updatedAt: now }
  return storage.put('stories', record as unknown as StoredRecord)
}

// Not state: nothing renders from it, and `streaming` already drives the button.
let abort: AbortController | null = null

export const useWrite = create<WriteState>()((set, get) => {
  /**
   * Stream one version into `streamingText` and return what arrived. The caller holds `streaming`.
   * Errors land in `error`; the text that streamed is kept either way, same as Stop. A reply with
   * nothing in it says so, unless Stop is why.
   */
  async function stream(stack: PromptStack, inputs: StoryInputs, controller: AbortController): Promise<string> {
    const connection = activeConnection()
    if (!connection) {
      set({ error: 'No active connection. Pick one in Settings.' })
      return ''
    }
    let text = ''
    let finishReason = ''
    try {
      await loadTokenizer(tokenizerFor(connection))
      const budget = {
        contextLimit: connection.contextLimit,
        maxTokens: maxTokensOf(connection),
        safetyMarginPct: connection.safetyMarginPct,
      }
      const prompt = buildStoryPrompt(stack, inputs, budget)
      // ponytail: reasoning chunks are dropped, a think block has nowhere to go in a document.
      for await (const chunk of sendMessage(prompt.messages, withPlaceholder(connection, stack.miscPrompts), controller.signal)) {
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      if (!controller.signal.aborted) set({ error: (err as Error).message })
      return text
    }
    if (finishReason === 'length')
      set({ error: `Response stopped at the ${maxTokensOf(connection)} token limit. Raise Max tokens in the connection.` })
    else if (!text.trim() && !controller.signal.aborted) set({ error: 'The model sent back an empty reply.' })
    return text
  }

  /**
   * Hold `streaming` for one whole request, from the click to the last token, so the editor locks
   * and the toolbar shows it at once rather than after the stack and lorebooks load. Refuses a
   * second request with a toast rather than silently, and turns a throw into one.
   */
  async function run(body: (controller: AbortController) => Promise<void>, onFail: () => void) {
    if (get().streaming) {
      set({ error: 'A generation is already running. Stop it first.' })
      return
    }
    const controller = new AbortController()
    abort = controller
    set({ streaming: true, streamingText: '', error: '' })
    try {
      await body(controller)
    } catch (err) {
      set({ streaming: false, streamingText: '', error: (err as Error).message })
      onFail()
    } finally {
      abort = null
      if (get().streaming) set({ streaming: false, streamingText: '' })
    }
  }

  /** Resolve the stack and the lorebooks for one request. */
  async function prepare(story: Story, before: string, selection: string) {
    const stack = await useStacks.getState().ensureActive('story')
    // A stack without the document slot sends the model nothing to write from, or a literal
    // placeholder. Typically a Story stack saved before the slots were renamed.
    if (!usesSlot(stack.template, 'before'))
      throw new Error(
        `The Story stack "${stack.name}" has no {{ before }}, so the document wouldn't be sent. Edit it on the Prompts tab, or add Xenia - Story from Bundled.`,
      )
    const { beat } = beatValues(story.beats)
    // Matched against the text before the cursor plus what the passage is asked to be: a key named
    // only in the note or the beat should still fire.
    const world = await get().refreshWorldInfo(storyScanText(before + selection, [story.note, beat]), stack.worldInfoBudget)
    return { stack, world }
  }

  return {
    stories: [],
    loading: false,
    story: null,
    streaming: false,
    streamingText: '',
    last: null,
    cursor: { from: 0, to: 0 },
    error: '',
    unsaved: false,
    worldInfo: emptyWorldInfo,

    setUnsaved: (unsaved) => {
      if (get().unsaved !== unsaved) set({ unsaved })
    },

    refreshWorldInfo: async (scan, budget) => {
      const story = get().story
      if (!story) return emptyWorldInfo
      const lore = useLorebooks.getState()
      // The list is loaded once and kept; a generation that races the first load would otherwise see
      // no global books at all. Same guard chatStore's worldInfoFor uses.
      if (!lore.books.length && !lore.loading) await lore.load()
      const books = useLorebooks.getState().books
      const ids = enabledBookIds(storyBooks(story, useCharacters.getState().characters, books))
      let resolved = emptyWorldInfo
      if (ids.length) {
        const entries = await useWorldInfo.getState().fetchForBooks(ids)
        if (entries.length) resolved = resolveWorldInfo(entries, scan, new Map(books.map((b) => [b.id!, b])), budget)
      }
      // The Story may have closed or changed while the reads were in flight.
      if (get().story?.id === story.id) set({ worldInfo: resolved })
      return resolved
    },

    load: async () => {
      set({ loading: true })
      const rows = (await storage.getAll('stories')) as unknown as Story[]
      rows.sort((a, b) => b.updatedAt - a.updatedAt)
      set({ stories: rows, loading: false })
    },

    create: async (title) => {
      const id = await save(newStory(title))
      await get().load()
      return id
    },

    rename: async (id, title) => {
      // Renaming happens from the shelf and from the editor's title, where the shelf list may not
      // have been loaded yet. Fall back to the open Story.
      const open = get().story
      const story = get().stories.find((s) => s.id === id) ?? (open?.id === id ? open : undefined)
      if (!story) return
      const next = { ...story, title }
      // State before storage, as in palettesStore.update: a field bound to this value that waits on
      // Dexie gets its own keystroke back a tick late, and React puts the caret at the end.
      set((s) => ({
        stories: s.stories.map((x) => (x.id === id ? next : x)),
        ...(open?.id === id ? { story: next } : {}),
      }))
      await save(next)
      await get().load()
    },

    setCover: async (id, cover) => {
      const story = get().stories.find((s) => s.id === id)
      if (!story) return
      await save({ ...story, cover })
      await get().load()
    },

    duplicate: async (id) => {
      const story = (await storage.get('stories', id)) as unknown as Story | undefined
      if (!story) return null
      // Drop the id: storage assigns a new one. createdAt/updatedAt are set by save().
      const { id: _id, ...rest } = story
      const copyId = await save({ ...rest, title: `${story.title} copy`, createdAt: 0, updatedAt: 0 })
      await get().load()
      return copyId
    },

    remove: async (id) => {
      await storage.remove('stories', id)
      await get().load()
    },

    openStory: async (id) => {
      const story = (await storage.get('stories', id)) as unknown as Story | undefined
      // The cast picker and generation both read these from state.
      await Promise.all([useCharacters.getState().load(), usePersonas.getState().load()])
      set({ story: story ?? null, last: null, cursor: { from: 0, to: 0 }, error: '', unsaved: false })
    },

    closeStory: () => {
      // ponytail: the editor is what splices a stream in, so leaving the Story stops it. Keeping a
      // stream alive across a close would need the store to write the document itself.
      abort?.abort()
      set({ story: null, last: null, streamingText: '' })
    },

    update: async (patch) => {
      const story = get().story
      if (!story) return
      // Display settings aren't an edit to the Story, and the shelf sorts by updatedAt.
      const edit = Object.keys(patch).some((k) => k !== 'storyWidth')
      const next = { ...story, ...patch, ...(edit ? { updatedAt: Date.now() } : {}) }
      set({ story: next })
      await storage.put('stories', next as unknown as StoredRecord)
    },

    saveText: async (id, text) => {
      if (get().story?.id === id) await get().update({ text })
      else {
        const story = (await storage.get('stories', id)) as unknown as Story | undefined
        if (story && story.text !== text)
          await storage.put('stories', { ...story, text, updatedAt: Date.now() } as unknown as StoredRecord)
      }
    },

    setCursor: (from, to) => {
      const c = get().cursor
      if (c.from !== from || c.to !== to) set({ cursor: { from, to } })
    },

    generate: async (req) => {
      const story = get().story
      if (!story) return
      const { before, selection, after } = splitDoc(req.doc, req.from, req.to)
      const base = { action: req.action, instruction: req.instruction, from: req.from, before, after, selection }
      // Put the range back as it was, then let it go: what a failed or empty request leaves.
      const restore = () => {
        if (!get().last) return
        set({ streaming: false, streamingText: '', last: { ...base, alternates: [selection], index: 0 } })
        set({ last: null })
      }
      await run(async (controller) => {
        // A new request commits the previous one. Null first, so the editor drops the old range.
        set({ last: null })
        const { stack, world } = await prepare(story, before, selection)
        // The original selection is version 0 while the first version streams.
        set({ last: { ...base, alternates: req.action === 'continue' ? [''] : [selection], index: 0 } })
        const text = await stream(stack, storyInputs(story, base, world), controller)
        if (!text.trim()) return restore()
        const kept = req.action === 'continue' ? [] : [selection]
        set({ streaming: false, streamingText: '', last: { ...base, alternates: [...kept, text], index: kept.length } })
      }, restore)
    },

    retry: async () => {
      const { story, last } = get()
      if (!story) return
      if (!last) {
        set({ error: 'Nothing to retry. Retry works on the last generation until you type.' })
        return
      }
      await run(async (controller) => {
        const { stack, world } = await prepare(story, last.before, last.selection)
        const text = await stream(stack, storyInputs(story, last, world), controller)
        const current = get().last
        if (!current) return
        // An empty reply keeps the version on screen.
        const alternates = text.trim() ? [...current.alternates, text] : current.alternates
        set({ streaming: false, streamingText: '', last: { ...current, alternates, index: text.trim() ? alternates.length - 1 : current.index } })
      }, () => {})
    },

    swipe: (delta) => {
      const { last, streaming } = get()
      if (!last || streaming) return
      const index = Math.min(last.alternates.length - 1, Math.max(0, last.index + delta))
      if (index !== last.index) set({ last: { ...last, index } })
    },

    commitLast: () => {
      if (get().last && !get().streaming) set({ last: null })
    },

    stop: () => abort?.abort(),

    dismissError: () => set({ error: '' }),
  }
})
