import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSettings } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { createSet, saveSet, useAllSets } from '../../core/stores/textRules'
import { globalSetId } from '../../core/prompt/textRules'
import TagRulesPanel from '../settings/TagRulesPanel'
import FindReplacePanel from '../settings/FindReplacePanel'

/** Palette › Text rules: pick a set, edit its tags and find/replace. The chat's Text rules panel
 *  links here with `state.setId`. */
export default function TextRulesView() {
  const location = useLocation()
  const sets = useAllSets()
  const ruleSets = useSettings((s) => s.ruleSets)
  const setRuleSets = useSettings((s) => s.setRuleSets)
  const load = useStacks((s) => s.load)
  const [id, setId] = useState<string>((location.state as { setId?: string } | null)?.setId ?? globalSetId)

  useEffect(() => void load(), [load])

  const set = sets.find((s) => s.id === id) ?? sets[0]
  const own = ruleSets.find((s) => s.id === set.id)
  const isStack = set.id.startsWith('stack:')

  return (
    <div className="screenBody">
      <div className="textRulesSetBar">
        <select value={set.id} onChange={(e) => setId(e.target.value)} aria-label="Rule set">
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || 'Unnamed'}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setId(createSet('New set'))}>
          New set
        </button>
        {own && (
          <>
            <input
              value={own.name}
              aria-label="Set name"
              onChange={(e) => setRuleSets(ruleSets.map((s) => (s.id === own.id ? { ...s, name: e.target.value } : s)))}
            />
            <button
              type="button"
              className="danger"
              onClick={() => {
                setRuleSets(ruleSets.filter((s) => s.id !== own.id))
                setId(globalSetId)
              }}
            >
              Delete set
            </button>
          </>
        )}
      </div>
      {isStack && <p className="hint">This set belongs to the prompt stack. Edits apply to every chat using it.</p>}
      <div className="textRulesCards">
        <TagRulesPanel rules={set.tagRules} onChange={(tagRules) => saveSet(set.id, { tagRules })} />
        <FindReplacePanel
          rules={set.replaceRules}
          onChange={(replaceRules) => saveSet(set.id, { replaceRules })}
          onMakeTag={(tag, replacing) =>
            saveSet(set.id, {
              tagRules: [...set.tagRules, tag],
              replaceRules: set.replaceRules.filter((r) => r.id !== replacing),
            })
          }
        />
      </div>
    </div>
  )
}
