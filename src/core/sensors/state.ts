// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { Sensor } from './sensor.ts'
import type { SensorState } from './decisions.ts'

/**
 * The named fields a question refers to in backticks. A question naming a field that isn't here
 * still answers, on less: the model is told what it was given rather than what it was promised.
 *
 * Each field costs tokens on every reply, so a sensor asks for its own and the batch sends the
 * union of what its sensors asked for.
 */

/** Only what the state builder reads. Structural so `Message` and a multiplayer turn both fit. */
export interface StateMessage {
  role: string
  content: string
}

/** The widest payload the batch needs. One call carries one state, so the sensors share it. */
export function widestPayload(sensors: Sensor[]) {
  return {
    context: sensors.some((sensor) => sensor.payload.context),
    replies: Math.max(0, ...sensors.map((sensor) => sensor.payload.replies)),
    playerMessages: Math.max(0, ...sensors.map((sensor) => sensor.payload.playerMessages)),
  }
}

function lastOf(messages: StateMessage[], role: string, count: number): StateMessage[] {
  if (count <= 0) return []
  const found: StateMessage[] = []
  for (let at = messages.length - 1; at >= 0 && found.length < count; at -= 1) {
    if (messages[at].role === role) found.push(messages[at])
  }
  return found.reverse()
}

/**
 * The state for one batched call about `text`.
 *
 * `latest_turn` is always the reply being judged, never a stored message: on a retry it's the
 * attempt that just came back, which is the whole point of sensing per attempt.
 */
export function sensorState(
  sensors: Sensor[],
  text: string,
  /** Messages before this reply, oldest first. */
  history: StateMessage[],
  /** The card, persona and system prompt as one block. Sent only when a sensor asked for it. */
  context?: string,
): SensorState {
  const want = widestPayload(sensors)
  const state: SensorState = { latest_turn: text }

  const players = lastOf(history, 'user', want.playerMessages)
  if (players.length) state.player_message = players[players.length - 1].content

  // Everything asked for beyond the two singles, in order, labelled so the model can tell who spoke.
  const earlier = [
    ...lastOf(history, 'assistant', Math.max(0, want.replies - 1)),
    ...players.slice(0, -1),
  ]
  const ordered = history.filter((message) => earlier.includes(message))
  if (ordered.length) {
    state.history = ordered
      .map((message) => `${message.role === 'user' ? 'Player' : 'Reply'}:\n${message.content}`)
      .join('\n\n')
  }

  if (want.context && context?.trim()) state.context = context.trim()
  return state
}
