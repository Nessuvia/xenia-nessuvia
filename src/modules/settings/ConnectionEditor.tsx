import { useEffect, useState } from 'react'
import { RiEyeLine } from '@remixicon/react'
import type { Connection } from '../../core/stores/settingsStore'
import type { ConnectionType } from '../../core/params/paramDef'
import { defaultTemplate } from '../../core/params/paramDef'
import { listModels } from '../../core/connectors/listModels'
import type { ModelInfo } from '../../core/connectors/listModels'
import { buildRequestBody, requestHeaders, completionUrl } from '../../core/connectors/buildRequestBody'
import { describeFetchError } from '../../core/connectors/fetchError'
import { parseSse } from '../../core/connectors/connectorInterface'
import { isSentinel, sentinelHost } from '../../core/connectors/sentinel'
import { useParamDefs } from '../../core/stores/paramDefsStore'
import { recommendedParams } from '../../core/params/connectionParams'
import ParamBuilder from './ParamBuilder'
import TemplateEditor from './TemplateEditor'
import StopStringsPanel from './StopStringsPanel'
import ReasoningPanel from './ReasoningPanel'
import { readContextLimit } from './readContextLimit'
import TokenizerPicker from './TokenizerPicker'

interface Props {
  connection: Connection
  onSave: (connection: Connection) => void
  onClose: () => void
}

