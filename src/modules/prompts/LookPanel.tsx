import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { RiDraggable } from '@remixicon/react'
import { askJson, type PaletteError } from '../../core/palette/generatePalette'
import { useSettings } from '../../core/stores/settingsStore'
import { usePalette } from '../../core/stores/palettesStore'
import { AskError, useAsk, useAskContext, type AskContext } from '../../core/stores/askStore'
import { buildLookMessages, lookFormat, parseLookReply } from './lookPrompt'
import { stackVariables } from '../../core/prompt/stackTemplate'
import type { PromptStack } from '../../core/storage/types'
import StackLookView from './StackLookView'
import PromptToggles from './PromptToggles'
import { CodeEditor, CodeReference } from '../../app/CodeEditor'
import PageTabs from '../../app/PageTabs'
import { useMediaQuery } from '../../app/useMediaQuery'
import { hasLook, lookAttrNames, lookProblems } from './stackLook'

// Classes the standard controls carry, for the maker's CSS. Keep in step with VariableControl.
const langTabs = [
  ['html', 'HTML'],
  ['css', 'CSS'],
] as const
const paneTabs = [
  ['code', 'Code'],
  ['preview', 'Preview'],
] as const

const controlClasses = ['.optionalBlock', '.checkboxRow', '.optionPick', '.scrollPick', '.lookGroupPick']

