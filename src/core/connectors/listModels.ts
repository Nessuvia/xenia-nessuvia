import type { Connection } from '../stores/settingsStore'
import { completionUrl } from './buildRequestBody.ts'
import { isSentinel, sentinelModel } from './sentinel.ts'

export interface ModelInfo {
  id: string
  vision: boolean
}

// never throws. The model field is free text. A backend without /v1/models
// (or a typo'd endpoint) returns an empty list rather than an error state to design around.
// ?detailed=true is NanoGPT's opt-in for a capabilities map; standard backends ignore the
// unknown query param, omit `capabilities`, and vision falls back to false.
// `key:value, key:value` → URLSearchParams. Blank or malformed pairs are skipped; whatever the
// user types is sent verbatim, and an unknown param gets ignored by the backend.
export function parseModelQuery(raw: string | undefined): URLSearchParams {
  const params = new URLSearchParams({ detailed: 'true' })
  for (const pair of (raw ?? '').split(',')) {
    const i = pair.indexOf(':')
    if (i === -1) continue
    const key = pair.slice(0, i).trim()
    if (key) params.set(key, pair.slice(i + 1).trim())
  }
  return params
}

// Full models URL for a connection. Same base path as the chat endpoint (e.g. /api/v1); using
// the bare origin drops that base and hits a different /models that ignores the query params.
// `scope` isn't a query param on NanoGPT: subscription/paid are separate path variants
// (/api/subscription/v1/models, /api/paid/v1/models). It's pulled out and rewrites the path.
export function modelsUrl(endpointUrl: string, query: string | undefined): string {
  const params = parseModelQuery(query)
  const scope = params.get('scope')
  params.delete('scope')
  let url = completionUrl(endpointUrl).replace(/\/(chat\/)?completions$/, '/models')
  if (scope) url = url.replace(/\/v1\/models$/, `/${scope}/v1/models`)
  return `${url}?${params}`
}

export async function listModels(connection: Connection): Promise<ModelInfo[]> {
  // The sentinel host is a string, not a server: answer with the one canned model rather than
  // resolving it.
  if (isSentinel(connection.endpointUrl)) return [{ id: sentinelModel, vision: false }]
  try {
    const res = await fetch(modelsUrl(connection.endpointUrl, connection.modelQuery), {
      headers: connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {},
    })
    if (!res.ok) return []
    const data = (await res.json()).data
    if (!Array.isArray(data)) return []
    // Keep the backend's order: the query can ask for a specific sort (e.g. NanoGPT's sort:mostused).
    return data
      .map((m) => ({ id: String(m?.id ?? ''), vision: m?.capabilities?.vision === true }))
      .filter((m) => m.id)
  } catch {
    return []
  }
}
