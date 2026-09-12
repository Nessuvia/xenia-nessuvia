import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import { activeDescription } from '../storage/types'
import type { Block, CastEntry, Chapter, ParamOverrides, Story } from '../storage/types'
import { sendMessage } from '../connectors/openaiCompatible'
import {
  buildStoryPrompt,
  castText,
  storyFit,
  storyScanText,
  type CastMember,
} from '../prompt/buildStoryPrompt'
import { enabledBookIds, storyBooks } from '../prompt/storyBooks'
import {
  emptyWorldInfo,
  resolveWorldInfo,
  type ResolvedWorldInfo,
  type ScanText,
} from '../prompt/worldInfo'
import { useLorebooks } from './lorebooksStore'
import { useWorldInfo } from './worldInfoStore'
import { chapterProse } from '../prompt/chapterGuide'
import { storyTokens } from '../prompt/storyTokens'
import { rewritePrompt } from '../prompt/rewrite'
import { deletedSwipes, instructionChain, regenerated, selectSwipe, swipeIndex } from './swipes'
import { countTokens, loadTokenizer, perMessageOverhead } from '../prompt/budget'
import { tokenizerFor } from '../prompt/tokenizers'
import { activeConnection } from './settingsStore'
import { resolveParams } from '../settings/resolveParams'
import { useStacks } from './stacksStore'
import { useCharacters } from './charactersStore'
import { usePersonas } from './personasStore'
import { maxTokensOf, withParam } from '../params/connectionParams'
import {
  buildChapterOutlineMessages,
  buildChapterSummaryMessages,
  buildStoryOutlineMessages,
  parseChapterOutlineReply,
  parseStoryOutlineReply,
  type ChapterOutlineRequest,
  type ChapterSummaryRequest,
  type StoryOutlineRequest,
} from '../prompt/outline'
import { defaultWeight, splitByWeight } from '../prompt/beatWeights'
import type { BeatWeight } from '../storage/types'

