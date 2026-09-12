import type { InstructTemplate } from '../../core/params/paramDef'
import { formatList, parseList } from '../../core/params/paramDef'
import { sequencesOf } from '../../core/prompt/flattenPrompt'

/**
 * The template's own stop strings. A connection can also carry a `stop` sampler param, and the two
 * are merged rather than one replacing the other. This panel says which is which: a user who
 * edits the wrong one loses the sequence that closes the model's turn.
 */
export default function StopStringsPanel({
  template,
  hasStopParam,
  onChange,
}: {
  template: InstructTemplate
  /** Whether the connection also carries a `stop` sampler param. */
  hasStopParam: boolean
  onChange: (template: InstructTemplate) => void
}) {
  const extra = template.sequencesAsStops ? sequencesOf(template) : []
  const sent = [...new Set([...template.stopSequences, ...extra])]

  return (
    <div className="stopStrings">
      <label className="templateField">
        Format stop strings
        <input
          value={formatList(template.stopSequences)}
          onChange={(e) => onChange({ ...template, stopSequences: parseList(e.target.value) })}
        />
        <span className="templateHint">
          Comma-separated. These close the model's turn and the format needs them. Write a newline
          as \n and a literal comma as \,.
        </span>
      </label>

      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={template.sequencesAsStops ?? false}
          onChange={(e) => onChange({ ...template, sequencesAsStops: e.target.checked })}
        />
        Send every sequence as a stop string too
      </label>

      {hasStopParam && (
        <p className="templateHint">
          This connection also has a Stop sequences sampler below. Both lists are sent.
        </p>
      )}

      <div className="stopStringsSent">
        <span className="templateHint">Sent with the request:</span>
        {sent.length ? (
          <ul className="stopStringsList">
            {sent.map((s) => (
              <li key={s} className="stopStringsItem">
                <code>{s}</code>
              </li>
            ))}
          </ul>
        ) : (
          <span className="templateHint">Nothing. The reply ends at the token cap.</span>
        )}
      </div>
    </div>
  )
}
