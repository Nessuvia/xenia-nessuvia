import { useEffect, useRef, useState } from 'react'
import { RiArrowLeftLine, RiCloseLine, RiDeleteBinLine, RiSendPlaneFill, RiStopFill } from '@remixicon/react'
import { useAsk } from '../../core/stores/askStore'
import { activeConnection, useSettings } from '../../core/stores/settingsStore'
import './ask.css'

/** Ask in the left sidebar: replaces the sidebar body while open. What a send does depends on the
 *  page's registered context (see askStore). */
export default function AskPanel() {
  const { turns, streaming, streamingText, error, errorDetail, context, send, stop, newChat, undo, canUndo, setOpen, setConnection, connectionId, dismissError } =
    useAsk()
  const connections = useSettings((s) => s.connections)
  // Subscribed so the fallback follows a change of active connection.
  useSettings((s) => s.activeConnectionId)
  // Same fallback as askConnection, read reactively.
  const connection = connections.find((c) => c.id === connectionId) ?? activeConnection()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, streamingText])

  function submit() {
    if (streaming || !text.trim()) return
    send(text)
    setText('')
  }

  return (
    <div className="askPanel">
      <div className="askPanelHeader">
        <div className="askPanelTopRow">
          <button type="button" className="sidebar-item sidebarBackLink askPanelBack" onClick={() => setOpen(false)}>
            <RiArrowLeftLine size={18} />
            Ask
          </button>
          <button type="button" className="askPanelIcon" title="Clear the thread" aria-label="Clear the thread" disabled={!turns.length || streaming} onClick={newChat}>
            <RiDeleteBinLine size={16} />
          </button>
        </div>
        <div className="askPanelTopRow">
          {context && <span className="askPanelBadge">{context.label}</span>}
          <select
            className="askPanelConnection"
            value={connection?.id ?? ''}
            title="Connection"
            aria-label="Connection"
            onChange={(e) => setConnection(e.target.value || null)}
          >
            {!connection && <option value="">No connection</option>}
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {context?.info && <p className="askPanelInfo">{context.info}</p>}
      </div>

      <div className="askPanelThread">
        {turns.map((turn) => (
          <div key={turn.id} className={`askPanelBubble ${turn.role === 'user' ? 'askPanelMine' : 'askPanelTheirs'}`}>
            {turn.content}
            {canUndo(turn) && (
              <button type="button" className="askPanelUndo" onClick={() => undo(turn.id)}>
                Undo
              </button>
            )}
          </div>
        ))}
        {streaming && <div className="askPanelBubble askPanelTheirs">{streamingText || '...'}</div>}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="askPanelError">
          <div className="askPanelTopRow">
            <span>{error}</span>
            <button type="button" className="askPanelClose" onClick={dismissError} aria-label="Dismiss">
              <RiCloseLine size={16} />
            </button>
          </div>
          {errorDetail && (
            <details>
              <summary>What the model returned</summary>
              <pre className="askPanelDetail">{errorDetail}</pre>
            </details>
          )}
        </div>
      )}

      <div className="askPanelFooter">
        <textarea
          className="askPanelInput"
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {streaming ? (
          <button type="button" className="askPanelIcon askPanelSend" title="Stop" aria-label="Stop" onClick={stop}>
            <RiStopFill size={16} />
          </button>
        ) : (
          <button type="button" className="askPanelIcon askPanelSend" title="Send" aria-label="Send" disabled={!text.trim() || !connection} onClick={submit}>
            <RiSendPlaneFill size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
