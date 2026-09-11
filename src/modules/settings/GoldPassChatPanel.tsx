import { Link } from 'react-router-dom'
import { useChats } from '../../core/stores/chatStore'
import { useSettings } from '../../core/stores/settingsStore'
import { activePreset, resolveGoldPass } from '../../core/goldPass/goldPassSettings'
import ConnectionPicker from '../../app/ConnectionPicker'
import './settings.css'

/**
 * Gold Pass for the open chat, in the chat sidebar.
 *
 * The toggle writes the **chat** record, never the global default and never the stack: turning the
 * rewrite on here must not change the next new chat. The override section is the rest of the
 * settings at the same level, and a chat that never opens it inherits global.
 */
export default function GoldPassChatPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  const global = useSettings((s) => s.goldPass)
  const connections = useSettings((s) => s.connections)
  if (!chat) return null

  const override = chat.goldPass
  const settings = resolveGoldPass(global, override)
  const connection = connections.find((c) => c.id === settings.connectionId)
  const preset = activePreset(settings)
  const set = (patch: Partial<typeof settings>) =>
    patchChat({ goldPass: { ...override, ...patch } })

  return (
    <div className="goldChatPanel">
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Rewrite replies in this chat
      </label>

      <p className="hint">
        {connection ? `Rewrites on ${connection.name}.` : 'No rewriting connection is set.'}
        {preset ? ` Preset: ${preset.label}.` : ' No preset is selected.'}
      </p>
      {override === undefined && <p className="hint">Using the global settings.</p>}
      <p className="hint">
        <Link to="/settings#goldPass">Gold Pass settings</Link>
      </p>

      <details>
        <summary>Override for this chat</summary>
        <div className="goldChatPanel">
          <ConnectionPicker
            value={settings.connectionId || null}
            onChange={(connectionId) => set({ connectionId: connectionId ?? '' })}
            label="Rewriting connection"
          />
          <div className="secondPassNumbers">
            <label className="secondPassNumber">
              Messages of history
              <input
                className="secondPassNumberInput"
                type="number"
                min={0}
                max={40}
                value={settings.historyCount}
                onChange={(e) => set({ historyCount: Number(e.target.value) })}
              />
            </label>
            <label className="secondPassNumber">
              Shortest
              <input
                className="secondPassNumberInput"
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={settings.minRatio}
                onChange={(e) => set({ minRatio: Number(e.target.value) })}
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
                onChange={(e) => set({ maxRatio: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={settings.includeCharacter}
              onChange={(e) => set({ includeCharacter: e.target.checked })}
            />
            Include the character description
          </label>
          <label className="secondPassNumber">
            Preset
            <select
              value={settings.presetId}
              onChange={(e) => set({ presetId: e.target.value })}
            >
              <option value="">None</option>
              {settings.presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            These apply to this chat only. Presets are written in Settings.
          </p>
          <div className="grammarActions">
            <button type="button" disabled={override === undefined} onClick={() => patchChat({ goldPass: undefined })}>
              Use the global settings
            </button>
          </div>
        </div>
      </details>
    </div>
  )
}
