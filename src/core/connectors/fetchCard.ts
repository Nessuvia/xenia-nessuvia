// The ONLY place a card-import URL is fetched. Throws with a readable message on any failure,
// shown directly in the modal. Returns the parsed card JSON plus an optional avatar data URL
// (chub cards arrive as PNGs with the image embedded).
import { parsePngCard, pngDataUrl } from './pngCard.ts' // explicit extension: checkFetchCard.ts imports this file under node

export type FetchedCard = { json: unknown; avatar: string }

/** characterhub.org / chub.ai character page → the `creator/slug` fullPath the API wants. */
export function chubFullPath(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\./, '')
  if (host !== 'characterhub.org' && host !== 'chub.ai') return null
  const m = u.pathname.match(/^\/characters\/(.+)$/)
  return m ? m[1] : null
}

// chub stores the card under node.definition with its own field names (and the quirk that
// `personality` is the description and `tavern_personality` is the personality). Map it onto a
// v2 card so importCard reads it like any other. Mirrors SillyTavern's downloadChubCharacter.
async function fetchChubCard(fullPath: string): Promise<FetchedCard> {
  let res: Response
  try {
    res = await fetch(`https://api.chub.ai/api/characters/${fullPath}?full=true`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error('Could not reach chub.ai')
  }
  if (!res.ok) throw new Error(`chub.ai request failed: ${res.status}`)
  const node = ((await res.json())?.node ?? {}) as Record<string, unknown>
  const def = (node.definition ?? {}) as Record<string, unknown>
  const json = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: def.name,
      description: def.personality,
      personality: def.tavern_personality,
      scenario: def.scenario,
      first_mes: def.first_message,
      mes_example: def.example_dialogs,
      alternate_greetings: def.alternate_greetings,
      system_prompt: def.system_prompt,
      post_history_instructions: def.post_history_instructions,
      extensions: def.extensions,
    },
  }
  return { json, avatar: String(node.max_res_url ?? node.avatar_url ?? '') }
}

// A path segment we're willing to paste into an outbound URL. `.` and `..` are excluded.
// The Worker route repeats this guard.
const segment = /^(?!\.\.?$)[\w.-]+$/

/**
 * aicharactercards.com page URL or a bare `AICC/23370/2151` id → the `a/b` the PNG API wants.
 * The API takes the last two segments either way: `/cards/2151` and `23370/2151` are the same card.
 */
export function aiccId(input: string): string | null {
  const trimmed = input.trim()
  let parts: string[]
  if (/^https?:\/\//i.test(trimmed)) {
    let u: URL
    try {
      u = new URL(trimmed)
    } catch {
      return null
    }
    if (u.hostname.replace(/^www\./, '') !== 'aicharactercards.com') return null
    parts = u.pathname.split('/').filter(Boolean)
  } else {
    parts = trimmed.split('/').filter(Boolean)
    if (parts[0]?.toUpperCase() !== 'AICC') return null
  }
  const last = parts.slice(-2)
  if (last.length < 2 || !last.every((p) => segment.test(p))) return null
  return last.join('/')
}

// aicharactercards.com sends no CORS header. This goes through our own /aicc/ route (the Worker
// in src/index.js on a build, vite.config.ts's proxy in dev). The card it returns is a Tavern PNG:
// the JSON is in a tEXt chunk and the image itself is the avatar.
async function fetchAiccCard(id: string): Promise<FetchedCard> {
  let res: Response
  try {
    res = await fetch(`/aicc/${id}`)
  } catch {
    throw new Error('Could not reach aicharactercards.com')
  }
  if (!res.ok) throw new Error(`aicharactercards.com request failed: ${res.status}`)
  const buffer = await res.arrayBuffer()
  return { json: parsePngCard(buffer), avatar: pngDataUrl(buffer) }
}

/**
 * Remote image URL → data URL. The avatar lives in the save. No hotlinking someone
 * else's CDN. Returns '' on any failure; the caller keeps the URL as the degraded case.
 */
// Stores the original bytes: around a megabyte for a card PNG. If saves get
// fat, re-encode through a canvas here. The crop is stored as fractions and survives a resize.
async function inlineAvatar(url: string): Promise<string> {
  try {
    const res = await fetch(url)
    if (!res.ok) return ''
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return ''
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve('')
      reader.readAsDataURL(blob)
    })
  } catch {
    return ''
  }
}

export async function fetchCard(url: string): Promise<FetchedCard> {
  const fullPath = chubFullPath(url)
  if (fullPath) return withInlinedAvatar(await fetchChubCard(fullPath))

  const aicc = aiccId(url)
  if (aicc) return fetchAiccCard(aicc) // already a data URL

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('Could not reach that URL')
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const text = await res.text()
  try {
    return { json: JSON.parse(text), avatar: '' }
  } catch {
    throw new Error('That URL did not return valid JSON')
  }
}

/** Swaps a remote avatar URL for its bytes, keeping the URL if the image can't be downloaded. */
async function withInlinedAvatar(card: FetchedCard): Promise<FetchedCard> {
  if (!/^https?:/i.test(card.avatar)) return card
  return { ...card, avatar: (await inlineAvatar(card.avatar)) || card.avatar }
}
