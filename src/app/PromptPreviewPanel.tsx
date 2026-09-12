import { useState, type ReactNode } from 'react'
import type { ChatMessage } from '../core/connectors/connectorInterface'
import { countTokens, perMessageOverhead } from '../core/prompt/budget'
import PromptInspector from './PromptInspector'
import './promptPreviewPanel.css'

const cost = (text: string) => countTokens(text) + perMessageOverhead

/**
 * The rendering half of a live prompt preview: the assembled turns, whatever the caller wants to
 * say about the budget, and the raw-JSON view. Chat and Story assemble their requests with
 * different builders. Each mode does its own building and hands the result here. The panel
 * itself knows nothing about chats, stories or stacks.
 */
export default function PromptPreviewPanel({
  messages,
  dropped,
  json,
  jsonError,
  notes,
  footer,
}: {
  messages: ChatMessage[]
  /** Turns the budget trimmed, shown greyed under the ones that would be sent. */
  dropped?: ChatMessage[]
  /** The redacted request body, already stringified. Undefined when there's no connection. */
  json?: string
  jsonError?: string
  /** Token counts and warnings, above the list, in both views. */
  notes?: ReactNode
  /** Anything mode-specific below the list (skipped blocks, and so on). */
  footer?: ReactNode
}) {
  const [raw, setRaw] = useState(false)

  return (
    <div className="promptPanel">
      <div className="promptNotes">{notes}</div>

      <label className="rawToggle">
        <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} />
        Raw JSON
      </label>

      {raw ? (
        jsonError ? (
          <p className="hint">{jsonError}</p>
        ) : (
          <PromptInspector json={json} />
        )
      ) : (
        <div className="promptList">
          {messages.map((m, i) => (
            <div className="promptMessage" key={i}>
              <div className="promptMessageHeader">
                <span className="promptRole">{m.role}</span>
                <span className="hint">{cost(m.content)} tokens</span>
              </div>
              <pre>{m.content}</pre>
            </div>
          ))}
          {messages.length === 0 && <p className="hint">Nothing to send.</p>}

          {dropped && dropped.length > 0 && (
            <>
              <p className="hint">Trimmed to fit the context limit:</p>
              {dropped.map((m, i) => (
                <div className="promptMessage dropped" key={`d${i}`}>
                  <div className="promptMessageHeader">
                    <span className="promptRole">{m.role}</span>
                    <span className="hint">{cost(m.content)} tokens</span>
                  </div>
                  <pre>{m.content}</pre>
                </div>
              ))}
            </>
          )}

          {footer}
        </div>
      )}
    </div>
  )
}
