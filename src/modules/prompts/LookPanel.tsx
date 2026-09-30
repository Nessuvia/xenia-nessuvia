import { useMemo, useRef } from 'react'
import { askJson, type PaletteError } from '../../core/palette/generatePalette'
import { useSettings } from '../../core/stores/settingsStore'
import { AskError, useAsk, useAskContext, type AskContext } from '../../core/stores/askStore'
import { buildLookMessages, lookFormat, parseLookReply } from './lookPrompt'
import { stackVariables } from '../../core/prompt/stackTemplate'
import type { PromptStack } from '../../core/storage/types'
import StackLookView from './StackLookView'
import PromptToggles from './PromptToggles'
import { hasLook, lookAttrNames, lookProblems } from './stackLook'

// Classes the standard controls carry, for the maker's CSS. Keep in step with VariableControl.
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
          // ponytail: writes over the draft as it was at send time. The fields are disabled while asking.
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
    <>
      <section className="panel stackZone promptsLookZone">
        <div className="zoneHeader">
          <h3>Look</h3>
        </div>
        <p className="hint">
          Lays out this stack's settings in the chat and Story panels. An element with data-var="id" holds that
          variable's control. Variables without one are listed after the layout unless hidden below.
        </p>
        <label className="promptsLookField">
          HTML
          <textarea rows={10} value={look.html} spellCheck={false} disabled={generating} onChange={(e) => setLook({ html: e.target.value })} />
        </label>
        <label className="promptsLookField">
          CSS
          <textarea rows={10} value={look.css} spellCheck={false} disabled={generating} onChange={(e) => setLook({ css: e.target.value })} />
        </label>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={!!look.hideUnplaced}
            onChange={(e) => setLook({ hideUnplaced: e.target.checked || undefined })}
          />
          Hide variables the layout doesn't place
        </label>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={!!stack.allowRemote}
            onChange={(e) => onChange({ ...stack, allowRemote: e.target.checked || undefined })}
          />
          Allow external links
        </label>
        <p className="hint">
          Lets the look load images and fonts from other sites, which can see your IP address. Defaults to off
          for stacks imported from a file.
        </p>
        {errors.map((e) => (
          <p key={e} className="error">
            {e} The chat panel shows the standard list until this is fixed.
          </p>
        ))}
        {warnings.map((w) => (
          <p key={w} className="hint">
            {w}
          </p>
        ))}

        <details className="blockInfo">
          <summary>Reference</summary>
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
        </details>
      </section>

      <section className="panel stackZone promptsLookZone">
        <div className="zoneHeader">
          <h3>Preview</h3>
        </div>
        {hasLook(stack) && !errors.length ? (
          <StackLookView stack={stack} onChange={onChange} />
        ) : (
          <PromptToggles stack={stack} onChange={onChange} />
        )}
      </section>
    </>
  )
}
