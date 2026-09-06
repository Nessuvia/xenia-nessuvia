import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { PromptBlock, PromptStack } from '../storage/types'
import { useSettings } from './settingsStore'
// core reaching into a module, same as charactersStore, the stack file parser and the
// bundled file both live with the prompts module.
import { parseStack } from '../../modules/prompts/stackFile'
import storyStackFile from '../../modules/prompts/defaultStoryStack.json'

export function newBlock(partial: Partial<PromptBlock> = {}): PromptBlock {
  return {
    id: crypto.randomUUID(),
    label: 'Block',
    source: 'text',
    role: 'system',
    content: '',
    ...partial,
  }
}

/** Three blocks, not six: on real cards personality/scenario/examples are usually blank. */
export function defaultStack(name = 'Default'): PromptStack {
  return {
    ownerId: currentOwnerId(),
    name,
    kind: 'chat',
    active: [
      newBlock({
        label: 'Main prompt',
        content: "Write {{char}}'s next reply in this fictional roleplay.",
      }),
      newBlock({ label: 'Character description', source: 'characterDescription' }),
      newBlock({ label: 'Chat History', source: 'chatHistory' }),
    ],
  }
}

/**
 * A chat stack for a hosted session. The first two blocks branch on `[if Narrator]`, so one stack
 * covers two kinds of turn: the Narrator is told to write as a third party and gets the whole cast,
 * while a character is told to write as itself and gets only its own description.
 *
 * This stack is the *only* source of the Narrator's instructions, the Narrator is a speaker with a
 * name and no card, so anything not written here is not sent. Editing this text is how the Narrator
 * is changed.
 *
 * The Narrator branch uses the slot tokens rather than the bound `characterDescription`, which only
 * ever holds the speaker. A slot with no character resolves to '' on both tokens, so the empty
 * slots contribute nothing but a blank line. `{{personas}}` is the people in the room, which no
 * character token covers.
 */
export function defaultMultiplayerStack(name = 'Multiplayer'): PromptStack {
  return {
    ownerId: currentOwnerId(),
    name,
    kind: 'chat',
    active: [
      newBlock({
        label: 'Main prompt',
        content: [
          'This is a group roleplay between the characters below.',
          '[if Narrator]',
          'You are the Narrator. You describe the scene, the world, and the characters in it,',
          'including the player characters. You do not play a single character. Write in third',
          'person, present tense.',
          '[else]',
          'Write the next reply as {{char}} and no one else.',
          '[endif]',
        ].join('\n'),
      }),
      newBlock({
        label: 'Characters',
        content: [
          '[if Narrator]',
          '{{char1}}\n{{char1Desc}}',
          '{{char2}}\n{{char2Desc}}',
          '{{char3}}\n{{char3Desc}}',
          '{{char4}}\n{{char4Desc}}',
          '[else]',
          '{{charDescription}}',
          '[endif]',
        ].join('\n'),
      }),
      newBlock({ label: 'People in the room', content: '{{personas}}' }),
      newBlock({ label: 'Chat History', source: 'chatHistory' }),
    ],
  }
}

/**
 * The stack a game runs on. Kind stays 'chat': a game turn is a user message and an assistant
 * reply like any other, so nothing needs a new stack kind.
 *
 * The sentence cap is load-bearing. A game is 20 to 40 calls and the board has to keep moving, so
 * the shipped default makes the character terse. Anyone who wants monologues edits the stack.
 */
export function defaultGameStack(name = 'Game'): PromptStack {
  return {
    ownerId: currentOwnerId(),
    name,
    kind: 'chat',
    active: [
      newBlock({
        label: 'Main prompt',
        // {{game}} is the game's title, filled by the games module. One stack covers every game,
        // so the per-game half is a branch: [if blackjack] and [if goFish] are the game's own
        // `kind`, set by the games module and false everywhere else.
        content: [
          [
            'You are playing {{game}} against {{user}}. React to the move that just happened as',
            '{{char}}. Reply in one to three sentences. Do not decide moves, and do not mention',
            'cards you were not told about.',
          ].join(' '),
          '[if blackjack]',
          [
            'You are the dealer. The gameState block is the table as it stands and the round it',
            'belongs to. Read the result off it: a hand is marked bust or blackjack, and a settled',
            'round says who took it. Never say a hand went bust unless that hand is marked bust, and',
            'do not take a result from an earlier round in the history.',
          ].join(' '),
          '[endif]',
          '[if goFish]',
          [
            'The gameState block is your hand, both sets of books and whose turn it is. Their hand is',
            'not in it, so anything you say about what they hold is a guess.',
          ].join(' '),
          '[endif]',
        ].join('\n'),
      }),
      newBlock({ label: 'Character description', source: 'characterDescription' }),
      newBlock({ label: 'Persona description', source: 'personaDescription' }),
      // The game's own note, set in the rail beside the board. Depth 2 puts it two moves from the
      // end, near enough to steer the reply; move or drop the block to change that.
      newBlock({ label: "Author's note", source: 'authorNote', depth: 2 }),
      newBlock({ label: 'Chat History', source: 'chatHistory' }),
    ],
  }
}

/** The Story stack that ships with the build, kept as an exported stack file rather than code so
 *  editing it is an export/replace instead of a diff. Same parser as a user import, so it gets
 *  fresh block ids every time. */
export function defaultStoryStack(name = 'Story'): PromptStack {
  return { ...parseStack(JSON.stringify(storyStackFile)), name }
}

/** A stack that ships with the build. Seeding uses two of these; the Bundled picker lists them all,
 *  so a deleted one can be added back. */
export interface BundledStack {
  key: string
  name: string
  kind: 'chat' | 'story'
  /** Only listed while the multiplayer module is on. */
  multiplayer?: boolean
  make(name: string): PromptStack
}

