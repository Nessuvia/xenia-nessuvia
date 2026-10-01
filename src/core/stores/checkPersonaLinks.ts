import assert from 'node:assert/strict'
import type { Persona } from '../storage/types.ts'
import { deletedPersonas, personaById } from './personaLinks.ts'

const persona = (id: number, formerIds?: number[]) => ({ id, name: `P${id}`, formerIds }) as Persona
const personas = [persona(1), persona(5, [2])]

// Own id first, then a link. An unknown id finds nothing.
assert.equal(personaById(personas, 1)?.id, 1)
assert.equal(personaById(personas, 2)?.id, 5)
assert.equal(personaById(personas, 3), undefined)
assert.equal(personaById(personas, undefined), undefined)

const found = deletedPersonas(
  personas,
  [
    { personaId: 1, personaName: 'P1', chatId: 10 },
    { personaId: 2, personaName: 'Old', chatId: 10 }, // linked: not deleted
    { personaId: 3, personaName: 'Ann', chatId: 10 },
    { personaId: 3, personaName: 'Anna', chatId: 10 },
    { personaId: 3, personaName: 'Anna', chatId: 11 },
    { chatId: 12 }, // an assistant turn
  ],
  [{ personaId: 3, personaName: 'Anna' }, { personaId: 4, personaName: 'Bo' }],
)
assert.deepEqual(found, [
  { id: 3, name: 'Anna', chats: 2, messages: 3, games: 1 },
  { id: 4, name: 'Bo', chats: 0, messages: 0, games: 1 },
])
