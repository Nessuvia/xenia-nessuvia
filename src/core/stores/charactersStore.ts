import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { Character } from '../storage/types'
import { emptyColors } from '../storage/types'
// core reaching into a module, because the card parser and the bundled folder both live
// there. Move importCard into core if a second core caller ever wants it.
import { bundledCharacters, bundledLorebooks } from '../../modules/characters/bundledCharacters'
import { importBook, importCard } from '../../modules/characters/importCard'
import { useLorebooks } from './lorebooksStore'
import { useSettings } from './settingsStore'

export function newCharacter(): Character {
  return {
    ownerId: currentOwnerId(),
    name: '',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    exampleDialogue: '',
    altDescriptions: [],
    activeDescriptionIndex: -1,
    alternateGreetings: [],
    greetingTitles: [],
    gallery: [],
    tags: [],
    systemPrompt: '',
    postHistoryInstructions: '',
    creatorNotes: '',
    creator: '',
    characterVersion: '',
    createdAt: 0,
    updatedAt: 0,
    colors: emptyColors(),
  }
}

/**
 * The card's `character_book` as a Lorebook row, or nothing when it carried none. Returned as a
 * list because that is the shape `Character.lorebookIds` wants; a card only ever has one book.
 */
async function importedBookIds(json: unknown): Promise<number[]> {
  const imported = importBook(json)
  if (!imported.entries.length) return []
  return [await useLorebooks.getState().create(imported)]
}

/** Name for the UI (lists, character page, chats). {{char}} and the API payload use `name`. */
export function displayName(c: Pick<Character, 'name' | 'displayName'>): string {
  return c.displayName?.trim() || c.name
}

interface CharactersState {
  characters: Character[]
  loading: boolean
  load(): Promise<void>
  save(character: Character): Promise<number>
  /** The one card-import path: saves the character, then its lorebook against the new id. Every
   *  caller goes through here so no import route can quietly drop a book.
   *  `tags` overrides whatever the card carried, the import review screen passes the ones the user
   *  kept. Omitted (seeding, cards with no tags) means the card's own tags stand.
   *  `includeBook` false leaves the card's embedded lorebook unimported, the import review screen
   *  passes the user's answer. The card itself still keeps it in `rawCard`. */
  importCharacter(json: unknown, avatar?: string, tags?: string[], includeBook?: boolean): Promise<number>
  remove(id: number): Promise<void>
}

export const useCharacters = create<CharactersState>()((set, get) => ({
  characters: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    // Bundled cards, seeded on first run as ordinary rows: editable, and once deleted they stay
    // gone. The flag is what makes a delete stick. Nothing in bundled/ means nothing is seeded.
    if (!useSettings.getState().seededCharacters) {
      useSettings.getState().markCharactersSeeded()
      const now = Date.now()
      // Standalone books in the same folder, attached to every bundled card. One flag covers both:
      // a user who deleted the seeded card and its book gets neither back.
      const bookIds: number[] = []
      for (const book of bundledLorebooks()) bookIds.push(await useLorebooks.getState().create(book))
      for (const card of await bundledCharacters()) {
        // Bundled cards go through the same book import as a user's, so a seeded character with a
        // lorebook arrives with it.
        const lorebookIds = [...(await importedBookIds(card.rawCard)), ...bookIds]
        await storage.put('characters', {
          ...card,
          ...(lorebookIds.length ? { lorebookIds } : {}),
          createdAt: now,
          updatedAt: now,
        } as unknown as StoredRecord)
      }
    }
    const rows = (await storage.getAll('characters')) as unknown as Character[]
    // Default `colors` for records saved before the field existed, not a migration, just a read
    // default, the same way useAppearance() re-merges appearance defaults.
    for (const c of rows) {
      c.colors = { ...emptyColors(), ...c.colors }
      c.gallery = c.gallery ?? []
      c.tags = c.tags ?? []
    }
    set({ characters: rows, loading: false })
  },

  save: async (character) => {
    const now = Date.now()
    const record = { ...character, createdAt: character.createdAt || now, updatedAt: now }
    const id = await storage.put('characters', record as unknown as StoredRecord)
    await get().load()
    return id
  },

  importCharacter: async (json, avatar, tags, includeBook = true) => {
    // The book is written first so its id can go on the character in the same save, otherwise a
    // card import would need a second write just to link what it already knows.
    const lorebookIds = includeBook ? await importedBookIds(json) : []
    return get().save({
      ...importCard(json),
      ...(avatar ? { avatar } : {}),
      ...(tags ? { tags } : {}),
      ...(lorebookIds.length ? { lorebookIds } : {}),
    })
  },

  remove: async (id) => {
    // Cascade: chats for this character, then their messages. Orphaned message rows are
    // the one data mess that's genuinely annoying to clean up later.
    for (const chat of await storage.find('chats', 'characterId', id)) {
      for (const message of await storage.find('messages', 'chatId', chat.id)) {
        await storage.remove('messages', message.id!)
      }
      await storage.remove('chats', chat.id!)
    }
    // No lorebook cascade: a book is independent now and can be attached to other characters.
    // Deleting one leaves its imported book behind in the Lorebooks list to be deleted there.
    await storage.remove('characters', id)
    await get().load()
  },
}))