export const bundledStacks: BundledStack[] = [
  { key: 'default', name: 'Default', kind: 'chat', make: defaultStack },
  {
    key: 'multiplayer',
    name: 'Multiplayer',
    kind: 'chat',
    multiplayer: true,
    make: defaultMultiplayerStack,
  },
  { key: 'game', name: 'Game', kind: 'chat', make: defaultGameStack },
  { key: 'story', name: 'Story', kind: 'story', make: defaultStoryStack },
]

const stackKind = (s: PromptStack): 'chat' | 'story' => s.kind ?? 'chat'

/** Legacy `inactive` pool → disabled blocks at the end of the active list. */
function foldInactive(stack: PromptStack): PromptStack {
  const parked = (stack as { inactive?: PromptBlock[] }).inactive
  if (!parked?.length) return stack
  const { inactive: _drop, ...rest } = stack as PromptStack & { inactive?: PromptBlock[] }
  return { ...rest, active: [...stack.active, ...parked.map((b) => ({ ...b, disabled: true }))] }
}

function setActiveId(kind: 'chat' | 'story', id: number | null) {
  useSettings.setState(kind === 'story' ? { activeStoryStackId: id } : { activeStackId: id })
}

function activeIdFor(kind: 'chat' | 'story'): number | null {
  const s = useSettings.getState()
  return kind === 'story' ? s.activeStoryStackId : s.activeStackId
}

interface StacksState {
  stacks: PromptStack[]
  load(): Promise<void>
  save(stack: PromptStack): Promise<number>
  /** `preset` picks the starting blocks; without it a chat stack gets `defaultStack`. */
  create(kind?: 'chat' | 'story', preset?: 'multiplayer' | 'game'): Promise<number>
  duplicate(id: number): Promise<number>
  /** Add a copy of a bundled stack as a new row. */
  addBundled(key: string): Promise<void>
  remove(id: number): Promise<void>
  /** The active stack of a kind, creating its default one on first use rather than erroring. */
  ensureActive(kind?: 'chat' | 'story'): Promise<PromptStack>
}

export const useStacks = create<StacksState>()((set, get) => ({
  stacks: [],

  load: async () => {
    // One chat stack and one Story stack, seeded on first run as ordinary rows: editable, and once
    // deleted they stay gone. The flag is what makes a delete stick. Same contract as the bundled
    // palettes and samplers.
    if (!useSettings.getState().seededStacks) {
      useSettings.getState().markStacksSeeded()
      const chatId = await storage.put('promptStacks', defaultStack() as unknown as StoredRecord)
      const storyId = await storage.put('promptStacks', defaultStoryStack() as unknown as StoredRecord)
      setActiveId('chat', chatId)
      setActiveId('story', storyId)
    }
    const rows = (await storage.getAll('promptStacks')) as unknown as PromptStack[]
    // Rows written while the Inactive pool existed still carry one. Its blocks come back as
    // disabled active blocks so nothing parked there disappears. Drop this once such rows are gone.
    set({ stacks: rows.map(foldInactive) })
  },

  save: async (stack) => {
    const id = await storage.put('promptStacks', stack as unknown as StoredRecord)
    await get().load()
    return id
  },

  create: async (kind = 'chat', preset) => {
    const count = get().stacks.filter((s) => stackKind(s) === kind).length + 1
    const taken = (name: string) => get().stacks.some((s) => s.name === name)
    const stack =
      preset === 'multiplayer'
        ? defaultMultiplayerStack(taken('Multiplayer') ? `Multiplayer ${count}` : 'Multiplayer')
        : preset === 'game'
          ? defaultGameStack(taken('Game') ? `Game ${count}` : 'Game')
          : kind === 'story'
            ? defaultStoryStack(`Story ${count}`)
            : defaultStack(`Stack ${count}`)
    const id = await get().save(stack)
    setActiveId(kind, id)
    return id
  },

  duplicate: async (id) => {
    const source = get().stacks.find((s) => s.id === id)
    if (!source) return id
    const copy: PromptStack = {
      ownerId: currentOwnerId(),
      name: `${source.name} copy`,
      kind: stackKind(source),
      // Fresh ids: two stacks must never share a block identity while dragging.
      active: source.active.map((b) => ({ ...b, id: crypto.randomUUID() })),
    }
    const newId = await get().save(copy)
    setActiveId(stackKind(source), newId)
    return newId
  },

  addBundled: async (key) => {
    const entry = bundledStacks.find((b) => b.key === key)
    if (!entry) return
    // Adding, not restoring: an existing copy stays as it is and the new row takes a numbered name.
    const taken = (name: string) => get().stacks.some((s) => s.name === name)
    let name = entry.name
    for (let n = 2; taken(name); n++) name = `${entry.name} ${n}`
    const id = await get().save(entry.make(name))
    setActiveId(entry.kind, id)
  },

  remove: async (id) => {
    const kind = stackKind(get().stacks.find((s) => s.id === id) ?? { kind: 'chat' } as PromptStack)
    await storage.remove('promptStacks', id)
    await get().load()
    if (activeIdFor(kind) === id) {
      setActiveId(kind, get().stacks.find((s) => stackKind(s) === kind)?.id ?? null)
    }
  },

  ensureActive: async (kind = 'chat') => {
    await get().load()
    const activeId = activeIdFor(kind)
    const ofKind = get().stacks.filter((s) => stackKind(s) === kind)
    const existing = ofKind.find((s) => s.id === activeId) ?? ofKind[0]
    if (existing) {
      if (existing.id !== activeId) setActiveId(kind, existing.id!)
      return existing
    }
    const id = await get().create(kind)
    return get().stacks.find((s) => s.id === id)!
  },
}))
