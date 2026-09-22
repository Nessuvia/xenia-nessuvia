import { Link } from 'react-router-dom'
import { useChats } from '../../core/stores/chatStore'
import { useSettings } from '../../core/stores/settingsStore'
import { resolveChatAgent, type AgentDisplay, type AgentStyle } from '../../core/agent/agentConfig'
import { usePostStacks } from '../../core/stores/postStackStore'
import './settings.css'

/** The agent for the open chat. On/off, the stack and display write the chat record. Style writes
 *  the global config. */
export default function AgentChatPanel() {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  const global = useSettings((s) => s.agent)
  const setAgent = useSettings((s) => s.setAgent)
  const stacks = usePostStacks((s) => s.stacks)
  if (!chat) return null
  const style = global.style ?? 'stylized'

  const override = chat.agent
  const settings = resolveChatAgent(global, override)
  const set = (patch: typeof override) => patchChat({ agent: { ...override, ...patch } })
  const defaultName = stacks.find((s) => s.id === global.defaultStackId)?.name
  // Absent means follow the default, so a later change to the default reaches this chat. Picking
  // the default stack by name would pin it instead.
  const inherited = chat.postStackId === undefined

  return (
    <div className="passChatPanel">
      <label className="checkboxRow">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Run post-processing on replies in this chat
      </label>

      <label className="checkboxRow">
        <input type="checkbox" checked={settings.sensors} onChange={(e) => set({ sensors: e.target.checked })} />
        Check replies with sensors in this chat
      </label>

      <label className="passChatPipeline">
        Stack
        <select
          value={chat.postStackId ?? ''}
          onChange={(e) => patchChat({ postStackId: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">{defaultName ? `Default (${defaultName})` : 'Default'}</option>
          {stacks.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      {/* Writes the global setting on purpose: the user wants one style everywhere, flippable from any chat. */}
      <label className="passChatPipeline">
        Style (all chats)
        <select value={style} onChange={(e) => setAgent({ style: e.target.value as AgentStyle })}>
          <option value="stylized">Stylized</option>
          <option value="default">Default</option>
        </select>
      </label>

      {style === 'default' && (
        <label className="passChatPipeline">
          While it works
          <select value={settings.display} onChange={(e) => set({ display: e.target.value as AgentDisplay })}>
            <option value="blur">Stream, blur flagged sentences</option>
            <option value="hold">Hold the reply</option>
            <option value="reveal">Reveal sentence by sentence</option>
          </select>
        </label>
      )}

      {override === undefined && inherited && <p className="hint">Using the global settings.</p>}
      <p className="hint">
        <Link to="/post-processing">Post-processing settings</Link>
      </p>

      <button
        type="button"
        className="secondary"
        disabled={override === undefined && inherited}
        onClick={() => patchChat({ agent: undefined, postStackId: undefined })}
      >
        Use the global settings
      </button>
    </div>
  )
}
