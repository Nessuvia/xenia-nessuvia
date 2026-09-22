// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { findSensor, sensorMax, type Reading, type Sensor, type SensorValue } from './sensor.ts'
import type { PostStackConfig } from '../agent/postStack.ts'

/**
 * A gate is what a reading does. It reads a sensor, compares it, and either asks the model again
 * with a nudge or turns cleanup stages on and off for this reply.
 *
 * The condition is built from dropdowns rather than parsed from a string. A stack is exported and
 * shared, and a typo in a DSL would fail silently on someone else's machine.
 */

export type GateOp = 'below' | 'above' | 'is' | 'isNot'

export interface Condition {
  sensorId: string
  op: GateOp
  value: SensorValue
  /** Skip the gate unless the model was at least this sure, 0 to 1. Null ignores confidence. */
  minConfidence: number | null
}

/** The stages a gate can reach. Each maps to one switch on the stack. */
export type StageId = 'swaps' | 'lint' | 'rules' | 'flow' | 'dialogue'

export interface RetryAction {
  kind: 'retry'
  /** Appended to the prompt for the retry only. Never stored on a message. */
  nudge: string
}

export interface StagesAction {
  kind: 'stages'
  enable: StageId[]
  disable: StageId[]
}

export type GateAction = RetryAction | StagesAction

export interface Gate {
  id: string
  enabled: boolean
  label: string
  when: Condition
  then: GateAction
}

/** Which ops a kind offers. A choice compares by name, the other two by size. */
export function opsFor(sensor: Sensor | undefined): GateOp[] {
  return sensor?.kind === 'choice' ? ['is', 'isNot'] : ['below', 'above']
}

/** Does one reading satisfy one condition? */
export function meets(condition: Condition, reading: Reading | undefined, sensor: Sensor | undefined): boolean {
  if (!reading || !sensor) return false
  if (condition.minConfidence !== null) {
    // No reported confidence counts as not confident enough: a gate that asked for certainty
    // shouldn't fire on a sensor that never reports any.
    if (reading.confidence === undefined || reading.confidence < condition.minConfidence) return false
  }

  if (sensor.kind === 'choice') {
    const same = String(reading.value) === String(condition.value)
    return condition.op === 'isNot' ? !same : same
  }

  const value = Number(reading.value)
  const against = Number(condition.value)
  if (!Number.isFinite(value) || !Number.isFinite(against)) return false
  return condition.op === 'above' ? value > against : value < against
}

/** The enabled gates whose condition the readings satisfy, in list order. */
export function firedGates(gates: Gate[], readings: Reading[], sensors: Sensor[]): Gate[] {
  const byId = new Map(readings.map((reading) => [reading.sensorId, reading]))
  return gates.filter((gate) => {
    if (!gate.enabled) return false
    const sensor = findSensor(sensors, gate.when.sensorId)
    return meets(gate.when, byId.get(gate.when.sensorId), sensor)
  })
}

export function retryGates(gates: Gate[]): Gate[] {
  return gates.filter((gate) => gate.then.kind === 'retry')
}

/** The nudges the fired retry gates ask for, deduped, in order. */
export function nudgeFrom(gates: Gate[]): string {
  const seen = new Set<string>()
  for (const gate of retryGates(gates)) {
    const nudge = (gate.then as RetryAction).nudge.trim()
    if (nudge) seen.add(nudge)
  }
  return [...seen].join('\n')
}

/**
 * The stack with the fired gates' stage switches applied. Returns the config rather than the flat
 * `AgentRun` so `runStages` stays the one place a switch becomes an empty list. Later gates win.
 */
export function gateStages(config: PostStackConfig, gates: Gate[]): PostStackConfig {
  const wanted = new Map<StageId, boolean>()
  for (const gate of gates) {
    if (gate.then.kind !== 'stages') continue
    for (const id of gate.then.disable) wanted.set(id, false)
    for (const id of gate.then.enable) wanted.set(id, true)
  }
  if (wanted.size === 0) return config

  const on = (id: StageId, current: boolean) => wanted.get(id) ?? current
  return {
    ...config,
    swaps: { ...config.swaps, enabled: on('swaps', config.swaps.enabled) },
    lint: { ...config.lint, enabled: on('lint', config.lint.enabled) },
    rules: { ...config.rules, enabled: on('rules', config.rules.enabled) },
    flow: { ...config.flow, enabled: on('flow', config.flow.enabled) },
    dialoguePass: { enabled: on('dialogue', config.dialoguePass?.enabled ?? true) },
  }
}

/** A threshold the sensor can actually reach. Guards a stack edited by hand or imported. */
export function clampThreshold(sensor: Sensor, value: SensorValue): SensorValue {
  if (sensor.kind === 'choice') return String(value)
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.min(sensorMax(sensor), Math.max(0, number))
}

export function newGate(sensor?: Sensor): Gate {
  return {
    id: `gate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: true,
    label: '',
    when: {
      sensorId: sensor?.id ?? '',
      op: opsFor(sensor)[0],
      value: sensor && sensor.kind !== 'choice' ? Math.round(sensorMax(sensor) * 5) / 10 : '',
      minConfidence: null,
    },
    then: { kind: 'stages', enable: [], disable: [] },
  }
}
