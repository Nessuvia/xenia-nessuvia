// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { findSensor, type Reading, type Sensor } from './sensor.ts'

/**
 * A sensor's `window` says how many replies it reads at once. One dud in an otherwise good stretch
 * shouldn't reroll the story, and one good reply in a bad stretch shouldn't clear the flag.
 *
 * Readings are stored per swipe, so the history handed in here rolls back when the user swipes
 * back. That falls out of the storage shape rather than being arranged: nothing here keeps state.
 */

/** Per-reply readings, oldest first, the reply being judged last. */
export type ReadingHistory = Reading[][]

function mode(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[values.length - 1] ?? ''
  let most = 0
  for (const [value, count] of counts) {
    // `values` arrives newest first, so map insertion order is too: `>` keeps the newest on a tie.
    if (count > most) {
      most = count
      best = value
    }
  }
  return best
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * One reading per sensor, each folded over its own window. A sensor with nothing in the window is
 * absent rather than zero: a gate on a sensor that never read must not fire.
 */
export function windowedReadings(history: ReadingHistory, sensors: Sensor[]): Reading[] {
  const found: Reading[] = []

  for (const sensor of sensors) {
    const window = Math.max(1, Math.floor(sensor.window) || 1)
    // Walk back from the newest reply, collecting the last `window` replies that read this sensor.
    const recent: Reading[] = []
    for (let at = history.length - 1; at >= 0 && recent.length < window; at -= 1) {
      const reading = history[at].find((one) => one.sensorId === sensor.id)
      if (reading) recent.push(reading)
    }
    if (recent.length === 0) continue

    const confidences = recent.map((one) => one.confidence).filter((one): one is number => one !== undefined)
    const confidence = confidences.length === recent.length ? mean(confidences) : undefined

    found.push({
      sensorId: sensor.id,
      value:
        sensor.kind === 'choice'
          ? mode(recent.map((one) => String(one.value)))
          : mean(recent.map((one) => Number(one.value))),
      confidence,
    })
  }

  return found
}

/** The readings for one reply, keeping only sensors that still exist on the stack. */
export function knownReadings(readings: Reading[], sensors: Sensor[]): Reading[] {
  return readings.filter((reading) => findSensor(sensors, reading.sensorId) !== undefined)
}

/**
 * How well a set of readings does on the sensors a retry was trying to fix. Higher is better, so
 * the best attempt wins. Scores and nouls are normalised to 0-1 against their own top.
 *
 * A choice has no order, so it can't be ranked and is skipped. When every watched sensor is a
 * choice every attempt ties at 0 and the earliest one that stopped the gate firing is kept, which
 * is the only sensible answer available.
 */
export function attemptScore(readings: Reading[], sensors: Sensor[], watched: string[]): number {
  const parts: number[] = []
  for (const sensorId of watched) {
    const sensor = findSensor(sensors, sensorId)
    const reading = readings.find((one) => one.sensorId === sensorId)
    if (!sensor || !reading || sensor.kind === 'choice') continue
    const top = sensor.kind === 'noul' ? 1 : Math.max(1, sensor.levels.length - 1)
    parts.push(Number(reading.value) / top)
  }
  return parts.length === 0 ? 0 : mean(parts)
}