/** The stack editor's Look tab: HTML and CSS for the stack's controls, with a live preview. */
export default function LookPanel({ stack, onChange }: { stack: PromptStack; onChange: (stack: PromptStack) => void }) {
  const look = stack.look ?? { html: '', css: '' }
  const setLook = (patch: Partial<typeof look>) => {
    const next = { ...look, ...patch }
    onChange({ ...stack, look: next.html || next.css ? next : undefined })
  }
  const { errors, warnings } = lookProblems(stack)
  const variables = stackVariables(stack)
  const generating = useAsk((st) => st.streaming)
  const [lang, setLang] = useState<'html' | 'css'>('html')
  // Half-width and down: one side at a time. A layout shape, so a media query in code.
  const narrow = useMediaQuery('(max-width: 1300px)')
  const [pane, setPane] = useState<'code' | 'preview'>('code')
  // The preview starts at the chat rail's width, the palette's sidebar width, where the look really
  // renders. 300 is the rail's default (Sidebar.css) when the palette sets none. A drag on the divider
  // sets its own width until Reset, or until the page is left: page view state, not saved.
  const railWidth = usePalette().sidebarWidth || 300
  const [width, setWidth] = useState<number | null>(null)
  const previewRef = useRef<HTMLElement>(null)

  function startDrag(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const el = previewRef.current
    const frame = el?.parentElement
    if (!el || !frame) return
    const handle = e.currentTarget
    const startX = e.clientX
    const startW = el.getBoundingClientRect().width
    // The code side keeps at least 320px. The preview stays wide enough to read.
    const max = frame.getBoundingClientRect().width - 320
    const move = (ev: PointerEvent) =>
      setWidth(Math.round(Math.min(max, Math.max(200, startW + ev.clientX - startX))))
    const stop = () => handle.removeEventListener('pointermove', move)
    handle.setPointerCapture(e.pointerId)
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop, { once: true })
    handle.addEventListener('pointercancel', stop, { once: true })
  }
  // The Ask run reads the editor's latest draft, not the one from when the tab mounted.
  const latest = useRef({ stack, onChange })
  latest.current = { stack, onChange }
  const askContext = useMemo<AskContext>(
    () => ({
      id: 'look',
      label: 'Prompt stacks → Look',
      info: "You can ask the LLM to adjust your Prompt's look inside of a chat. Xenia will send the details of the stack without sending the actual prompt instructions.",
      run: async (text, signal, connection) => {
        const { stack: current } = latest.current
        try {
          const { value, mode } = await askJson(
            buildLookMessages(text, stackVariables(current), current.look),
            connection,
            lookFormat,
            parseLookReply,
            signal,
            3000,
          )
          if (mode !== connection.structuredOutput) {
            useSettings.getState().updateConnection({ ...connection, structuredOutput: mode })
          }
          const before = current.look
          // writes over the draft as it was at send time. The fields are disabled while asking.
          latest.current.onChange({ ...current, look: value })
          return {
            reply: 'Look updated.',
            undo: () => latest.current.onChange({ ...latest.current.stack, look: before }),
          }
        } catch (err) {
          const failed = err as PaletteError
          if (!failed.attempt) throw err
          const { mode, finishReason, reply } = failed.attempt
          throw new AskError(failed.message, `Request mode: ${mode} · finish_reason: ${finishReason || 'none'}

${reply || '(empty)'}`)
        }
      },
    }),
    [],
  )
  useAskContext(askContext)

  return (
    <div className="screenBody promptsLook">
      {narrow && <PageTabs tabs={paneTabs} current={pane} onPick={setPane} />}

      {(!narrow || pane === 'preview') && (
        <section
          className="promptsLookPreview"
          style={narrow ? undefined : { width: `${width ?? railWidth}px` }}
          ref={previewRef}
        >
          <div className="zoneHeader">
            <h3>Preview</h3>
            {width !== null && (
              <button type="button" onClick={() => setWidth(null)}>
                Reset to Palette's width
              </button>
            )}
          </div>
          {/* The chat rail's own classes, so the look sits on the surface, padding and control
              rules it gets in a chat. */}
          <div className="navbar chatSettings promptsLookRail">
            {hasLook(stack) && !errors.length ? (
              <StackLookView stack={stack} onChange={onChange} />
            ) : (
              <PromptToggles stack={stack} onChange={onChange} />
            )}
          </div>
        </section>
      )}

      {!narrow && (
        <div
          className="promptsLookDivider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the preview"
          title="Drag to resize the preview"
          onPointerDown={startDrag}
        >
          <RiDraggable size={18} className="promptsLookGrip" aria-hidden />
        </div>
      )}

      {(!narrow || pane === 'code') && (
        <section className="panel codePanel">
          <div className="codePanelToolbar">
            <PageTabs tabs={langTabs} current={lang} onPick={setLang} />
            <label className="codePanelToggle">
              <input
                type="checkbox"
                checked={!!look.hideUnplaced}
                onChange={(e) => setLook({ hideUnplaced: e.target.checked || undefined })}
              />
              Hide unplaced variables
            </label>
            <label
              className="codePanelToggle"
              title="Lets the look load images and fonts from other sites, which can see your IP address. Off for stacks imported from a file."
            >
              <input
                type="checkbox"
                checked={!!stack.allowRemote}
                onChange={(e) => onChange({ ...stack, allowRemote: e.target.checked || undefined })}
              />
              Allow external links
            </label>
            <CodeReference>
              <p className="hint">
                An element with data-var="id" holds that variable's control. Variables without one
                are listed after the layout unless hidden.
              </p>
              <dl className="tokenGuide">
                <div>
                  <dt>data-var</dt>
                  <dd>{variables.map((v) => v.id).join(', ') || 'No variables yet'}</dd>
                </div>
                <div>
                  <dt>data-group</dt>
                  <dd>Checkbox ids, comma-separated. Shows one dropdown that turns on one of them. data-none="Off" adds an option that turns all off.</dd>
                </div>
                <div>
                  <dt>:scope</dt>
                  <dd>The panel root. It carries each value as an attribute.</dd>
                </div>
                <div>
                  <dt>Attributes</dt>
                  <dd>{lookAttrNames(variables).join(', ') || 'None'}</dd>
                </div>
                <div>
                  <dt>Controls</dt>
                  <dd>{controlClasses.join(', ')}</dd>
                </div>
                <div>
                  <dt>Tags</dt>
                  <dd>div, span, p, br, hr, img, h1 to h4, section, ul, ol, li, b, i, strong, em, small, details, summary</dd>
                </div>
              </dl>
              <p className="hint">
                Example: :scope[data-internal-states="false"] .stateOptions {'{'} display: none {'}'}
              </p>
            </CodeReference>
          </div>

          <CodeEditor
            lang={lang}
            value={look[lang]}
            disabled={generating}
            onChange={(text) => setLook({ [lang]: text })}
          />

          {(errors.length > 0 || warnings.length > 0) && (
            <ul className="codePanelProblems">
              {errors.map((e) => (
                <li key={e} className="error">
                  {e} The chat panel shows the standard list until this is fixed.
                </li>
              ))}
              {warnings.map((w) => (
                <li key={w} className="hint">
                  {w}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
