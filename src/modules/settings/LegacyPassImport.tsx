import { useEffect, useState } from 'react'
import { importLegacyPass, legacyPassFound, type ImportReport } from '../../core/stores/importLegacyPass'
import './settings.css'

/**
 * The 0.0.42 importer, in Misc next to the other import and export controls.
 *
 * The card is only rendered when there is something to convert. An install that never held the
 * old settings never sees it, and neither does one that has already run it.
 */
export default function LegacyPassImport() {
  const [found, setFound] = useState(false)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<ImportReport | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void legacyPassFound().then(setFound)
  }, [])

  if (!found) return null

  const run = async () => {
    setRunning(true)
    try {
      setDone(await importLegacyPass())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The import failed.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="settingsCard">
      <h3>Import Second Pass and Gold Pass</h3>
      {done ? (
        <p className="debugHint">
          Converted {done.pipelines} {done.pipelines === 1 ? 'pipeline' : 'pipelines'},{' '}
          {done.chats} {done.chats === 1 ? 'chat' : 'chats'} and {done.messages}{' '}
          {done.messages === 1 ? 'message' : 'messages'}. Check the stages in Second Sweep.
        </p>
      ) : (
        <>
          <button type="button" disabled={running} onClick={() => void run()}>
            {running ? 'Importing…' : 'Import'}
          </button>
          <p className="debugHint">
            This browser holds settings from 0.0.42. Each Gold Pass preset becomes a pipeline, with
            the Second Pass rules and checks in front of it. Messages keep the text from before the
            pass ran.
          </p>
        </>
      )}
      {error && <p className="debugHint">{error}</p>}
    </section>
  )
}
