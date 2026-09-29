import type { PromptStack } from '../../core/storage/types'
import StackLookView from './StackLookView'
import PromptToggles from './PromptToggles'
import { hasLook, lookAttrNames, lookProblems } from './stackLook'

// Classes the standard controls carry, for the maker's CSS. Keep in step with VariableControl.
const controlClasses = ['.optionalBlock', '.checkboxRow', '.optionPick', '.scrollPick']

/** The stack editor's Look tab: HTML and CSS for the stack's controls, with a live preview. */
export default function LookPanel({ stack, onChange }: { stack: PromptStack; onChange: (stack: PromptStack) => void }) {
  const look = stack.look ?? { html: '', css: '' }
  const setLook = (patch: Partial<typeof look>) => {
    const next = { ...look, ...patch }
    onChange({ ...stack, look: next.html || next.css ? next : undefined })
  }
  const { errors, warnings } = lookProblems(stack)
  const variables = stack.variables ?? []

  return (
    <>
      <section className="panel stackZone promptsLookZone">
        <div className="zoneHeader">
          <h3>Look</h3>
        </div>
        <p className="hint">
          Lays out this stack's settings in the chat and Story panels. An element with data-var="id" holds that
          variable's control. Variables without one are listed after the layout.
        </p>
        <label className="promptsLookField">
          HTML
          <textarea rows={10} value={look.html} spellCheck={false} onChange={(e) => setLook({ html: e.target.value })} />
        </label>
        <label className="promptsLookField">
          CSS
          <textarea rows={10} value={look.css} spellCheck={false} onChange={(e) => setLook({ css: e.target.value })} />
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
          Lets the look load images and fonts from other sites, which can see your IP address. Stays off for stacks
          imported from a file.
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
          <StackLookView
            stack={stack}
            onVariable={(i, next) => onChange({ ...stack, variables: variables.map((x, j) => (j === i ? next : x)) })}
          />
        ) : (
          <PromptToggles stack={stack} onChange={onChange} />
        )}
      </section>
    </>
  )
}
