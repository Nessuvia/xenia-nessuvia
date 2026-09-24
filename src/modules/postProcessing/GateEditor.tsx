import { RiAddLine, RiDeleteBinLine } from '@remixicon/react'
import { clampThreshold, newGate, opsFor, type Gate, type GateOp, type StageId } from '../../core/sensors/gate'
import { findSensor, optionNames, sensorMax, type Sensor } from '../../core/sensors/sensor'

/**
 * What a reading does. A gate is one condition and one action, built from dropdowns rather than
 * typed as a string: a stack is exported and shared, and a typo in a DSL would fail silently on
 * someone else's machine.
 */

const opLabel: Record<GateOp, string> = { below: 'is below', above: 'is above', is: 'is', isNot: 'is not' }

const stageLabel: Record<StageId, string> = {
  swaps: 'word swaps',
  lint: 'style checks',
  rules: 'rules',
  flow: 'detectors',
  dialogue: 'dialogue pass',
}

const stageIds = Object.keys(stageLabel) as StageId[]

export default function GateEditor({
  gates,
  sensors,
  retryCap,
  onChange,
  onRetryCap,
}: {
  gates: Gate[]
  sensors: Sensor[]
  retryCap: number
  onChange: (gates: Gate[]) => void
  onRetryCap: (cap: number) => void
}) {
  const patch = (id: string, over: Partial<Gate>) =>
    onChange(gates.map((gate) => (gate.id === id ? { ...gate, ...over } : gate)))

  return (
    <div className="postGates">
      {sensors.length === 0 ? (
        <p className="hint">Add a sensor first. A gate reads one.</p>
      ) : (
        <ul className="postGateList">
          {gates.map((gate) => (
            <GateRow
              key={gate.id}
              gate={gate}
              sensors={sensors}
              onChange={(over) => patch(gate.id, over)}
              onRemove={() => onChange(gates.filter((one) => one.id !== gate.id))}
            />
          ))}
        </ul>
      )}

      <div className="postSensorAdd">
        <button
          type="button"
          className="postSensorAddButton"
          disabled={sensors.length === 0}
          onClick={() => onChange([...gates, newGate(sensors[0])])}
        >
          <RiAddLine size={14} /> Add a gate
        </button>
        <label className="postSensorNumber">
          Retries per reply
          <input
            type="number"
            min={0}
            max={5}
            value={retryCap}
            onChange={(e) => onRetryCap(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
      </div>
      <p className="hint">
        Every attempt is kept as a swipe and the best-scoring one is selected. 0 never asks again.
      </p>
    </div>
  )
}

function GateRow({
  gate,
  sensors,
  onChange,
  onRemove,
}: {
  gate: Gate
  sensors: Sensor[]
  onChange: (over: Partial<Gate>) => void
  onRemove: () => void
}) {
  const sensor = findSensor(sensors, gate.when.sensorId)
  const ops = opsFor(sensor)
  const names = sensor ? optionNames(sensor) : []

  // Pointing a gate at a different sensor has to bring its operator and threshold into that
  // sensor's range, or the gate reads as never firing with no sign of why.
  const setSensor = (sensorId: string) => {
    const next = findSensor(sensors, sensorId)
    if (!next) return
    onChange({
      when: {
        ...gate.when,
        sensorId,
        op: opsFor(next)[0],
        value: next.kind === 'choice' ? (optionNames(next)[0] ?? '') : clampThreshold(next, gate.when.value),
        minConfidence: next.kind === 'noul' ? null : gate.when.minConfidence,
      },
    })
  }

  const setAction = (kind: Gate['then']['kind']) =>
    onChange({ then: kind === 'retry' ? { kind: 'retry', nudge: '' } : { kind: 'stages', enable: [], disable: [] } })

  const toggleStage = (id: StageId, to: 'enable' | 'disable' | 'off') => {
    if (gate.then.kind !== 'stages') return
    const enable = gate.then.enable.filter((one) => one !== id)
    const disable = gate.then.disable.filter((one) => one !== id)
    if (to === 'enable') enable.push(id)
    if (to === 'disable') disable.push(id)
    onChange({ then: { kind: 'stages', enable, disable } })
  }

  const stageState = (id: StageId): 'enable' | 'disable' | 'off' => {
    if (gate.then.kind !== 'stages') return 'off'
    if (gate.then.enable.includes(id)) return 'enable'
    if (gate.then.disable.includes(id)) return 'disable'
    return 'off'
  }

  return (
    <li className="card postGate">
      <div className="postGateHead">
        <input
          type="checkbox"
          checked={gate.enabled}
          aria-label={`Use ${gate.label || 'this gate'}`}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <input
          className="postGateName"
          value={gate.label}
          placeholder="what this gate is for"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <button type="button" className="postSensorRemove" aria-label="Delete gate" onClick={onRemove}>
          <RiDeleteBinLine size={14} />
        </button>
      </div>

      <div className="postGateWhen">
        <span className="postGateWord">When</span>
        <select value={gate.when.sensorId} aria-label="Sensor" onChange={(e) => setSensor(e.target.value)}>
          {sensors.map((one) => (
            <option key={one.id} value={one.id}>
              {one.label || one.id}
            </option>
          ))}
        </select>
        <select
          value={gate.when.op}
          aria-label="Comparison"
          onChange={(e) => onChange({ when: { ...gate.when, op: e.target.value as GateOp } })}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {opLabel[op]}
            </option>
          ))}
        </select>
        {sensor?.kind === 'choice' ? (
          <select
            value={String(gate.when.value)}
            aria-label="Option"
            onChange={(e) => onChange({ when: { ...gate.when, value: e.target.value } })}
          >
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="postGateValue"
            type="number"
            aria-label="Threshold"
            min={0}
            max={sensor ? sensorMax(sensor) : 1}
            step={sensor?.kind === 'noul' ? 0.05 : 0.1}
            value={Number(gate.when.value)}
            onChange={(e) => onChange({ when: { ...gate.when, value: Number(e.target.value) } })}
          />
        )}
      </div>

      <div className="postGateThen">
        <span className="postGateWord">Then</span>
        <select
          value={gate.then.kind}
          aria-label="Action"
          onChange={(e) => setAction(e.target.value as Gate['then']['kind'])}
        >
          <option value="stages">change the cleanup</option>
          <option value="retry">ask the model again</option>
        </select>
      </div>

      {gate.then.kind === 'retry' ? (
        <label className="postSensorField">
          Nudge
          <textarea
            className="postSensorQuestion"
            rows={2}
            value={gate.then.nudge}
            placeholder="What to tell the model on the retry"
            onChange={(e) => onChange({ then: { kind: 'retry', nudge: e.target.value } })}
          />
          <span className="hint">Added to the prompt for the retry only. Your message isn't edited.</span>
        </label>
      ) : (
        <ul className="postGateStages">
          {stageIds.map((id) => (
            <li key={id} className="postGateStage">
              <span className="postGateStageName">{stageLabel[id]}</span>
              <select
                value={stageState(id)}
                aria-label={`What happens to ${stageLabel[id]}`}
                onChange={(e) => toggleStage(id, e.target.value as 'enable' | 'disable' | 'off')}
              >
                <option value="off">leave as set</option>
                <option value="enable">turn on</option>
                <option value="disable">turn off</option>
              </select>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
