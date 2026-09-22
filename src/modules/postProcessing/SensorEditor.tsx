import { RiAddLine, RiDeleteBinLine } from '@remixicon/react'
import {
  levelRange,
  newSensor,
  optionRange,
  sensorProblems,
  type ChoiceOption,
  type Sensor,
  type SensorKind,
} from '../../core/sensors/sensor'
import { librarySensors } from '../../core/sensors/library'

/**
 * The check stop's editor: the questions put to the decisions model before the cleanup runs.
 *
 * A new sensor starts from the shipped library rather than a blank box. The wording of a question
 * is what makes it accurate, and a blank box asks the user to guess at it.
 */

const kindLabel: Record<SensorKind, string> = { score: 'Score', choice: 'Choice', noul: 'Noul' }
const kindAbout: Record<SensorKind, string> = {
  score: 'Rates the reply on a scale you describe.',
  choice: 'Picks the one option that fits the reply best.',
  noul: 'Gives the chance, from 0 to 100%, that your statement is true.',
}

export default function SensorEditor({
  sensors,
  onChange,
}: {
  sensors: Sensor[]
  onChange: (sensors: Sensor[]) => void
}) {
  const patch = (id: string, over: Partial<Sensor>) =>
    onChange(sensors.map((sensor) => (sensor.id === id ? { ...sensor, ...over } : sensor)))

  const add = (from?: Sensor) => {
    const seed = from ? { ...from, id: newSensor().id } : newSensor()
    onChange([...sensors, seed])
  }

  const unused = librarySensors().filter((one) => !sensors.some((sensor) => sensor.label === one.label))

  return (
    <div className="postSensors">
      <ul className="postSensorList">
        {sensors.map((sensor) => (
          <SensorRow
            key={sensor.id}
            sensor={sensor}
            onChange={(over) => patch(sensor.id, over)}
            onRemove={() => onChange(sensors.filter((one) => one.id !== sensor.id))}
          />
        ))}
      </ul>

      <div className="postSensorAdd">
        <button type="button" className="postSensorAddButton" onClick={() => add()}>
          <RiAddLine size={14} /> Add a sensor
        </button>
        {unused.map((one) => (
          <button key={one.id} type="button" className="postSensorAddButton" onClick={() => add(one)}>
            <RiAddLine size={14} /> {one.label}
          </button>
        ))}
      </div>
      <p className="hint">
        A question names a field in backticks. `latest_turn` is the reply, `player_message` is the last
        thing you sent, `history` is the messages before it, `context` is the card and system prompt.
      </p>
    </div>
  )
}

