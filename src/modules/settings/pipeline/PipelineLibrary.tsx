import { useState } from 'react'
import { RiDeleteBinLine, RiFileCopyLine, RiPencilLine } from '@remixicon/react'
import { useSettings } from '../../../core/stores/settingsStore'
import { usePipelines } from '../../../core/stores/pipelineStore'
import { newPipeline, type Pipeline } from '../../../core/secondSweep/pipeline'
import { downloadPipelines, parsePipelineFile } from '../../../core/secondSweep/pipelineJson'
import './pipeline.css'

/**
 * The library: every pipeline, plus the global default.
 *
 * Two levels of writing happen on this screen and they must not be confused. The enable toggle and
 * the pipeline picker are the **global** default, which a chat overrides in its own sidebar. Edit
 * opens the **pipeline record**, which every chat using it sees.
 */
export default function PipelineLibrary({ onOpen }: { onOpen: (id: number) => void }) {
  const settings = useSettings((s) => s.secondSweep)
  const setSettings = useSettings((s) => s.setSecondSweep)
  const { pipelines, create, update, remove } = usePipelines()
  const [paste, setPaste] = useState('')
  const [importError, setImportError] = useState('')

  /** Add what the JSON holds. Import adds; it never replaces the library. A file with one
   *  pipeline in it cannot cost you the other five. */
  const addJson = async (text: string) => {
    try {
      for (const p of parsePipelineFile(text)) await create(p)
      setPaste('')
      setImportError('')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that.')
    }
  }

  const openNew = async () => {
    // Straight into the editor: a fresh pipeline has no stages, and the library row says nothing
    // about what to do next.
    onOpen(await create(newPipeline('New pipeline')))
  }

  return (
    <section className="textRules screenFrame">
      <span className="titleContainer">
        <h3>Second Sweep</h3>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ enabled: e.target.checked })}
          />
          Enable
        </label>
      </span>

      <div className="passBody">
        <p className="hint">
          Each reply is run through a pipeline before it is stored. A pipeline is a list of stages:
          check the reply, edit it, hand it to a second model, score what comes back.
        </p>

        <label className="passPrompt">
          Pipeline
          <select
            value={settings.pipelineId ?? ''}
            onChange={(e) =>
              setSettings({ pipelineId: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">None</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">The global default. A chat can pick a different one in its sidebar.</p>

        <span className="passSectionTitle">Library</span>
        <ul className="ruleCards">
          {pipelines.map((p: Pipeline) => (
            <li className="card ruleCard" key={p.id}>
              <div className="passRow">
                <input
                  className="passRowLabelInput"
                  value={p.label}
                  onChange={(e) => p.id !== undefined && void update(p.id, { label: e.target.value })}
                />
                <button
                  type="button"
                  title="Edit"
                  onClick={() => p.id !== undefined && onOpen(p.id)}
                >
                  <RiPencilLine size={14} />
                </button>
                <button
                  type="button"
                  title="Duplicate"
                  onClick={() => void create({ ...p, id: undefined, label: `${p.label} copy` })}
                >
                  <RiFileCopyLine size={14} />
                </button>
                <button type="button" title="Export" onClick={() => downloadPipelines([p])}>
                  Export
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => p.id !== undefined && void remove(p.id)}
                >
                  <RiDeleteBinLine size={14} />
                </button>
              </div>
              {p.description && <p className="hint">{p.description}</p>}
            </li>
          ))}
          {pipelines.length === 0 && <p className="hint">No pipelines.</p>}
        </ul>

        <div className="grammarActions">
          <button type="button" onClick={() => void openNew()}>
            New pipeline
          </button>
          <button
            type="button"
            disabled={pipelines.length === 0}
            onClick={() => downloadPipelines(pipelines)}
          >
            Export all
          </button>
        </div>

        <label className="passPrompt">
          Paste a pipeline file
          <textarea
            className="passPromptInput"
            rows={3}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
        </label>
        <div className="grammarActions">
          <button type="button" disabled={!paste.trim()} onClick={() => void addJson(paste)}>
            Import
          </button>
        </div>
        {importError && <p className="hint">{importError}</p>}
      </div>
    </section>
  )
}
