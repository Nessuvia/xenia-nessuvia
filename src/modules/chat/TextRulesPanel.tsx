import { useNavigate } from 'react-router-dom'
import { RiIndeterminateCircleLine } from '@remixicon/react'
import { useChats } from '../../core/stores/chatStore'
import { useAllSets, useChatSetIds } from '../../core/stores/textRules'

/**
 * The chat sidebar's Text rules section: which tag and find/replace sets this chat uses. Writes
 * `chat.ruleSetIds`, this chat only. Order is priority: the top set wins a tag two sets define.
 */
export default function TextRulesPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  const sets = useAllSets()
  const navigate = useNavigate()
  // A deleted set drops out of the list here, and mergeSets skips it on the send path.
  const ids = useChatSetIds().filter((id) => sets.some((s) => s.id === id))
  if (!chat) return null

  const write = (ruleSetIds: string[]) => patchChat({ ruleSetIds })
  const unused = sets.filter((s) => !ids.includes(s.id))

  return (
    <>
      {ids.length === 0 && <p className="hint">No rule sets selected.</p>}
      <ul className="textRulesChatList">
        {ids.map((id, i) => (
          <li key={id} className="textRulesChatRow">
            <select
              className="textRulesChatSelect"
              value={id}
              aria-label="Rule set"
              onChange={(e) => write(ids.map((x, j) => (j === i ? e.target.value : x)))}
            >
              {sets
                .filter((s) => s.id === id || !ids.includes(s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || 'Unnamed'}
                  </option>
                ))}
            </select>
            <button type="button" onClick={() => navigate('/appearance#textRules', { state: { setId: id } })}>
              Edit
            </button>
            <button
              type="button"
              aria-label="Remove from this chat"
              title="Remove from this chat"
              onClick={() => write(ids.filter((x) => x !== id))}
            >
              <RiIndeterminateCircleLine size={16} />
            </button>
          </li>
        ))}
      </ul>
      {unused.length > 0 && (
        <select
          className="textRulesChatSelect"
          value=""
          aria-label="Add a rule set"
          onChange={(e) => e.target.value && write([...ids, e.target.value])}
        >
          <option value="">Add a set...</option>
          {unused.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || 'Unnamed'}
            </option>
          ))}
        </select>
      )}
      <p className="hint">Applies to this chat only. The top set wins when two define the same tag.</p>
    </>
  )
}
