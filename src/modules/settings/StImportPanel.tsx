import { useRef, useState } from 'react'
import { RiUploadLine } from '@remixicon/react'
import { newConnection, useAppearance, useSettings } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { useParamDefs } from '../../core/stores/paramDefsStore'
import type { StImport } from '../../core/sillytavern/importSillyTavern'
import { parseSillyTavern, shapeLabels } from '../../core/sillytavern/importSillyTavern'
import './settings.css'

/**
 * Import a SillyTavern export. The parse is pure (`core/sillytavern`): the file becomes a
 * summary first and nothing is written until Import is pressed. The tag rule is global appearance
 * rather than part of the connection, and it gets its own checkbox.
 */
export default function StImportPanel() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [found, setFound] = useState<StImport | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [parts, setParts] = useState({ connection: true, stack: true, tagRule: true })
  const addConnection = useSettings((s) => s.addConnection)
  const setAppearance = useSettings((s) => s.setAppearance)
  const appearance = useAppearance()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setDone('')
    setFound(null)
    try {
      const result = parseSillyTavern(await file.text(), file.name)
      setFound(result)
      setParts({ connection: true, stack: true, tagRule: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  async function apply() {
    if (!found) return
    const made: string[] = []
    if (found.connection && parts.connection) {
      for (const def of found.newDefs) await useParamDefs.getState().create(def)
      addConnection({ ...newConnection(), ...found.connection })
      made.push('connection')
    }
    if (found.stack && parts.stack) {
      const id = await useStacks.getState().save(found.stack)
      useSettings.setState({ activeStackId: id })
      made.push('prompt stack')
    }
    if (found.tagRule && parts.tagRule) {
      setAppearance({ tagRules: [...appearance.tagRules, found.tagRule] })
      made.push('reasoning tag rule')
    }
    setFound(null)
    setDone(
      made.length
        ? `Imported: ${made.join(', ')}. Set the endpoint and API key on the new connection.`
        : 'Nothing selected, nothing imported.',
    )
  }

  return (
    <section className="settingsCard stImport">
      <h3>SillyTavern import</h3>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={onFile}
      />
      <button type="button" onClick={() => fileInput.current?.click()}>
        <RiUploadLine size={14} /> Choose file
      </button>
      <p className="debugHint">
        Settings exports, chat completion and text completion presets, instruct and context
        templates.
      </p>
      {error && <p className="error">{error}</p>}
      {done && <p className="debugHint">{done}</p>}

      {found && (
        <div className="stImportSummary">
          <p className="stImportShape">
            {shapeLabels[found.shape]}: {found.label}
          </p>
          {found.connection && (
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={parts.connection}
                onChange={(e) => setParts({ ...parts, connection: e.target.checked })}
              />
              Connection: {found.connection.params?.length ?? 0} samplers,{' '}
              {found.connection.type === 'text' ? 'text completion' : 'chat completion'}
              {found.connection.contextLimit
                ? `, ${found.connection.contextLimit} context`
                : ''}
            </label>
          )}
          {found.stack && (
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={parts.stack}
                onChange={(e) => setParts({ ...parts, stack: e.target.checked })}
              />
              Prompt stack: {found.stack.active.length} blocks
            </label>
          )}
          {found.tagRule && (
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={parts.tagRule}
                onChange={(e) => setParts({ ...parts, tagRule: e.target.checked })}
              />
              Reasoning tag rule ({found.tagRule.open}), added to the global tag rules
            </label>
          )}
          {found.newDefs.length > 0 && (
            <p className="debugHint">
              New samplers in the library: {found.newDefs.map((d) => d.key).join(', ')}
            </p>
          )}
          {found.notes.map((note) => (
            <p className="debugHint" key={note}>
              {note}
            </p>
          ))}
          <div className="stImportActions">
            <button type="button" onClick={apply}>
              Import
            </button>
            <button type="button" onClick={() => setFound(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
