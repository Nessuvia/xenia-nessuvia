import type { Persona } from '../storage/types.ts'

/** The persona to draw for a stamped id: its own, else the one linked to it after it was deleted.
 *  Display only. The prompt still reads the persona the record was stamped with. */
export function personaById(personas: Persona[], id: number | undefined): Persona | undefined {
  if (id === undefined) return undefined
  return personas.find((p) => p.id === id) ?? personas.find((p) => p.formerIds?.includes(id))
}

export interface DeletedPersona {
  id: number
  /** The last name it was stamped with. */
  name: string
  chats: number
  messages: number
  games: number
}

interface Stamped {
  personaId?: number
  personaName?: string
  chatId?: number
}

/** Persona ids that messages and games still carry but no persona answers to, own id or linked.
 *  Rows come in key order, so the last name seen is the latest one. */
export function deletedPersonas(personas: Persona[], messages: Stamped[], games: Stamped[]): DeletedPersona[] {
  const found = new Map<number, DeletedPersona & { chatIds: Set<number> }>()
  const entry = (row: Stamped) => {
    const id = row.personaId
    if (id === undefined || personaById(personas, id)) return undefined
    let e = found.get(id)
    if (!e) {
      e = { id, name: '', chats: 0, messages: 0, games: 0, chatIds: new Set() }
      found.set(id, e)
    }
    if (row.personaName) e.name = row.personaName
    return e
  }
  for (const m of messages) {
    const e = entry(m)
    if (!e) continue
    e.messages++
    if (m.chatId !== undefined) e.chatIds.add(m.chatId)
  }
  for (const g of games) {
    const e = entry(g)
    if (e) e.games++
  }
  return [...found.values()].map(({ chatIds, ...e }) => ({ ...e, chats: chatIds.size }))
}
