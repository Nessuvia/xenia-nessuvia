// Extension-ful imports on purpose: checkRunTrack.ts runs this under `node --experimental-strip-types`.
// Nothing here may reach the store or a connector. The caller supplies every outward call as a dep.
import { runAgent, type AgentOutcome, type Complete } from './runAgent.ts'
import { runStages, type PostStackConfig } from './postStack.ts'
import type { IgnorePair } from '../hammer/exclusions.ts'
import type { AgentStage } from './stage.ts'
import { findSensor, formatReading, usableSensor, type Reading, type Sensor } from '../sensors/sensor.ts'
import { attemptScore, knownReadings, windowedReadings, type ReadingHistory } from '../sensors/average.ts'
import { firedGates, gateStages, nudgeFrom, retryGates } from '../sensors/gate.ts'

/**
 * The track a reply travels down. Senses first, asks the model again while a retry gate says so,
 * keeps the best attempt, then hands the winner to `runAgent` with the stages the readings chose.
 *
 * This sits above `runAgent` rather than inside it. `runAgent` edits prose and knows nothing about
 * swipes or the main model; regenerating a reply is a different capability and belongs here.
 */

export interface TrackDeps {
  /** One batched decisions call about `text`. The caller builds the state from the sensors' payloads. */
  ask: (text: string, sensors: Sensor[]) => Promise<Reading[]>
  /** Ask the main model again. The nudge reaches it at prompt build time and is never stored. */
  regenerate: (nudge: string) => Promise<string>
  /** One rewrite call, handed straight to `runAgent`. */
  complete: Complete
}

export type TrackPhase =
  | { kind: 'sense'; attempt: number }
  | { kind: 'retry'; attempt: number; nudge: string }
  | { kind: 'clean' }

export interface Attempt {
  text: string
  /** This reply's own readings, before any window is applied. What gets stored on the swipe. */
  readings: Reading[]
  /** The readings a gate saw, folded over each sensor's window. */
  windowed: Reading[]
  score: number
}

export interface TrackOutcome extends AgentOutcome {
  /** The winning attempt's own readings, for storage on the swipe. */
  readings: Reading[]
  /** The winning attempt as the writing model produced it, before the cleanup touched it. */
  kept: string
  attempts: Attempt[]
  /** What the sensors did, in one line. Absent when nothing sensed. */
  senseSummary?: string
}

export interface TrackOptions {
  /** Earlier replies' readings, oldest first. Feeds each sensor's window. */
  history?: ReadingHistory
  /** The global Tags list, passed through to `runStages`. */
  tagRules?: IgnorePair[]
  /** Recent chat as plain text, so a rewrite fits the scene. Built by the caller from `contextMessages`. */
  context?: string
  /** The message this reply answers, for the flow pass's VAD guard. */
  lastMessage?: string
  onPhase?: (phase: TrackPhase) => void
  onProgress?: (text: string, pending: string[], stage?: AgentStage) => void
  /** Present puts the cleanup in Stylized mode, exactly as `runAgent` reads it. */
  wait?: (ms: number) => Promise<void>
}

function sensorsOf(config: PostStackConfig): Sensor[] {
  // A stack saved before sensors existed has no list. Absent reads as off, never as an error.
  if (!config.sensors?.enabled) return []
  return config.sensors.list.filter(usableSensor)
}

function gatesOf(config: PostStackConfig) {
  if (!config.gates?.enabled) return []
  return config.gates.list
}

function summarise(winner: Attempt, attempts: Attempt[], sensors: Sensor[]): string | undefined {
  if (winner.windowed.length === 0) return undefined
  const named = winner.windowed
    .map((reading) => {
      const sensor = findSensor(sensors, reading.sensorId)
      return sensor ? `${sensor.label} ${formatReading(sensor, reading.value)}` : ''
    })
    .filter(Boolean)
  if (named.length === 0) return undefined

  const read = `Sensors read ${named.join(', ')}.`
  if (attempts.length === 1) return read
  const at = attempts.indexOf(winner)
  const asked = attempts.length - 1
  const kept = at === 0 ? 'kept the first' : at === attempts.length - 1 ? 'kept the last' : `kept attempt ${at + 1}`
  return `${read} Asked again ${asked === 1 ? 'once' : `${asked} times`}, ${kept}.`
}

export async function runTrack(
  text: string,
  config: PostStackConfig,
  deps: TrackDeps,
  options: TrackOptions = {},
): Promise<TrackOutcome> {
  const { history = [], tagRules = [], context, lastMessage, onPhase, onProgress, wait } = options
  const sensors = sensorsOf(config)
  const gates = gatesOf(config)

  /**
   * One sense, turned into an attempt. A failed call reads as no readings: a sensor outage must
   * never cost the user their reply, so the track degrades to plain post-processing.
   */
  const measure = async (body: string, at: number, watched: string[]): Promise<Attempt> => {
    let readings: Reading[] = []
    if (sensors.length) {
      onPhase?.({ kind: 'sense', attempt: at })
      try {
        readings = knownReadings(await deps.ask(body, sensors), sensors)
      } catch (error) {
        // An abort is the user stopping, and has to reach the caller. Anything else is dropped.
        if ((error as Error)?.name === 'AbortError') throw error
        readings = []
      }
    }
    const windowed = windowedReadings([...history, readings], sensors)
    return { text: body, readings, windowed, score: attemptScore(windowed, sensors, watched) }
  }

  let attempts: Attempt[] = []
  let winner = await measure(text, 0, [])

  const cap = Math.max(0, Math.floor(config.retryCap ?? 0))
  let fired = firedGates(gates, winner.windowed, sensors)
  let retries = retryGates(fired)

  if (cap > 0 && retries.length > 0) {
    // Rank every attempt on the sensors that asked for the retry, so "better" means better at the
    // thing that was wrong rather than better on average.
    const watched = [...new Set(retries.map((gate) => gate.when.sensorId))]
    winner = { ...winner, score: attemptScore(winner.windowed, sensors, watched) }
    attempts = [winner]

    for (let at = 1; at <= cap && retries.length > 0; at += 1) {
      const nudge = nudgeFrom(retries)
      onPhase?.({ kind: 'retry', attempt: at, nudge })
      const next = await deps.regenerate(nudge)
      // An empty reply is a failed call. Keep what we have rather than replacing it with nothing.
      if (!next.trim()) break

      const attempt = await measure(next, at, watched)
      attempts.push(attempt)
      fired = firedGates(gates, attempt.windowed, sensors)
      retries = retryGates(fired)
      if (retries.length === 0) break
    }

    // Best score wins, ties keep the earliest: a later attempt has to actually be better to
    // displace one the user could already have been reading.
    winner = attempts.reduce((best, one) => (one.score > best.score ? one : best), attempts[0])
    fired = firedGates(gates, winner.windowed, sensors)
  }

  if (attempts.length === 0) attempts = [winner]

  onPhase?.({ kind: 'clean' })
  const gated = gateStages(config, fired)
  const run = { ...runStages(gated, tagRules), context, lastMessage }
  const outcome = await runAgent(winner.text, run, deps.complete, onProgress, wait)

  return { ...outcome, readings: winner.readings, kept: winner.text, attempts, senseSummary: summarise(winner, attempts, sensors) }
}
