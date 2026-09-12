import { useState } from 'react'
import { snapshotTooLarge } from '../core/connectors/snapshot'

/**
 * A redacted request, rendered raw. The same component backs the live preview's JSON view and the
 * per-message inspector: both show the request in exactly one format.
 */
export default function PromptInspector({ json }: { json?: string }) {
  const [copied, setCopied] = useState(false)

  if (json === snapshotTooLarge) return <p className="hint">Request too large to store.</p>
  if (!json) return <p className="hint">No stored request for this reply.</p>

  // Stored compact; re-indented for reading. An unparseable string is shown as-is.
  let pretty = json
  try {
    pretty = JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    // keep the raw string
  }

  return (
    <div className="promptRaw">
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(pretty)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? 'Copied' : 'Copy JSON'}
      </button>
      <pre>{pretty}</pre>
    </div>
  )
}
