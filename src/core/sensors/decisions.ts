/**
 * Talks outward on purpose, like `sync/syncClient.ts` and `prompt/tokenizerCache.ts` do.
 *
 * The Decisions API is not the chat endpoint and its path can't be derived from one: OpenRouter
 * serves `/api/alpha/decisions`, NanoGPT `/api/v1/decisions`, Typesafe `/v1/systemone`. So a
 * connection flagged `decisions` gives its `endpointUrl` verbatim, and `completionUrl` is not in
 * play. The request is one batched POST of typed questions and there is no streaming, so routing
 * it through `core/connectors` would buy nothing but a translation layer.
 */
import { requestHeaders } from '../connectors/buildRequestBody'
import { isSentinel } from '../connectors/sentinel'
import type { Connection } from '../stores/settingsStore'
import { readAnswer, usableSensor, wireQuestion, type Reading, type Sensor } from './sensor'

/** The named fields a question refers to in backticks. Built by the caller from a sensor's payload. */
export type SensorState = Record<string, string>

export interface SensorResult {
  readings: Reading[]
  /** What the provider says the call cost, when it says. 0 otherwise. */
  cost: number
}

/** Rate limit and overload. Worth one retry; anything else is reported and dropped. */
const retryStatus = new Set([429, 529])
const retryDelay = 1200
const timeoutMs = 20000

export class SensorError extends Error {
  kind: 'config' | 'key' | 'credit' | 'timeout' | 'other'
  constructor(message: string, kind: SensorError['kind']) {
    super(message)
    this.name = 'SensorError'
    this.kind = kind
  }
}

function kindFor(status: number): SensorError['kind'] {
  if (status === 401 || status === 403) return 'key'
  if (status === 402) return 'credit'
  return 'other'
}

function messageFor(kind: SensorError['kind'], fallback: string): string {
  if (kind === 'key') return 'The API key was rejected.'
  if (kind === 'credit') return 'The account has no credit left.'
  return fallback
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
  })
}

/**
 * Ask a batch of sensors about one reply. Sensors that aren't ready are skipped rather than sent,
 * so a half-written one never costs a call.
 *
 * Throws only on a call that went wrong. The caller treats that as "no readings this turn" and
 * carries on: a sensor outage must never cost the user their reply.
 */
export async function askSensors(
  sensors: Sensor[],
  state: SensorState,
  connection: Connection,
  signal?: AbortSignal,
): Promise<SensorResult> {
  const asking = sensors.filter(usableSensor)
  if (asking.length === 0) return { readings: [], cost: 0 }

  // The sentinel host is a string, not a server. Answer in the browser rather than resolving it.
  if (isSentinel(connection.endpointUrl)) return { readings: [], cost: 0 }
  if (!connection.endpointUrl) throw new SensorError('No decisions endpoint is set.', 'config')

  const questions: Record<string, unknown> = {}
  for (const sensor of asking) questions[sensor.id] = wireQuestion(sensor)
  const body = JSON.stringify({ model: connection.model, state, questions })

  const controller = new AbortController()
  const forward = () => controller.abort()
  const timer = setTimeout(forward, timeoutMs)
  signal?.addEventListener('abort', forward)

  const stopped = () => {
    if (signal?.aborted) return new DOMException('Aborted', 'AbortError')
    if (controller.signal.aborted) return new SensorError('The request timed out.', 'timeout')
    return null
  }

  const send = async () => {
    const reason = stopped()
    if (reason) throw reason
    try {
      return await fetch(connection.endpointUrl, {
        method: 'POST',
        headers: requestHeaders(connection),
        body,
        signal: controller.signal,
      })
    } catch {
      throw stopped() ?? new SensorError("The request couldn't reach the endpoint.", 'other')
    }
  }

  try {
    let response = await send()
    if (retryStatus.has(response.status)) {
      await wait(retryDelay, controller.signal)
      response = await send()
    }

    let data: Record<string, unknown>
    try {
      data = (await response.json()) as Record<string, unknown>
    } catch {
      throw (
        stopped() ??
        new SensorError(`The endpoint returned ${response.status} without JSON.`, kindFor(response.status))
      )
    }

    if (!response.ok) {
      const problem = data.error ?? data.detail
      const message = typeof problem === 'string' ? problem : String((problem as { message?: string })?.message ?? '')
      const kind = kindFor(response.status)
      throw new SensorError(messageFor(kind, message || `The endpoint returned ${response.status}.`), kind)
    }

    const answers = (data.answers ?? {}) as Record<string, unknown>
    const readings: Reading[] = []
    for (const sensor of asking) {
      const reading = readAnswer(answers[sensor.id], sensor)
      if (reading) readings.push(reading)
    }

    const usage = data.usage as { cost?: unknown } | undefined
    return { readings, cost: Number(usage?.cost) || 0 }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', forward)
  }
}
