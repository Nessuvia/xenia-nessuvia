import type { Connection } from '../../core/stores/settingsStore'
import { completionUrl } from '../../core/connectors/buildRequestBody'
import { modelsUrl } from '../../core/connectors/listModels'
import { isSentinel, sentinelContextLimit } from '../../core/connectors/sentinel'

/**
 * The context length the server reports, or null when it reports none. Two sources, in order:
 * llama.cpp's /props, then the model's entry in /models (llama.cpp, tabbyAPI and OpenRouter all
 * put a length there under one of a few names).
 *
 * Never throws and never writes: the caller decides whether to take the number. A wrong context
 * limit silently truncates prompts. This stays a button rather than something that fires on
 * its own.
 */
export async function readContextLimit(connection: Connection): Promise<number | null> {
  // Nothing to ask: the sentinel host has no server behind it.
  if (isSentinel(connection.endpointUrl)) return sentinelContextLimit
  const base = completionUrl(connection.endpointUrl, connection.type).replace(
    /\/(chat\/)?completions$/,
    '',
  )
  const headers: Record<string, string> = connection.apiKey
    ? { Authorization: `Bearer ${connection.apiKey}` }
    : {}

  try {
    const res = await fetch(`${base}/props`, { headers })
    if (res.ok) {
      const props = await res.json()
      const ctx = props?.default_generation_settings?.n_ctx ?? props?.n_ctx
      if (Number.isFinite(Number(ctx)) && Number(ctx) > 0) return Number(ctx)
    }
  } catch {
    // No /props on this backend. The models list is the other place to look.
  }

  try {
    const res = await fetch(modelsUrl(connection.endpointUrl, connection.modelQuery), { headers })
    if (!res.ok) return null
    const data = (await res.json())?.data
    if (!Array.isArray(data)) return null
    const entry = data.find((m) => String(m?.id ?? '') === connection.model)
    const ctx =
      entry?.context_length ?? entry?.max_context_length ?? entry?.context_window ?? entry?.n_ctx
    if (Number.isFinite(Number(ctx)) && Number(ctx) > 0) return Number(ctx)
  } catch {
    // Unreachable or no models endpoint. Nothing to report either way.
  }
  return null
}
