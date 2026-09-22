// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { Sensor } from './sensor.ts'
import type { Gate } from './gate.ts'

/**
 * The sensors the app ships, and the gates that use them.
 *
 * A deliberate exception to "nothing ships", the same one `defaultRules()` makes. The wording of a
 * question is where this succeeds or fails, and a blank box asks the user to guess at it. These are
 * the starting point a new sensor is copied from as much as they are a working set.
 *
 * Seeded, not enabled: turning the stage on is what starts spending, so an existing stack never
 * quietly begins calling an endpoint.
 */

const seed = (over: Partial<Sensor> & Pick<Sensor, 'id' | 'label' | 'question'>): Sensor => ({
  enabled: true,
  kind: 'score',
  levels: [],
  options: [],
  payload: { context: true, replies: 1, playerMessages: 1 },
  window: 3,
  ...over,
})

export function librarySensors(): Sensor[] {
  return [
    seed({
      id: 'tone',
      label: 'tone',
      question: 'How well do the tone and themes of `latest_turn` match the intent described in `context`?',
      levels: [
        'The tone and themes are unrelated to the intent.',
        'Mostly different from the intent.',
        'Partly matches the intent.',
        'Mostly matches the intent.',
        'Fully matches the intended tone and themes.',
      ],
    }),
    seed({
      id: 'cost',
      label: 'cost',
      question: 'How much does `latest_turn` cost the player? Count setbacks, refusals, losses and things going wrong for them.',
      levels: [
        'Everything goes the player\'s way.',
        'Mild friction, nothing is lost.',
        'A real setback.',
        'A serious loss or refusal.',
        'Something is taken from them that will not come back.',
      ],
      payload: { context: false, replies: 1, playerMessages: 1 },
    }),
    seed({
      id: 'tension',
      label: 'tension',
      question: 'How much pressure is on the player in `latest_turn`? Count time limits, threats, unanswered questions and open decisions.',
      levels: [
        'Nothing is at stake and nothing is pending.',
        'Idle. The scene could stop here.',
        'Something is pending.',
        'The player has to act.',
        'The player has to act now, and the wrong move costs them.',
      ],
      payload: { context: false, replies: 2, playerMessages: 1 },
    }),
    seed({
      id: 'world',
      label: 'world',
      question: 'How well does `latest_turn` obey the setting, lore and established facts in `context` and `history`?',
      levels: [
        'It contradicts the established world.',
        'It strays from the established world.',
        'It is consistent but adds nothing.',
        'It is consistent and uses the setting.',
        'It is consistent and deepens the setting.',
      ],
      payload: { context: true, replies: 3, playerMessages: 1 },
    }),
    seed({
      id: 'repeat',
      label: 'repeat',
      question: '`latest_turn` repeats an image, beat or phrasing already used in `history`.',
      kind: 'noul',
      levels: ['It covers new ground.', 'It repeats itself.'],
      payload: { context: false, replies: 4, playerMessages: 0 },
      window: 1,
    }),
  ]
}

/** The gates the worked default wires up. Off until the stage is turned on, like the sensors. */
export function libraryGates(): Gate[] {
  return [
    {
      id: 'tone-retry',
      enabled: true,
      label: 'Off-tone replies get one more go',
      when: { sensorId: 'tone', op: 'below', value: 2, minConfidence: null },
      then: {
        kind: 'retry',
        nudge:
          'Consider the tone and themes described at the start of this prompt. Push the scene in that direction.',
      },
    },
    {
      id: 'tension-dialogue',
      enabled: true,
      label: 'Flat scenes get the dialogue pass',
      when: { sensorId: 'tension', op: 'below', value: 2, minConfidence: null },
      then: { kind: 'stages', enable: ['dialogue'], disable: [] },
    },
    {
      id: 'repeat-rules',
      enabled: false,
      label: 'Repetitive replies get the full rule set',
      when: { sensorId: 'repeat', op: 'above', value: 0.6, minConfidence: null },
      then: { kind: 'stages', enable: ['rules', 'lint'], disable: [] },
    },
  ]
}
