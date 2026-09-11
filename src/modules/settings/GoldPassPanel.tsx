import { useState } from 'react'
import { RiDeleteBinLine } from '@remixicon/react'
import { useGoldPass, useSettings } from '../../core/stores/settingsStore'
import { activePreset, newGoldPreset } from '../../core/goldPass/goldPassSettings'
import { bundledPreset } from '../../core/goldPass/bundledPreset'
import { downloadPresets, parsePresetFile } from '../../core/goldPass/presetJson'
import ConnectionPicker from '../../app/ConnectionPicker'
import './settings.css'

/**
 * Gold Pass's global defaults. A chat's own toggle and override live in the chat sidebar and write
 * the Chat record; this is what a chat inherits when it has not touched them.
 */
export default function GoldPassPanel() {
  const settings = useGoldPass()
  const patch = useSettings((s) => s.setGoldPass)
  const [paste, setPaste] = useState('')
  const [importError, setImportError] = useState('')

  const presets = settings.presets
  const selected = activePreset(settings)

  /** Append what the JSON holds. Import adds; it never replaces the list. */
  const addJson = (text: string) => {
    try {
      const added = parsePresetFile(text)
      patch({
        presets: [...presets, ...added],
        // A first preset becomes the active one, so an import is enough to arm the feature.
        presetId: selected ? settings.presetId : added[0].id,
      })
      setPaste('')
      setImportError('')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that.')
    }
  }

  const editPreset = (id: string, over: { label?: string; text?: string }) =>
    patch({ presets: presets.map((p) => (p.id === id ? { ...p, ...over } : p)) })

  const removePreset = (id: string) =>
    patch({
      presets: presets.filter((p) => p.id !== id),
      presetId: settings.presetId === id ? '' : settings.presetId,
    })

  return (
    <div className="secondPassPanel">
      <section className="textRules screenFrame">
        <span className="titleContainer">
          <h3>Gold Pass</h3>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
            />
            Enable
          </label>
        </span>

        <div className="secondPassBody">
          <p className="hint">
            Rewrites each reply on a second connection. The rewrite becomes the message. New chats
            start with this setting; each chat can turn it on or off in the chat sidebar.
          </p>

          <ConnectionPicker
            value={settings.connectionId || null}
            onChange={(connectionId) => patch({ connectionId: connectionId ?? '' })}
            label="Rewriting connection"
          />
          <p className="hint">
            {settings.connectionId
              ? 'Pick a different connection from the one that writes the replies.'
              : 'No connection is set, so nothing runs.'}
          </p>

          <span className="secondPassSectionTitle">Window</span>
          <div className="secondPassNumbers">
            <label className="secondPassNumber">
              Messages of history
              <input
                className="secondPassNumberInput"
                type="number"
                min={0}
                max={40}
                value={settings.historyCount}
                onChange={(e) => patch({ historyCount: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={settings.includeCharacter}
              onChange={(e) => patch({ includeCharacter: e.target.checked })}
            />
            Include the character description
          </label>
          <p className="hint">
            The request holds the preset, the description, that many recent messages, and the reply
            to rewrite. The prompt stack is not used.
          </p>

          <span className="secondPassSectionTitle">Length guard</span>
          <div className="secondPassNumbers">
            <label className="secondPassNumber">
              Shortest
              <input
                className="secondPassNumberInput"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={settings.minRatio}
                onChange={(e) => patch({ minRatio: Number(e.target.value) })}
              />
            </label>
            <label className="secondPassNumber">
              Longest
              <input
                className="secondPassNumberInput"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={settings.maxRatio}
                onChange={(e) => patch({ maxRatio: Number(e.target.value) })}
              />
            </label>
          </div>
          <p className="hint">
            A rewrite outside this much of the original's length is rejected and the reply is kept.
          </p>

          <span className="secondPassSectionTitle">Presets</span>
          {presets.length === 0 && (
            <p className="hint">No presets. Nothing runs until one is added and selected.</p>
          )}
          <ul className="ruleCards">
            {presets.map((preset) => (
              <li className="card ruleCard" key={preset.id}>
                <div className="goldPresetRow">
                  <label className="checkboxRow">
                    <input
                      type="radio"
                      name="goldPreset"
                      checked={settings.presetId === preset.id}
                      onChange={() => patch({ presetId: preset.id })}
                    />
                    Use
                  </label>
                  <input
                    className="goldPresetLabelInput"
                    value={preset.label}
                    placeholder="Name"
                    onChange={(e) => editPreset(preset.id, { label: e.target.value })}
                  />
                  <button
                    type="button"
                    title="Delete preset"
                    onClick={() => removePreset(preset.id)}
                  >
                    <RiDeleteBinLine size={16} />
                  </button>
                </div>
                <label className="secondPassPrompt">
                  Prompt
                  <textarea
                    className="secondPassPromptInput"
                    rows={preset.id === settings.presetId ? 10 : 3}
                    value={preset.text}
                    placeholder="The system prompt the rewriting model gets. {{char}} and {{user}} resolve."
                    onChange={(e) => editPreset(preset.id, { text: e.target.value })}
                  />
                </label>
              </li>
            ))}
          </ul>

          <div className="grammarActions">
            <button
              type="button"
              onClick={() => {
                const added = newGoldPreset()
                patch({
                  presets: [...presets, added],
                  presetId: selected ? settings.presetId : added.id,
                })
              }}
            >
              Add preset
            </button>
            <button type="button" onClick={() => addJson(JSON.stringify({ presets: bundledPreset() }))}>
              Add the starter preset
            </button>
          </div>
          <p className="hint">
            The starter preset is an example of the mechanism. Edit it, or write your own.
          </p>

          <div className="grammarActions">
            {/* File inputs can't be styled; the label is the button. */}
            <label className="ruleImportButton">
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) addJson(await file.text())
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => downloadPresets(presets)}
              disabled={presets.length === 0}
            >
              Export JSON
            </button>
          </div>
          <div className="ruleImport">
            <textarea
              className="ruleImportInput"
              value={paste}
              rows={3}
              placeholder="…or paste preset JSON here"
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="grammarActions">
              <button type="button" disabled={!paste.trim()} onClick={() => addJson(paste)}>
                Add pasted presets
              </button>
            </div>
            {importError && <p className="hint danger">{importError}</p>}
            <p className="hint">
              Takes an export, a bare array of presets, or a single preset object. Imported presets
              are added to the list, not swapped in for it.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