function SensorRow({
  sensor,
  onChange,
  onRemove,
}: {
  sensor: Sensor
  onChange: (over: Partial<Sensor>) => void
  onRemove: () => void
}) {
  const problems = sensorProblems(sensor)

  // Switching kind keeps the question and resets the fields that kind doesn't use, so a wrong pick
  // costs the wording rather than the whole sensor.
  const setKind = (kind: SensorKind) => {
    const blank = newSensor(kind)
    onChange({ kind, levels: kind === sensor.kind ? sensor.levels : blank.levels, options: kind === 'choice' ? sensor.options : [] })
  }

  const setLevel = (at: number, text: string) =>
    onChange({ levels: sensor.levels.map((level, i) => (i === at ? text : level)) })

  const setOption = (at: number, over: Partial<ChoiceOption>) =>
    onChange({ options: sensor.options.map((option, i) => (i === at ? { ...option, ...over } : option)) })

  return (
    <li className="card postSensor">
      <div className="postSensorHead">
        <input
          type="checkbox"
          checked={sensor.enabled}
          aria-label={`Ask ${sensor.label || 'this sensor'}`}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <input
          className="postSensorName"
          value={sensor.label}
          placeholder="name"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <select
          className="postSensorKind"
          value={sensor.kind}
          aria-label="Answer type"
          onChange={(e) => setKind(e.target.value as SensorKind)}
        >
          {(Object.keys(kindLabel) as SensorKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {kindLabel[kind]}
            </option>
          ))}
        </select>
        <button type="button" className="postSensorRemove" aria-label="Delete sensor" onClick={onRemove}>
          <RiDeleteBinLine size={14} />
        </button>
      </div>

      <p className="hint">{kindAbout[sensor.kind]}</p>

      <label className="postSensorField">
        {sensor.kind === 'noul' ? 'Statement' : 'Question'}
        <textarea
          className="postSensorQuestion"
          rows={2}
          value={sensor.question}
          onChange={(e) => onChange({ question: e.target.value })}
        />
      </label>

      {sensor.kind === 'score' && (
        <div className="postSensorScale">
          <span className="postSensorScaleTitle">Scale</span>
          {sensor.levels.map((level, at) => (
            <label key={at} className="postSensorLevel">
              <span className="postSensorLevelNumber">{at}</span>
              <input value={level} placeholder="what this score means" onChange={(e) => setLevel(at, e.target.value)} />
              {sensor.levels.length > levelRange.min && (
                <button
                  type="button"
                  className="postSensorRemove"
                  aria-label={`Delete score ${at}`}
                  onClick={() => onChange({ levels: sensor.levels.filter((_, i) => i !== at) })}
                >
                  <RiDeleteBinLine size={14} />
                </button>
              )}
            </label>
          ))}
          {sensor.levels.length < levelRange.max && (
            <button type="button" className="postSensorAddButton" onClick={() => onChange({ levels: [...sensor.levels, ''] })}>
              <RiAddLine size={14} /> Add a step
            </button>
          )}
        </div>
      )}

      {sensor.kind === 'choice' && (
        <div className="postSensorScale">
          <span className="postSensorScaleTitle">Options</span>
          {sensor.options.map((option, at) => (
            <div key={at} className="postSensorOption">
              <input
                className="postSensorOptionName"
                value={option.name}
                placeholder="name"
                onChange={(e) => setOption(at, { name: e.target.value })}
              />
              <input
                value={option.description}
                placeholder="when this one fits"
                onChange={(e) => setOption(at, { description: e.target.value })}
              />
              {sensor.options.length > optionRange.min && (
                <button
                  type="button"
                  className="postSensorRemove"
                  aria-label={`Delete option ${option.name || at}`}
                  onClick={() => onChange({ options: sensor.options.filter((_, i) => i !== at) })}
                >
                  <RiDeleteBinLine size={14} />
                </button>
              )}
            </div>
          ))}
          {sensor.options.length < optionRange.max && (
            <button
              type="button"
              className="postSensorAddButton"
              onClick={() => onChange({ options: [...sensor.options, { name: '', description: '' }] })}
            >
              <RiAddLine size={14} /> Add an option
            </button>
          )}
        </div>
      )}

      {sensor.kind === 'noul' && (
        <div className="postSensorScale">
          <span className="postSensorScaleTitle">Descriptions</span>
          <label className="postSensorLevel">
            <span className="postSensorLevelNumber">no</span>
            <input value={sensor.levels[0] ?? ''} onChange={(e) => setLevel(0, e.target.value)} />
          </label>
          <label className="postSensorLevel">
            <span className="postSensorLevelNumber">yes</span>
            <input value={sensor.levels[1] ?? ''} onChange={(e) => setLevel(1, e.target.value)} />
          </label>
          <p className="hint">Fill both or neither.</p>
        </div>
      )}

      <div className="postSensorPayload">
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={sensor.payload.context}
            onChange={(e) => onChange({ payload: { ...sensor.payload, context: e.target.checked } })}
          />
          Send the card and system prompt
        </label>
        <label className="postSensorNumber">
          Replies
          <input
            type="number"
            min={1}
            max={20}
            value={sensor.payload.replies}
            onChange={(e) => onChange({ payload: { ...sensor.payload, replies: Number(e.target.value) } })}
          />
        </label>
        <label className="postSensorNumber">
          Your messages
          <input
            type="number"
            min={0}
            max={20}
            value={sensor.payload.playerMessages}
            onChange={(e) => onChange({ payload: { ...sensor.payload, playerMessages: Number(e.target.value) } })}
          />
        </label>
        <label className="postSensorNumber">
          Average over
          <input
            type="number"
            min={1}
            max={20}
            value={sensor.window}
            onChange={(e) => onChange({ window: Number(e.target.value) })}
          />
        </label>
      </div>

      {problems.length > 0 && <p className="postSensorProblem">Not asked: {problems.join(', ')}.</p>}
    </li>
  )
}
