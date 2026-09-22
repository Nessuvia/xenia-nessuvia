// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.

/**
 * A sensor is one typed question put to a decisions model. It cannot write prose: it answers with
 * a graded score, one of your options, or the chance a statement is true. That's cheap enough to
 * ask on every reply, which is what makes the track worth having.
 *
 * The wire shapes here follow the Decisions API as OpenRouter, NanoGPT and Typesafe serve it.
 */

export type SensorKind = 'score' | 'choice' | 'noul'

/** Score descriptions allowed, inclusive. The index of a description is the value it scores. */
export const levelRange = { min: 2, max: 10 }
/** Choice options allowed, inclusive. The wire takes far more; this is what an editor stays legible at. */
export const optionRange = { min: 2, max: 24 }

export interface ChoiceOption {
  name: string
  description: string
}

/** Which named state fields a question needs. Each one costs tokens, so a sensor asks for its own. */
export interface SensorPayload {
  /** The card, persona and system prompt, flattened into `context`. */
  context: boolean
  /** Assistant replies to send. 1 is `latest_turn` alone; more adds `history`. */
  replies: number
  /** Player messages to send. 1 is `player_message` alone; more adds `history`. */
  playerMessages: number
}

export interface Sensor {
  id: string
  enabled: boolean
  /** Short name the gates and the summary read by: 'tone', 'tension'. */
  label: string
  kind: SensorKind
  /** The question, or for a noul the statement. Names a state field in backticks. */
  question: string
  /** Score: 2 to 10 descriptions, the index is the value. Noul: [no, yes] or empty. Unused by choice. */
  levels: string[]
  /** Choice only. */
  options: ChoiceOption[]
  payload: SensorPayload
  /** Replies averaged before a gate reads it. 1 reads this reply alone. */
  window: number
}

/** A score's level index, a choice's option name, or a noul's 0 to 1. */
export type SensorValue = number | string

export interface Reading {
  sensorId: string
  value: SensorValue
  /** 0 to 1, when the model reports it. Nouls never do. */
  confidence?: number
}

/** One question as the Decisions API takes it. */
export interface WireQuestion {
  type: SensorKind
  instructions: string
  criteria?: string[] | Record<string, string>
}

const text = (value: unknown) => String(value ?? '').trim()

/** Top of a score's scale. Also the value a gate's threshold is clamped to. */
export function sensorMax(sensor: Sensor): number {
  if (sensor.kind === 'noul') return 1
  return sensor.levels.length ? sensor.levels.length - 1 : levelRange.max - 1
}

export function optionNames(sensor: Sensor): string[] {
  return sensor.options.map((option) => text(option.name)).filter(Boolean)
}

/**
 * Why a sensor can't be asked, in words the editor shows. Empty means it's ready.
 * A sensor that isn't ready is skipped rather than sent, so a half-written one never costs a call.
 */
export function sensorProblems(sensor: Sensor): string[] {
  const found: string[] = []
  if (!text(sensor.question)) found.push(sensor.kind === 'noul' ? 'it needs a statement' : 'it needs a question')
  if (!text(sensor.label)) found.push('it needs a name')

  if (sensor.kind === 'score') {
    const filled = sensor.levels.filter((level) => text(level)).length
    if (sensor.levels.length < levelRange.min || sensor.levels.length > levelRange.max) {
      found.push(`it needs ${levelRange.min} to ${levelRange.max} score descriptions`)
    } else if (filled < levelRange.min) {
      found.push('it needs at least two score descriptions filled in')
    }
  }

  if (sensor.kind === 'choice') {
    const names = optionNames(sensor)
    if (names.length < optionRange.min || sensor.options.length > optionRange.max) {
      found.push(`it needs ${optionRange.min} to ${optionRange.max} named options`)
    }
    const repeated = names.find((name, at) => names.indexOf(name) !== at)
    if (repeated) found.push(`two options are named '${repeated}'`)
  }

  if (sensor.kind === 'noul') {
    // Both descriptions or neither: the wire rejects a half-filled pair.
    const no = text(sensor.levels[0])
    const yes = text(sensor.levels[1])
    if (!no !== !yes) found.push('it needs a no description and a yes description, or neither')
  }

  return found
}

export function usableSensor(sensor: Sensor): boolean {
  return sensor.enabled && sensorProblems(sensor).length === 0
}

/** One sensor as the endpoint takes it. */
export function wireQuestion(sensor: Sensor): WireQuestion {
  const instructions = text(sensor.question)

  if (sensor.kind === 'choice') {
    const criteria: Record<string, string> = {}
    for (const option of sensor.options) {
      const name = text(option.name)
      if (name) criteria[name] = String(option.description ?? '')
    }
    return { type: 'choice', instructions, criteria }
  }

  if (sensor.kind === 'noul') {
    const no = text(sensor.levels[0])
    const yes = text(sensor.levels[1])
    return no && yes
      ? { type: 'noul', instructions, criteria: { false: no, true: yes } }
      : { type: 'noul', instructions }
  }

  return { type: 'score', instructions, criteria: sensor.levels.map((level) => String(level ?? '')) }
}

function numberIn(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null
}

/**
 * One answer, or null when it's missing or out of range. A null is a sensor that didn't read this
 * turn rather than an error: the track carries on without it.
 */
export function readAnswer(answer: unknown, sensor: Sensor): Reading | null {
  if (answer === null || typeof answer !== 'object') return null
  const found = answer as Record<string, unknown>
  const confidence = numberIn(found.confidence, 1) ?? undefined

  if (sensor.kind === 'choice') {
    const value = typeof found.choice === 'string' ? found.choice : ''
    return value && optionNames(sensor).includes(value) ? { sensorId: sensor.id, value, confidence } : null
  }

  if (sensor.kind === 'noul') {
    const value = numberIn(found.noul, 1)
    return value === null ? null : { sensorId: sensor.id, value }
  }

  const value = numberIn(found.score, sensorMax(sensor))
  return value === null ? null : { sensorId: sensor.id, value, confidence }
}

/** A reading in words, for the pass summary. */
export function formatReading(sensor: Sensor, value: SensorValue): string {
  if (sensor.kind === 'choice') return String(value)
  if (sensor.kind === 'noul') return `${Math.round(Number(value) * 100)}%`
  return Number(value).toFixed(1)
}

/** A blank sensor of the given kind. The editor fills it in; the library replaces it wholesale. */
export function newSensor(kind: SensorKind = 'score'): Sensor {
  return {
    id: `sensor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    label: '',
    kind,
    question: '',
    levels: kind === 'score' ? ['', '', '', '', ''] : ['', ''],
    options: kind === 'choice' ? [{ name: '', description: '' }, { name: '', description: '' }] : [],
    payload: { context: true, replies: 1, playerMessages: 1 },
    window: 1,
  }
}

export function findSensor(sensors: Sensor[], id: string): Sensor | undefined {
  return sensors.find((sensor) => sensor.id === id)
}
