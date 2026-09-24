import type { TagRule } from '../../core/stores/settingsStore'
import { newTagRule, useAppearance, useSettings } from '../../core/stores/settingsStore'
import './settings.css'

/** Tag rules: hide or collapse text between two markers. Global, same as the rest of appearance. */
export default function TagRulesPanel() {
  const appearance = useAppearance()
  const setAppearance = useSettings((s) => s.setAppearance)

  const patchRule = (id: string, patch: Partial<TagRule>) =>
    setAppearance({
      tagRules: appearance.tagRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })

  return (
    <section className="textRules screenFrame">
      <h3>Tags</h3>
      <p className="hint">
        Text between the two markers is hidden or shown in a collapsed block. Markers are matched
        exactly and can be anything, <code>&lt;think&gt;</code>…<code>&lt;/think&gt;</code> or{' '}
        <code>[</code>…<code>]</code>. Depth stops sending the block to the model once its message is older than that many
        turns; the block stays stored and on screen.
      </p>

      <ul className="tagRules screenBody">
        {appearance.tagRules.map((rule) => (
          <li key={rule.id}>
            <input
              value={rule.open}
              placeholder="<think>"
              onChange={(e) => patchRule(rule.id, { open: e.target.value })}
            />
            <input
              value={rule.close}
              placeholder="</think>"
              onChange={(e) => patchRule(rule.id, { close: e.target.value })}
            />
            <select
              value={rule.mode}
              onChange={(e) => patchRule(rule.id, { mode: e.target.value as TagRule['mode'] })}
            >
              <option value="collapse">Collapse</option>
              <option value="hide">Hide</option>
              <option value="unwrap">Content only</option>
            </select>
            <input
              value={rule.label ?? ''}
              placeholder="Label"
              onChange={(e) => patchRule(rule.id, { label: e.target.value })}
            />
            <input
              type="number"
              min="1"
              value={rule.depth ?? ''}
              placeholder="Depth"
              title="Stop sending this block once it's older than N messages. Blank = always sent."
              onChange={(e) =>
                patchRule(rule.id, {
                  depth: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
            <button
              type="button"
              className="danger"
              onClick={() =>
                setAppearance({ tagRules: appearance.tagRules.filter((r) => r.id !== rule.id) })
              }
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setAppearance({ tagRules: [...appearance.tagRules, newTagRule()] })}
      >
        Add tag
      </button>
    </section>
  )
}