function newStory(title: string): Story {
  return {
    ownerId: currentOwnerId(),
    title,
    cover: '',
    cast: [],
    direction: '',
    premise: '',
    ending: '',
    themes: '',
    genre: '',
    tone: '',
    setting: '',
    targetWords: 0,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** A blank beat. Empty instructions are the ordinary state of one the Author has not planned yet. */
export function newBlock(beat = '', weight: BeatWeight = defaultWeight): Block {
  return { id: crypto.randomUUID(), beat, weight, content: '', context: 'both' }
}

function newChapter(storyId: number, order: number, title: string): Chapter {
  const now = Date.now()
  return {
    ownerId: currentOwnerId(),
    storyId,
    order,
    title,
    summary: '',
    // No beats. A Chapter with none is the ordinary state of one that has not been outlined, and
    // the editor offers to generate them.
    blocks: [],
    targetWords: 0,
    // Everything you have: an unwritten Chapter sends beats because it has no summary yet, a
    // written one sends both, and the guide's trim decides what survives when room runs short.
    guideSend: 'both',
    createdAt: now,
    updatedAt: now,
  }
}

/** Stamp the open Story as edited. Prose lives on the Chapter: without this a Story's updatedAt
 *  would only move on rename/cover/cast, and the shelf sorts by it. */
async function touchStory(
  get: () => WriteState,
  set: (partial: Partial<WriteState>) => void,
) {
  const story = get().story
  if (!story) return
  const next = { ...story, updatedAt: Date.now() }
  await storage.put('stories', next as unknown as StoredRecord)
  set({ story: next })
}

// Not state: nothing renders from it, and `streaming` already drives the button.
let abort: AbortController | null = null

// Same reasoning: `rewriting` is what the UI draws, this only tells the loop it was stopped.
let rewriteStopped = false

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

/** The fields of a Chapter the Author edits. Every structural change to the prose, add a beat,
 *  remove one, reorder, reweight, change its context mode, is a `blocks` patch. Blocks get no
 *  structural actions of their own; only the three that stream or swipe do. */
export type ChapterPatch = Partial<
  Pick<Chapter, 'title' | 'summary' | 'blocks' | 'guideSend' | 'targetWords'>
>

interface WriteState {
  stories: Story[]
  loading: boolean
  /** The open Story and its Chapters in order; null/empty on the Shelf. */
  story: Story | null
  chapters: Chapter[]
  /** The Chapter the cursor is in. Generation appends to it. Session state, never stored; opening
   *  a Story with no cursor yet defaults to the last Chapter. */
  activeChapterId: number | null
  /** Per Block, bumped when that Block's content changes from outside the editor (open, generate,
   *  swipe) so its uncontrolled contenteditable re-syncs its DOM. Keyed by Block id rather than one
   *  counter for the Story: a bump must not clobber typing in a region that didn't change. */
  revs: Record<string, number>
  streaming: boolean
  /** Which Story the stream belongs to, so opening a different one mid-generation doesn't show its
   *  tail in the wrong prose. Null when idle. */
  streamingStoryId: number | null
  streamingText: string
  /** Reasoning as it streams, shown above the tail when Show reasoning is on. */
  streamingReasoning: string
  /** The Block the stream is landing in, so its region draws the tail and locks itself. */
  streamingBlockId: string | null
  /** True when the stream will replace what the Block already says (a regen), so the region hides
   *  the old text instead of leaving it above the tail. */
  streamingReplaces: boolean
  /** Progress of a chapter-wide rewrite: which beat of how many. Null when none is running. It is
   *  separate from `streaming`: the run outlives each individual request. */
  rewriting: { done: number; total: number } | null
  error: string
  /** The Block the cursor is in. Session state, never persisted. Find and Replace scopes to it, and
   *  the Story panel's beat checklist reads its Chapter through `activeChapterId`. */
  activeBlockId: string | null
  /** A caret position for a region to adopt the next time its rev rebuilds it. A rev bump throws
   *  the DOM away, so a caret that should survive a commit has to be handed over deliberately. */
  pendingCaret: { blockId: string; offset: number } | null
  /** Whether the editor renders inline markers as bold/italic (markers hidden) or shows the raw
   *  asterisks. global and in-memory, it's a way of looking at prose, not a property of
   *  one Story, and it resets on reload. Upgrade path if it should stick: a field on appearance in
   *  settingsStore, which is the persisted display-preference home. */
  styling: boolean
  toggleStyling(): void
  /** Block ids whose beat is folded shut in the document. In-memory and global, like `styling`:
   *  hiding a beat is something you do while reading, not a property of the beat. Lives here rather
   *  than in the region so the rail's chapter list can show the same open/shut state.
   *  a Block field is the upgrade path if it should survive a reload. */
  collapsedBeats: string[]
  setCollapsedBeats(ids: string[]): void
  /** What the open Story's lorebooks matched on the last `refreshWorldInfo`. Held here rather than
   *  resolved where it's needed: reading entries is async and the prompt preview renders
   *  synchronously. This is the one value both the preview and `writeBlock` read. What the
   *  preview shows and what goes over the wire cannot disagree. */
  worldInfo: ResolvedWorldInfo
  /** Match the Story's enabled lorebooks against `scan` and keep the result. Returns it too, for
   *  the caller that needs it in the same tick it asked for it. */
  refreshWorldInfo(scan: ScanText[], budget?: number): Promise<ResolvedWorldInfo>
  /** The Story's standing instruction, sent as the final user turn on every generation. Per
   *  Story. Debounced by the caller, this writes to the database. */
  setDirection(text: string): Promise<void>
  load(): Promise<void>
  /** Create a Story plus its first Chapter. Returns the new Story id. */
  create(title: string): Promise<number>
  rename(id: number, title: string): Promise<void>
  setCover(id: number, cover: string): Promise<void>
  /** Copy a Story and every Chapter under it. Returns the new Story id. */
  duplicate(id: number): Promise<number | null>
  /** Delete a Story and every Chapter under it. */
  remove(id: number): Promise<void>
  /** Load a Story + its Chapters into the editor. Also loads characters/personas for the cast. */
  openStory(id: number): Promise<void>
  /** Words across every Chapter of a Story, for the shelf preview. Not stored, counted on read. */
  wordCount(id: number): Promise<number>
  /** A Story's Chapters in order, without opening it, what the shelf's export reads. */
  chaptersOf(id: number): Promise<Chapter[]>
  closeStory(): void
  /** Sampling overrides for this Story, over the connection. Per Story. */
  setParamOverrides(next: ParamOverrides): Promise<void>
  /** How wide the prose is displayed, as a percent of the editor column. Per Story. */
  setStoryWidth(width: number): Promise<void>
  /** The opening situation on the Plot Layout strip. Per Story. Reaches the prompt as {{premise}}. */
  setPremise(text: string): Promise<void>
  /** The intended ending on the Plot Layout strip. Per Story. Reaches the prompt as {{ending}}. */
  setEnding(text: string): Promise<void>
  /** Whether the Premise and Ending caps render as thin markers. Per Story. */
  setCapsCollapsed(collapsed: boolean): Promise<void>
  /** Append a blank Chapter to the Story and make it active. */
  addChapter(title?: string): Promise<void>
  /** Edit a Chapter's plan (title, summary, beats, send toggle). Never touches prose. */
  updateChapter(id: number, patch: ChapterPatch): Promise<void>
  /** Delete a Chapter and its prose. The caller confirms; this does not. */
  removeChapter(id: number): Promise<void>
  /** Move a Chapter by one position. Its prose moves with it. */
  moveChapter(id: number, delta: number): Promise<void>
  setActiveChapter(id: number): void
  setActiveBlock(chapterId: number, blockId: string): void
  /** Persist one Block's prose. The editor debounces; this is the one write path from typing. The
   *  edit lands on the selected swipe too, so switching away and back doesn't lose it. */
  saveBlockText(chapterId: number, blockId: string, content: string): Promise<void>
  /** Replace a Block's prose wholesale (Find and Replace, undo). Same write as saveBlockText, but
   *  bumps the Block's rev so the editor re-syncs its DOM instead of keeping what was typed. */
  setBlockText(chapterId: number, blockId: string, content: string): Promise<void>
  /** Add / toggle / remove a cast member on the open Story. */
  setCast(cast: CastEntry[]): Promise<void>
  /** The Story fields the generation screen edits together: themes, genre, tone, setting, and the
   *  work's word target. Per Story. */
  setStoryFields(patch: Partial<Story>): Promise<void>
  /**
   * Ask the model for the Story's chapters and write them in. Chapters and summaries only: beats
   * come from `generateChapterOutline`, one chapter at a time.
   *
   * Replaces every Chapter the Story has. The prose goes with them: the screen
   * confirms it, and nothing is deleted until the reply has parsed.
   *
   * Throws on failure rather than only setting `error`. The screen stays open and shows what
   * went wrong next to the fields that produced it.
   */
  generateStoryOutline(req: StoryOutlineRequest): Promise<void>
  /** Ask the model for one Chapter's beats and write them in, replacing the beats it has and the
   *  prose in them. Same failure contract as the Story outline. */
  generateChapterOutline(chapterId: number, req: ChapterOutlineRequest): Promise<void>
  /**
   * Stream prose for one Block. The result lands as a new swipe and becomes the selected one:
   * every generation is undoable by swiping back. There are no spans to splice or validate.
   *
   * `direction` defaults to the Direction box verbatim, the Story's standing instruction. The
   * beat is NOT folded in; it reaches the model through {{beat}}, wherever the stack places it.
   * Pass one to override (that is what "Regen with instructions" does).
   */
  writeBlock(
    chapterId: number,
    blockId: string,
    direction?: string,
    replaces?: boolean,
    instruction?: string,
  ): Promise<void>
  /**
   * Write the Block again, following an instruction about the version it already holds, plus every
   * instruction that led to the selected swipe. That chain is what makes a re-roll iterate rather
   * than restart; swiping back to an earlier take shortens it.
   */
  regenBlock(chapterId: number, blockId: string, instruction: string): Promise<void>
  /**
   * Rewrite every written Block in a Chapter, in order, under one standing instruction. Each Block
   * keeps its own correction chain and the note rides on top. Nothing is destroyed: each pass
   * appends a swipe. Runs one Block at a time so each sees the previous one's new prose.
   */
  rewriteChapter(chapterId: number, note: string): Promise<void>
  /** Rewrite a Chapter's summary from the prose it actually holds. The recap the prompt sends
   *  matches what got written rather than what was planned. Replaces whatever is there. */
  summarizeChapter(chapterId: number): Promise<void>
  /** Select one of a Block's alternates. */
  swipeBlock(chapterId: number, blockId: string, index: number): Promise<void>
  /** Drop the selected alternate. The last one left empties the Block rather than deleting it. */
  deleteSwipe(chapterId: number, blockId: string): Promise<void>
  stop(): void
  dismissError(): void
}

async function save(story: Story): Promise<number> {
  const now = Date.now()
  const record = { ...story, createdAt: story.createdAt || now, updatedAt: now }
  return storage.put('stories', record as unknown as StoredRecord)
}

/** Write the Chapters' `order` to match their array position, and put the array in state. Every
 *  structural change (add, delete, move) goes through here so order and array never disagree. */
async function persistOrder(
  chapters: Chapter[],
  set: (partial: Partial<WriteState>) => void,
): Promise<Chapter[]> {
  const ordered: Chapter[] = []
  for (const [i, c] of chapters.entries()) {
    if (c.order === i) {
      ordered.push(c)
      continue
    }
    const moved = { ...c, order: i }
    await storage.put('chapters', moved as unknown as StoredRecord)
    ordered.push(moved)
  }
  set({ chapters: ordered })
  return ordered
}

/** The connection an outline request goes out on, with the Story's own sampler overrides. */
function outlineConnection(story: Story) {
  const base = activeConnection()
  if (!base) throw new Error('No active connection - pick one in Settings.')
  return resolveParams(base, undefined, story)
}

/**
 * The half both outline generators share: hold the streaming flag, send, collect the reply.
 *
 * Nothing renders this as it arrives: there is no `streamingBlockId`. It lands as Chapters or
 * beats once it is done. The flag is the one `writeBlock` holds. Stop works and neither can
 * start while the other runs.
 */
async function runOutline(
  set: (partial: Partial<WriteState>) => void,
  story: Story,
  connection: ReturnType<typeof resolveParams>,
  messagesFor: (prompts: Record<string, string> | undefined) => Parameters<typeof sendMessage>[0],
): Promise<{ text: string; finishReason: string }> {
  const controller = new AbortController()
  abort = controller
  set({ streaming: true, streamingStoryId: story.id ?? null, error: '' })

  let text = ''
  let finishReason = ''
  try {
    const stack = await useStacks.getState().ensureActive('story')
    // An outline for a long Story runs well past a 512-token default, and an object cut off halfway
    // parses as nothing at all. This request gets its own floor, like generatePalette.
    const wide = withParam(connection, 'max_tokens', Math.max(maxTokensOf(connection), 2000))
    for await (const chunk of sendMessage(messagesFor(stack.miscPrompts), wide, controller.signal)) {
      if (chunk.content) text += chunk.content
      if (chunk.finishReason) finishReason = chunk.finishReason
    }
  } catch (err) {
    set({ streaming: false, streamingStoryId: null })
    abort = null
    if (controller.signal.aborted) return { text: '', finishReason: 'aborted' }
    throw err
  }
  abort = null
  return { text, finishReason }
}


/** A parse failure, or the token limit that actually caused it. A truncation looks like a parse error
 *  otherwise, which points at the reply instead of at the limit that cut it. Clears the streaming
 *  flag on the way out: the run is over either way, and the dialog stays open on the message. */
function outlineError(
  set: (partial: Partial<WriteState>) => void,
  err: unknown,
  finishReason: string,
  connection: ReturnType<typeof resolveParams>,
  remedy: string,
): Error {
  set({ streaming: false, streamingStoryId: null })
  if (finishReason !== 'length') return err as Error
  return new Error(
    `The reply was cut off at the ${maxTokensOf(connection)} token limit before the outline ended. Raise Max tokens in the connection, or ${remedy}.`,
  )
}

export const useWrite = create<WriteState>()((set, get) => ({
  stories: [],
  loading: false,
  story: null,
  chapters: [],
  activeChapterId: null,
  revs: {},
  streaming: false,
  streamingStoryId: null,
  streamingText: '',
  streamingReasoning: '',
  streamingBlockId: null,
  streamingReplaces: false,
  rewriting: null,
  error: '',
  activeBlockId: null,
  pendingCaret: null,
  styling: true,
  collapsedBeats: [],
  worldInfo: emptyWorldInfo,

  toggleStyling: () => set((s) => ({ styling: !s.styling })),

  setCollapsedBeats: (ids) => set({ collapsedBeats: ids }),

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
      if (entries.length)
        resolved = resolveWorldInfo(entries, scan, new Map(books.map((b) => [b.id!, b])), budget)
    }
    // The Story may have closed or changed while the reads were in flight.
    if (get().story?.id === story.id) set({ worldInfo: resolved })
    return resolved
  },

  setDirection: async (text) => {
    const story = get().story
    if (!story || story.direction === text) return
    const next = { ...story, direction: text, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  load: async () => {
    set({ loading: true })
    const rows = (await storage.getAll('stories')) as unknown as Story[]
    rows.sort((a, b) => b.updatedAt - a.updatedAt)
    set({ stories: rows, loading: false })
  },

  create: async (title) => {
    const storyId = await save(newStory(title))
    await storage.put('chapters', newChapter(storyId, 0, 'Chapter 1') as unknown as StoredRecord)
    await get().load()
    return storyId
  },

  rename: async (id, title) => {
    // Renaming happens from the shelf and from the editor's title, where the shelf list may not
    // have been loaded yet, fall back to the open Story.
    const open = get().story
    const story = get().stories.find((s) => s.id === id) ?? (open?.id === id ? open : undefined)
    if (!story) return
    const next = { ...story, title }
    await save(next)
    if (open?.id === id) set({ story: next })
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
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    chapters.sort((a, b) => a.order - b.order)
    // Drop the ids: storage assigns new ones. createdAt/updatedAt are set by save().
    const { id: _storyId, ...rest } = story
    const copyId = await save({ ...rest, title: `${story.title} copy`, createdAt: 0, updatedAt: 0 })
    const now = Date.now()
    for (const c of chapters) {
      const { id: _chapterId, ...chapterRest } = c
      await storage.put('chapters', {
        ...chapterRest,
        storyId: copyId,
        createdAt: now,
        updatedAt: now,
      } as unknown as StoredRecord)
    }
    await get().load()
    return copyId
  },

  remove: async (id) => {
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    for (const c of chapters) await storage.remove('chapters', c.id!)
    await storage.remove('stories', id)
    await get().load()
  },

  openStory: async (id) => {
    const story = (await storage.get('stories', id)) as unknown as Story | undefined
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    chapters.sort((a, b) => a.order - b.order)
    // The cast picker and generation both read these from state.
    await Promise.all([useCharacters.getState().load(), usePersonas.getState().load()])
    const revs: Record<string, number> = {}
    for (const c of chapters) for (const b of c.blocks) revs[b.id] = (get().revs[b.id] ?? 0) + 1
    set({
      story: story ?? null,
      chapters,
      activeChapterId: chapters.at(-1)?.id ?? null,
      revs,
      error: '',
      // Session state, and this is a different document's prose.
      activeBlockId: null,
      pendingCaret: null,
      // Kept when you come back to a Story that is still generating: the tail picks up mid-flight.
      streamingText: get().streamingStoryId === id ? get().streamingText : '',
    })
  },

  chaptersOf: async (id) => {
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    return chapters.sort((a, b) => a.order - b.order)
  },

  wordCount: async (id) => {
    const chapters = (await storage.find('chapters', 'storyId', id)) as unknown as Chapter[]
    let words = 0
    for (const c of chapters) words += chapterProse(c).split(/\s+/).filter(Boolean).length
    return words
  },

  closeStory: () =>
    set({ story: null, chapters: [], activeChapterId: null, activeBlockId: null, pendingCaret: null }),

  setParamOverrides: async (paramOverrides) => {
    const story = get().story
    if (!story) return
    // No updatedAt bump: sampler settings aren't an edit to the prose, same rule as storyWidth.
    const next = { ...story, paramOverrides }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setStoryWidth: async (width) => {
    const story = get().story
    if (!story) return
    // No updatedAt bump: how wide the prose is drawn isn't an edit to the Story.
    const next = { ...story, storyWidth: Math.min(100, Math.max(1, width || 100)) }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setPremise: async (text) => {
    const story = get().story
    if (!story || (story.premise ?? '') === text) return
    const next = { ...story, premise: text, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setEnding: async (text) => {
    const story = get().story
    if (!story || (story.ending ?? '') === text) return
    const next = { ...story, ending: text, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setCapsCollapsed: async (capsCollapsed) => {
    const story = get().story
    if (!story) return
    // No updatedAt bump: how the caps are drawn isn't an edit to the Story, same rule as storyWidth.
    const next = { ...story, capsCollapsed }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  addChapter: async (title) => {
    const story = get().story
    if (!story) return
    const chapters = get().chapters
    const chapter = newChapter(story.id!, chapters.length, title || `Chapter ${chapters.length + 1}`)
    const id = await storage.put('chapters', chapter as unknown as StoredRecord)
    await persistOrder([...chapters, { ...chapter, id }], set)
    // A new Chapter is where the Author is about to work. It takes the cursor.
    set({ activeChapterId: id })
    await touchStory(get, set)
  },

  updateChapter: async (id, patch) => {
    const chapter = get().chapters.find((c) => c.id === id)
    if (!chapter) return
    const next = { ...chapter, ...patch, updatedAt: Date.now() }
    await storage.put('chapters', next as unknown as StoredRecord)
    set((s) => ({ chapters: s.chapters.map((c) => (c.id === id ? next : c)) }))
    await touchStory(get, set)
  },

  removeChapter: async (id) => {
    const chapters = get().chapters
    // A Story is a list of Chapters starting at one: the last one can't be deleted.
    if (chapters.length <= 1) return
    await storage.remove('chapters', id)
    const left = await persistOrder(chapters.filter((c) => c.id !== id), set)
    if (get().activeChapterId === id) set({ activeChapterId: left.at(-1)?.id ?? null, activeBlockId: null })
    await touchStory(get, set)
  },

  moveChapter: async (id, delta) => {
    const chapters = [...get().chapters]
    const from = chapters.findIndex((c) => c.id === id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= chapters.length) return
    const [moved] = chapters.splice(from, 1)
    chapters.splice(to, 0, moved)
    await persistOrder(chapters, set)
    await touchStory(get, set)
  },

  setActiveChapter: (id) => {
    if (get().activeChapterId !== id) set({ activeChapterId: id })
  },

  setActiveBlock: (chapterId, blockId) => {
    const s = get()
    if (s.activeChapterId !== chapterId || s.activeBlockId !== blockId)
      set({ activeChapterId: chapterId, activeBlockId: blockId })
  },

  saveBlockText: async (chapterId, blockId, content) => {
    // No rev bump: this comes from the editor's own DOM, resyncing would clobber the caret.
    await writeBlockContent(get, set, chapterId, blockId, content, false)
  },

  setBlockText: async (chapterId, blockId, content) => {
    await writeBlockContent(get, set, chapterId, blockId, content, true)
  },

  setCast: async (cast) => {
    const story = get().story
    if (!story) return
    const next = { ...story, cast, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  setStoryFields: async (patch) => {
    const story = get().story
    if (!story) return
    const next = { ...story, ...patch, updatedAt: Date.now() }
    await storage.put('stories', next as unknown as StoredRecord)
    set({ story: next })
  },

  generateStoryOutline: async (req) => {
    const { story, chapters, streaming } = get()
    if (!story || streaming) return
    const connection = outlineConnection(story)
    const reply = await runOutline(set, story, connection, (prompts) =>
      buildStoryOutlineMessages(req, prompts),
    )
    if (reply.finishReason === 'aborted') return

    let outline
    try {
      outline = parseStoryOutlineReply(reply.text)
    } catch (err) {
      throw outlineError(set, err, reply.finishReason, connection, 'ask for fewer chapters')
    }

    // Past here the reply is good. The Story's existing plan can go. Nothing before this point
    // has written anything.
    for (const chapter of chapters) {
      if (chapter.id !== undefined) await storage.remove('chapters', chapter.id)
    }

    // The work's word target is divided across chapters by their weights, the same rule beats
    // follow inside a chapter. An unset total leaves every chapter target at 0.
    const targets = splitByWeight(req.targetWords, outline.map((c) => c.weight))

    const written: Chapter[] = []
    for (const [i, entry] of outline.entries()) {
      const chapter: Chapter = {
        ...newChapter(story.id!, i, entry.title || `Chapter ${i + 1}`),
        summary: outline[i].summary,
        targetWords: targets[i],
      }
      const id = await storage.put('chapters', chapter as unknown as StoredRecord)
      written.push({ ...chapter, id })
    }

    // persistOrder puts the array in state. The orders already match, so it writes nothing again.
    await persistOrder(written, set)
    set({
      streaming: false,
      streamingStoryId: null,
      activeChapterId: written[0]?.id ?? null,
      activeBlockId: null,
    })
    await touchStory(get, set)
  },

  generateChapterOutline: async (chapterId, req) => {
    const { story, chapters, streaming } = get()
    const chapter = chapters.find((c) => c.id === chapterId)
    if (!story || !chapter || streaming) return
    const connection = outlineConnection(story)
    const reply = await runOutline(set, story, connection, (prompts) =>
      buildChapterOutlineMessages(req, prompts),
    )
    if (reply.finishReason === 'aborted') return

    let beats
    try {
      beats = parseChapterOutlineReply(reply.text)
    } catch (err) {
      throw outlineError(set, err, reply.finishReason, connection, 'ask for fewer beats')
    }

    // The beats replace the Chapter's own, and the prose in them goes: the caller confirmed that.
    // Nothing else about the Chapter is touched. Its title, summary and target all survive.
    const blocks = beats.map((b) => newBlock(b.beat, b.weight))
    const next = { ...chapter, blocks, targetWords: req.targetWords, updatedAt: Date.now() }
    await storage.put('chapters', next as unknown as StoredRecord)

    const revs = { ...get().revs }
    for (const b of blocks) revs[b.id] = (revs[b.id] ?? 0) + 1
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === chapterId ? next : c)),
      revs,
      streaming: false,
      streamingStoryId: null,
      activeChapterId: chapterId,
      activeBlockId: null,
    }))
    await touchStory(get, set)
  },

  writeBlock: async (chapterId, blockId, direction, replaces, instruction) => {
    const { story, chapters, streaming } = get()
    if (!story || streaming) return
    const chapter = chapters.find((c) => c.id === chapterId)
    const block = chapter?.blocks.find((b) => b.id === blockId)
    if (!chapter || !block) return
    const base = activeConnection()
    if (!base) {
      set({ error: 'No active connection - pick one in Settings.' })
      return
    }
    // story > connection. The cast contributes nothing: several characters, no non-arbitrary winner.
    const connection = resolveParams(base, undefined, story)
    // The Direction box is the Story's standing instruction: read on every generation, never
    // cleared. The beat is not folded in - the stack places it with {{beat}}.
    const sent = direction ?? story.direction

    const controller = new AbortController()
    abort = controller
    // A Block is where this is going, so it takes the cursor.
    set({
      activeChapterId: chapterId,
      activeBlockId: blockId,
      streaming: true,
      streamingStoryId: story.id ?? null,
      streamingBlockId: blockId,
      streamingText: '',
          streamingReasoning: '',
      streamingReplaces: !!replaces,
      error: '',
    })

    let text = ''
    let reasoning = ''
    let finishReason = ''
    try {
      const stack = await useStacks.getState().ensureActive('story')
      await loadTokenizer(tokenizerFor(connection))
      const current = get().chapters
      // The one thing the per-Block context setting does: blank one side of the prose or the other.
      const fit = storyFit(current, chapterId, blockId, block.context)
      // Matched against the prose the caret sits after, plus what the passage was asked to be:
      // a key named only in the beat should still fire.
      const world = await get().refreshWorldInfo(
        storyScanText(fit.storyText, [sent, block.beat]),
        stack.worldInfoBudget,
      )
      const budget = {
        contextLimit: connection.contextLimit,
        maxTokens: maxTokensOf(connection),
        safetyMarginPct: connection.safetyMarginPct,
      }
      const prompt = buildStoryPrompt(
        {
          stack,
          castText: castText(resolveCast(story.cast)),
          tokens: storyTokens({
            title: story.title,
            premise: story.premise ?? '',
            ending: story.ending ?? '',
            themes: story.themes ?? '',
            castNames: resolveCast(story.cast).map((m) => m.name),
            chapters: current,
            chapterId,
            blockId,
          }),
          ...fit,
          worldInfo: { before: world.before, after: world.after },
          direction: sent,
        },
        budget,
      )
      for await (const chunk of sendMessage(prompt.messages, connection, controller.signal)) {
        if (chunk.content) {
          text += chunk.content
          set({ streamingText: text })
        }
        if (chunk.reasoning) {
          reasoning += chunk.reasoning
          set({ streamingReasoning: reasoning })
        }
        if (chunk.finishReason) finishReason = chunk.finishReason
      }
    } catch (err) {
      // Write rule: keep whatever streamed (same as Stop) and surface a toast. Nothing rolls back.
      if (!controller.signal.aborted) {
        await commitSwipe(get, set, chapterId, blockId, text, reasoning, instruction)
        set({
          streaming: false,
          streamingStoryId: null,
          streamingBlockId: null,
          streamingText: '',
                  streamingReasoning: '',
          streamingReplaces: false,
          error: (err as Error).message,
        })
        abort = null
        return
      }
    } finally {
      abort = null
    }

    await commitSwipe(get, set, chapterId, blockId, text, reasoning, instruction)
    set({
      streaming: false,
      streamingStoryId: null,
      streamingBlockId: null,
      streamingText: '',
          streamingReasoning: '',
      streamingReplaces: false,
      // The text is kept either way; this only says why it ended where it did.
      error:
        finishReason === 'length'
          ? `Response stopped at the ${maxTokensOf(connection)} token limit. Raise Max tokens in the connection.`
          : '',
    })
  },

  regenBlock: async (chapterId, blockId, instruction) => {
    const block = get()
      .chapters.find((c) => c.id === chapterId)
      ?.blocks.find((b) => b.id === blockId)
    if (!block || !instruction.trim()) return
    // The chat's re-roll wording, unchanged: quote what it said, then the instruction. An empty
    // Block has nothing to rewrite. The instruction steers a first draft instead. Either way the
    // beat still arrives through {{beat}} and is not repeated here.
    // The Story stack's own override, if it set one: `writeBlock` resolves the same stack again to
    // build the prompt, and both halves of this request read the same row.
    const stack = await useStacks.getState().ensureActive('story')
    await get().writeBlock(
      chapterId,
      blockId,
      block.content.trim()
        ? rewritePrompt(block.content, chainedInstruction(block, instruction), stack.miscPrompts)
        : chainedInstruction(block, instruction),
      true,
      instruction.trim(),
    )
  },

  rewriteChapter: async (chapterId, note) => {
    const chapter = get().chapters.find((c) => c.id === chapterId)
    if (!chapter || get().streaming || !note.trim()) return
    // The list is taken once, before anything runs. The Blocks are replaced as each pass commits:
    // holding the records would rewrite stale prose. Ids survive and are what is held.
    const ids = chapter.blocks.filter((b) => b.content.trim()).map((b) => b.id)
    if (!ids.length) return
    const stack = await useStacks.getState().ensureActive('story')
    rewriteStopped = false

    for (let i = 0; i < ids.length; i++) {
      set({ rewriting: { done: i, total: ids.length } })
      const block = get()
        .chapters.find((c) => c.id === chapterId)
        ?.blocks.find((b) => b.id === ids[i])
      if (!block || !block.content.trim()) continue
      await get().writeBlock(
        chapterId,
        ids[i],
        rewritePrompt(block.content, chainedInstruction(block, note), stack.miscPrompts),
        true,
        note.trim(),
      )
      // Stop and a failed request both land here. Either way the run is over: carrying on would
      // rewrite the rest of the chapter against prose the Author just tried to stop changing.
      if (get().error || rewriteStopped) break
    }
    set({ rewriting: null })
  },

  summarizeChapter: async (chapterId) => {
    const { story, chapters, streaming } = get()
    const chapter = chapters.find((c) => c.id === chapterId)
    if (!story || !chapter || streaming) return
    const connection = outlineConnection(story)
    await loadTokenizer(tokenizerFor(connection))

    // Newest prose wins the room. A recap needs the whole chapter, but a chapter can run past the
    // window, and the end is what a recap has to land on.
    const written = chapter.blocks.filter((b) => b.content.trim())
    const room = Math.floor(
      (connection.contextLimit - maxTokensOf(connection)) *
        (1 - connection.safetyMarginPct / 100),
    )
    const kept: string[] = []
    let used = 0
    for (let i = written.length - 1; i >= 0; i--) {
      const text = written[i].content.trim()
      used += countTokens(text) + perMessageOverhead
      if (used > room && kept.length) break
      kept.unshift(text)
    }

    const req: ChapterSummaryRequest = {
      chapterNumber: chapter.order + 1,
      title: chapter.title,
      prose: kept.join('\n\n'),
      unwritten: chapter.blocks.filter((b) => !b.content.trim() && b.beat.trim()).map((b) => b.beat.trim()),
    }
    const reply = await runOutline(set, story, connection, (prompts) =>
      buildChapterSummaryMessages(req, prompts),
    )
    if (reply.finishReason === 'aborted') return

    const summary = reply.text.trim()
    if (!summary) {
      set({ streaming: false, streamingStoryId: null, error: 'The reply held no summary.' })
      return
    }
    const next = { ...chapter, summary, updatedAt: Date.now() }
    await storage.put('chapters', next as unknown as StoredRecord)
    set((s) => ({
      chapters: s.chapters.map((c) => (c.id === chapterId ? next : c)),
      streaming: false,
      streamingStoryId: null,
    }))
    await touchStory(get, set)
  },

  swipeBlock: async (chapterId, blockId, index) => {
    const block = get()
      .chapters.find((c) => c.id === chapterId)
      ?.blocks.find((b) => b.id === blockId)
    if (!block) return
    const next = selectSwipe(block, index)
    if (next.content === block.content && next.swipeIndex === block.swipeIndex) return
    await putBlock(get, set, chapterId, next, true)
  },

  deleteSwipe: async (chapterId, blockId) => {
    const block = get()
      .chapters.find((c) => c.id === chapterId)
      ?.blocks.find((b) => b.id === blockId)
    if (!block) return
    // Unlike chat, the Block is part of the plan - dropping its last version leaves an empty beat,
    // and Delete Beat is the separate, confirmed action.
    const next = deletedSwipes(block, [swipeIndex(block)]) ?? {
      ...block,
      swipes: undefined,
      swipeIndex: undefined,
      requestSnapshots: undefined,
      reasonings: undefined,
      instructions: undefined,
      content: '',
    }
    await putBlock(get, set, chapterId, next, true)
  },

  // Stop ends the chapter rewrite too, not only the request in flight. An abort leaves the partial
  // as a swipe and clears `error`. The loop has no other way to tell it was stopped on purpose.
  stop: () => {
    rewriteStopped = true
    abort?.abort()
  },

  dismissError: () => set({ error: '' }),
}))

/** Write one Block back onto its Chapter and persist. `resync` bumps the Block's rev, which makes
 *  its region rebuild its DOM - right for anything that didn't come from the region itself, wrong
 *  for typing, which would lose the caret. */
async function putBlock(
  get: () => WriteState,
  set: (partial: Partial<WriteState> | ((s: WriteState) => Partial<WriteState>)) => void,
  chapterId: number,
  block: Block,
  resync: boolean,
) {
  // Storage, not state: leaving the Story mid-generation clears `chapters`, and the reply still has
  // to land. The in-memory patch below is then a no-op, and openStory() reloads it on the way back.
  const chapter =
    get().chapters.find((c) => c.id === chapterId) ??
    ((await storage.get('chapters', chapterId)) as unknown as Chapter | undefined)
  if (!chapter) return
  const next = {
    ...chapter,
    blocks: chapter.blocks.map((b) => (b.id === block.id ? block : b)),
    updatedAt: Date.now(),
  }
  await storage.put('chapters', next as unknown as StoredRecord)
  set((s) => ({
    chapters: s.chapters.map((c) => (c.id === chapterId ? next : c)),
    ...(resync
      ? {
          revs: { ...s.revs, [block.id]: (s.revs[block.id] ?? 0) + 1 },
          // A rebuild would otherwise leave the caret at the start; typing carries on at the end.
          pendingCaret: { blockId: block.id, offset: block.content.length },
        }
      : null),
  }))
  await touchStory(get, set)
}

/** Typing, or a wholesale replace. The edit lands on the selected swipe as well as on `content`,
 *  so swiping away and back doesn't quietly discard it - the same rule chat follows. */
async function writeBlockContent(
  get: () => WriteState,
  set: (partial: Partial<WriteState> | ((s: WriteState) => Partial<WriteState>)) => void,
  chapterId: number,
  blockId: string,
  content: string,
  resync: boolean,
) {
  const block = get()
    .chapters.find((c) => c.id === chapterId)
    ?.blocks.find((b) => b.id === blockId)
  if (!block || block.content === content) return
  const swipes = block.swipes?.length
    ? block.swipes.map((t, i) => (i === (block.swipeIndex ?? 0) ? content : t))
    : undefined
  await putBlock(get, set, chapterId, { ...block, content, swipes }, resync)
}

/**
 * A finished generation: the text becomes a new swipe on the Block and the selected one. Nothing is
 * spliced and no offsets are recorded - swiping back is what Undo used to be. It survives a
 * reload for free: the alternates are stored.
 */
/**
 * Every correction that led to the selected swipe, plus the one just typed, as one instruction.
 * Numbered when there is more than one: the model sees them as a list rather than a paragraph
 * of contradictions. This is what makes a re-roll iterate: round three does not have to re-explain
 * what rounds one and two already asked for.
 */
function chainedInstruction(block: Block, instruction: string): string {
  const chain = [...instructionChain(block), instruction.trim()]
  if (chain.length === 1) return chain[0]
  return chain.map((c, i) => `${i + 1}. ${c}`).join('\n')
}

async function commitSwipe(
  get: () => WriteState,
  set: (partial: Partial<WriteState> | ((s: WriteState) => Partial<WriteState>)) => void,
  chapterId: number,
  blockId: string,
  added: string,
  reasoning?: string,
  instruction?: string,
) {
  if (!added.trim()) return
  const chapter =
    get().chapters.find((c) => c.id === chapterId) ??
    ((await storage.get('chapters', chapterId)) as unknown as Chapter | undefined)
  const block = chapter?.blocks.find((b) => b.id === blockId)
  if (!block) return
  const next = regenerated(block, added.trim(), undefined, reasoning, instruction)
  if (next) await putBlock(get, set, chapterId, next, true)
}
