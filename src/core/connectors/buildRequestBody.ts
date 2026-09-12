import type { ChatMessage } from './connectorInterface'
import type { Connection } from '../stores/settingsStore'
import type { ParamDef } from '../params/paramDef.ts'
import { coerceValue, defaultTemplate } from '../params/paramDef.ts'
import { flattenPrompt, sequencesOf } from '../prompt/flattenPrompt.ts'

/**
 * The one place a request body is shaped. The preview, the inspector and the send path all call
 * this. Nothing else in the app builds a body.
 *
 * Every sampler in the body comes from `connection.params`, resolved against the def library.
 * A param the connection does not carry is not sent at all. The backend applies its own default
 * instead.
 */
export function buildRequestBody(
  messages: ChatMessage[],
  connection: Connection,
  /** The param library, for the key → shape lookup. */
  defs: ParamDef[],
  /** Per-request fields the connection has no setting for: today only `response_format`, on the
   *  palette request. Applied last. */
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = { model: connection.model, stream: true }

  if (connection.type === 'text') {
    const template = connection.template ?? defaultTemplate()
    body.prompt = flattenPrompt(messages, template)
    // The format's own stops, plus every sequence when the template asks for it.
    const stops = new Set([
      ...template.stopSequences,
      ...(template.sequencesAsStops ? sequencesOf(template) : []),
    ])
    if (stops.size) body.stop = [...stops]
  } else {
    body.messages = messages
  }

  const byKey = new Map(defs.map((d) => [d.key, d]))
  for (const param of connection.params) {
    const def = byKey.get(param.key)
    // A def deleted out from under a connection is skipped rather than sent raw.
    if (!def) continue
    const value = coerceValue(def, param.value)
    if (value === undefined) continue
    // A `stop` param merges with the template's sequences rather than replacing them.
    if (def.key === 'stop' && Array.isArray(body.stop) && Array.isArray(value)) {
      body.stop = [...new Set([...(body.stop as string[]), ...(value as string[])])]
    } else {
      body[def.key] = value
    }
  }

  if (extra) Object.assign(body, extra)
  return body
}

/**
 * Where a request is actually POSTed. Accepts a full path, a `/v1` base, or a bare root; the
 * connection type picks the tail. A path that already names either completions endpoint is left
 * exactly as typed. Local backends put these under paths no rule here could guess
 * (`/api/v1`, `/completion`, a proxy prefix), so a full URL is taken at its word.
 */
export function completionUrl(endpointUrl: string, type: Connection['type'] = 'chat'): string {
  const url = endpointUrl.replace(/\/+$/, '')
  const tail = type === 'text' ? '/completions' : '/chat/completions'
  if (/\/(chat\/)?completions?$/.test(url)) return url
  if (url.endsWith('/v1')) return `${url}${tail}`
  return `${url}/v1${tail}`
}

export function requestHeaders(connection: Connection): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // Local backends usually take no key. An empty one means no header at all rather than an
    // `Authorization: Bearer ` some servers reject outright.
    ...(connection.apiKey ? { Authorization: `Bearer ${connection.apiKey}` } : {}),
  }
}

export interface RedactedRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/**
 * The request as it can safely be rendered or stored: body plus headers, key removed.
 * The key is stripped by value rather than by field name. A copy of it that reached the body
 * through a param gets scrubbed too.
 */
export function redact(body: Record<string, unknown>, connection: Connection): RedactedRequest {
  const request: RedactedRequest = {
    url: completionUrl(connection.endpointUrl, connection.type),
    headers: { ...requestHeaders(connection), ...(connection.apiKey ? { Authorization: 'Bearer ****' } : {}) },
    body,
  }
  if (!connection.apiKey) return request
  // stringify/replace/parse. Bodies are prompt-sized and this runs once per send.
  const scrubbed = JSON.stringify(request).split(JSON.stringify(connection.apiKey).slice(1, -1)).join('****')
  return JSON.parse(scrubbed) as RedactedRequest
}
