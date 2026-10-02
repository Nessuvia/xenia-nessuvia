import { useChats } from '../../core/stores/chatStore'
import { useChatSetIds } from '../../core/stores/textRules'
import RuleSetPicker from '../../app/RuleSetPicker'

/**
 * The chat sidebar's Text rules section: which tag and find/replace sets this chat uses. Writes
 * `chat.ruleSetIds`, this chat only. Order is priority: the top set wins a tag two sets define.
 */
export default function TextRulesPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  const ids = useChatSetIds()
  if (!chat) return null
  return (
    <RuleSetPicker
      ids={ids}
      onChange={(ruleSetIds) => patchChat({ ruleSetIds })}
      scope="this chat"
      hint="Applies to this chat only. The top set wins when two define the same tag."
    />
  )
}