/** Edits autosave 1s after the last keystroke; there is no Save button. */
export default function ConnectionEditor({ connection, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(connection)
  const [saved, setSaved] = useState(true)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [modelsOpen, setModelsOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [testResult, setTestResult] = useState('')
  const [testing, setTesting] = useState(false)
  const [contextNote, setContextNote] = useState('')
  const [reading, setReading] = useState(false)
  const defs = useParamDefs((s) => s.defs)

  // A connection with no params sends nothing but the model and the prompt, which is never what
  // anyone means by a fresh connection. Filled once the library has loaded, not in newConnection().
  useEffect(() => {
    if (draft.params.length || !defs.length) return
    setDraft((d) => ({ ...d, params: recommendedParams(d, defs) }))
    setSaved(false)
  }, [draft.params.length, defs])

  // Debounced autosave.
  useEffect(() => {
    if (saved) return
    const timer = setTimeout(() => {
      onSave(draft)
      setSaved(true)
    }, 1000)
    return () => clearTimeout(timer)
  }, [saved, draft, onSave])

  const set = <K extends keyof Connection>(key: K, value: Connection[K]) => {
    setDraft({ ...draft, [key]: value })
    setSaved(false)
  }

  // Carry the provider's vision flag alongside the model id: downstream (e.g. the body-map author)
  // trusts the API over a name guess. A free-typed id not in the list clears the flag (undefined)
  // and falls back to the heuristic.
  const pickModel = (id: string) => {
    setDraft({ ...draft, model: id, modelVision: models.find((m) => m.id === id)?.vision })
    setSaved(false)
  }

  async function refreshModels() {
    setRefreshing(true)
    setModels(await listModels(draft))
    setRefreshing(false)
  }

  async function testConnection() {
    setTesting(true)
    setTestResult('')
    // The sentinel host has no server to test against. Report what it does: it never resolves.
    if (isSentinel(draft.endpointUrl)) {
      setTestResult(`OK. ${sentinelHost} is a stand-in endpoint. Requests are not sent.`)
      setTesting(false)
      return
    }
    try {
      // A real non-streaming request with the connection's own params: the raw body shows exactly
      // what the backend sends back, an error message, an empty reply, or where the text lives.
      const res = await fetch(completionUrl(draft.endpointUrl, draft.type), {
        method: 'POST',
        headers: requestHeaders(draft),
        body: JSON.stringify({ ...buildRequestBody([{ role: 'user', content: 'Say hello.' }], draft, defs), stream: false }),
      })
      const body = await res.text()
      if (!res.ok) {
        setTestResult(`${res.status} ${res.statusText}\n${body.slice(0, 800)}`)
        return
      }
      let message: { content?: string; reasoning_content?: string; reasoning?: string } | undefined
      try {
        const choice = JSON.parse(body).choices?.[0]
        // A text-completion reply puts the text on the choice, with no message object.
        message = choice?.message ?? (typeof choice?.text === 'string' ? { content: choice.text } : undefined)
      } catch {
        setTestResult(`OK, ${res.status}, but the response is not JSON:\n${body.slice(0, 800)}`)
        return
      }
      const content = message?.content ?? ''
      const reasoning = message?.reasoning_content ?? message?.reasoning ?? ''
      const lines = [`OK, ${res.status}`]
      if (content) lines.push(`Reply: ${content.slice(0, 200)}`)
      else if (reasoning) lines.push('Reply was empty, the model returned only reasoning.')
      else lines.push(`No reply text found. Raw response:\n${body.slice(0, 500)}`)

      // The chat uses streaming. Test that too: capture the raw stream and run it through the
      // real parser. Text present in the raw but nothing parsed means a framing the parser misses.
      const sres = await fetch(completionUrl(draft.endpointUrl, draft.type), {
        method: 'POST',
        headers: requestHeaders(draft),
        body: JSON.stringify({ ...buildRequestBody([{ role: 'user', content: 'Say hello.' }], draft, defs), stream: true }),
      })
      const raw = await sres.text()
      let streamed = ''
      for await (const chunk of parseSse(new Response(raw).body!)) streamed += chunk.content ?? ''
      if (streamed) lines.push(`Stream OK: ${streamed.slice(0, 200)}`)
      else lines.push(`Stream parsed nothing. Raw stream:\n${raw.slice(0, 700)}`)

      setTestResult(lines.join('\n'))
    } catch (err) {
      setTestResult(describeFetchError(err, completionUrl(draft.endpointUrl, draft.type)))
    } finally {
      // finally, rather than a line after the try: the early returns for a non-OK status and for a
      // non-JSON body skipped it and left the button reading "Testing…" until a reload.
      setTesting(false)
    }
  }

  async function readLimit() {
    setReading(true)
    setContextNote('')
    const found = await readContextLimit(draft)
    if (found === null) setContextNote('The server did not report a context length.')
    else {
      set('contextLimit', found)
      setContextNote(`Read ${found} from the server.`)
    }
    setReading(false)
  }

  return (
    <div className="panel connectionEditor">
      {/* <details> for the section toggles, native, and no state to persist. */}
      <details className="editorSection" open>
        <summary>Connection</summary>
        <div className="connectionGrid">
          <label className="span2">
            Name
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="span2">
            Type
            <select
              value={draft.type}
              onChange={(e) => {
                const type = e.target.value as ConnectionType
                // The param list is rebuilt for the new type: a sampler the other kind of endpoint
                // doesn't take would 400 the first request, and the user never asked for it here.
                const kept = draft.params.filter((p) =>
                  defs.find((d) => d.key === p.key)?.appliesTo.includes(type),
                )
                setDraft({
                  ...draft,
                  type,
                  params: kept,
                  template: type === 'text' ? (draft.template ?? defaultTemplate()) : draft.template,
                })
                setSaved(false)
              }}
            >
              <option value="chat">Chat completion</option>
              <option value="text">Text completion</option>
            </select>
          </label>

          <label className="span3">
            Endpoint URL
            <span className="modelRow">
              <input
                value={draft.endpointUrl}
                placeholder="https://nano-gpt.com/api/v1 or http://localhost:8080/v1"
                onChange={(e) => set('endpointUrl', e.target.value)}
              />
              <button type="button" onClick={testConnection} disabled={testing || !draft.endpointUrl}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
            </span>
          </label>

          <label>
            API key
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
            />
          </label>

          {testResult && <pre className="testResult span4">{testResult}</pre>}

          <label className="span2">
            Model
            <span className="modelRow modelPicker">
              <input
                value={draft.model}
                onChange={(e) => pickModel(e.target.value)}
                onFocus={() => setModelsOpen(true)}
                // Delay the close: a click on a row registers before the list unmounts.
                onBlur={() => setTimeout(() => setModelsOpen(false), 150)}
              />
              <button type="button" onClick={refreshModels} disabled={refreshing}>
                {refreshing ? 'Refreshing…' : 'Refresh models'}
              </button>
              {modelsOpen &&
                (() => {
                  const q = draft.model.toLowerCase()
                  const shown = models.filter((m) => m.id.toLowerCase().includes(q))
                  if (shown.length === 0) return null
                  return (
                    <ul className="modelOptions">
                      {shown.map((m) => (
                        <li
                          key={m.id}
                          // mousedown beats the input's blur: selection isn't cancelled first.
                          onMouseDown={() => {
                            pickModel(m.id)
                            setModelsOpen(false)
                          }}
                        >
                          <span>{m.id}</span>
                          {m.vision && <RiEyeLine size={14} aria-label="Vision" />}
                        </li>
                      ))}
                    </ul>
                  )
                })()}
            </span>
            {models.length > 0 && <small>{models.length} models available</small>}
          </label>

          <label className="span2">
            Model list query (key:value, comma-separated)
            <input
              value={draft.modelQuery ?? ''}
              placeholder="scope:subscription, sort:mostused"
              onChange={(e) => set('modelQuery', e.target.value)}
            />
          </label>

          <label>
            Context limit
            <span className="modelRow">
              <input
                type="number"
                value={draft.contextLimit}
                onChange={(e) => set('contextLimit', Number(e.target.value))}
              />
              <button type="button" onClick={readLimit} disabled={reading || !draft.endpointUrl}>
                {reading ? 'Reading…' : 'Read from server'}
              </button>
            </span>
            {contextNote && <small>{contextNote}</small>}
          </label>
          <label>
            Safety margin %
            <input
              type="number"
              value={draft.safetyMarginPct}
              onChange={(e) => set('safetyMarginPct', Number(e.target.value))}
            />
          </label>

          <TokenizerPicker connection={draft} onChange={(t) => set('tokenizer', t)} />
        </div>
      </details>

      {draft.type === 'text' && (
        <>
          <details className="editorSection" open>
            <summary>Instruct template</summary>
            <TemplateEditor
              template={draft.template ?? defaultTemplate()}
              name={draft.name}
              onChange={(template) => set('template', template)}
            />
          </details>
          <details className="editorSection">
            <summary>Stop strings</summary>
            <StopStringsPanel
              template={draft.template ?? defaultTemplate()}
              hasStopParam={draft.params.some((p) => p.key === 'stop')}
              onChange={(template) => set('template', template)}
            />
          </details>
          <details className="editorSection">
            <summary>Reasoning</summary>
            <ReasoningPanel
              template={draft.template ?? defaultTemplate()}
              onChange={(template) => set('template', template)}
            />
          </details>
        </>
      )}

      <ParamBuilder
        connection={draft}
        onChange={(next) => {
          setDraft(next)
          setSaved(false)
        }}
      />

      <div className="editorActions">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            // Closing inside the 1s debounce would drop the pending edit with the timer.
            if (!saved) onSave(draft)
            onClose()
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}
