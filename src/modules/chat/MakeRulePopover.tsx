import { useLayoutEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { ruleFromSample } from '../../core/agent/builder'
import { resolvePostStackRow } from '../../core/agent/postStack'
import { actionHints, actionLabels, type Rule } from '../../core/agent/rules'
import { useChats } from '../../core/stores/chatStore'
import { usePostStacks } from '../../core/stores/postStackStore'
import { useSettings } from '../../core/stores/settingsStore'

/**
 * A rule from selected reply text. Scope: the stack this chat resolves to, which is the global
 * default when the chat hasn't picked one, so the rule reaches every chat on that stack.
 */
export default function MakeRulePopover({ at, text, onClose }: { at: { x: number; y: number }; text: string; onClose: () => void }) {
  const ref = useCloseOnOutside<HTMLDivElement>(true, onClose)
  const navigate = useNavigate()
  const [sample, setSample] = useState(text.trim())
  const [action, setAction] = useState<Rule['action']>('rewrite')
  const [extra, setExtra] = useState('')
  const stacks = usePostStacks((s) => s.stacks)
  const defaultStackId = useSettings((s) => s.agent.defaultStackId)
  const chatStackId = useChats((s) => s.chat?.postStackId)
  const stack = resolvePostStackRow(chatStackId, defaultStackId, stacks)

  const save = async () => {
    if (!stack?.id) return null
    const rule = ruleFromSample(sample, {
      action,
      ...(action === 'swap' ? { replacement: extra } : {}),
      ...(action === 'rewrite' ? { note: extra } : {}),
    })
    const rules = stack.config.rules
    await usePostStacks.getState().patchConfig(stack.id, { rules: { ...rules, list: [...rules.list, rule] } })
    return { stackId: stack.id, ruleId: rule.id }
  }

  const disabled = !stack?.id || !sample.trim()

  // Clamped against the measured size, not a guess: the height changes with the action and the hints.
  // Re-runs on action change, since that adds or removes a field.
  const [pos, setPos] = useState({ left: at.x, top: at.y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    setPos({
      left: Math.max(margin, Math.min(at.x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(at.y, window.innerHeight - height - margin)),
    })
  }, [at.x, at.y, action, ref])

  return (
    <div
      ref={ref}
      className="panel chatMakeRule"
      style={pos}
    >
      <label className="chatMakeRuleField">
        Sample
        <textarea className="chatMakeRuleText" rows={3} value={sample} onChange={(e) => setSample(e.target.value)} />
      </label>
      <label className="chatMakeRuleField">
        Action
        <select value={action} onChange={(e) => setAction(e.target.value as Rule['action'])}>
          {actionLabels.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <p className="hint">{actionHints[action]}</p>
      {action === 'swap' && (
        <input value={extra} placeholder="Blank removes the match" onChange={(e) => setExtra(e.target.value)} />
      )}
      {action === 'rewrite' && (
        <textarea className="chatMakeRuleText" rows={2} value={extra} placeholder="Tell the model" onChange={(e) => setExtra(e.target.value)} />
      )}
      {stack ? <p className="hint">Saves to {stack.name}.</p> : <p className="hint">There is no stack to save to.</p>}
      <div className="chatMakeRuleActions">
        <button type="button" disabled={disabled} onClick={() => save().then(onClose)}>
          Save
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={async () => {
            const target = await save()
            onClose()
            if (target) navigate('/post-processing', { state: target })
          }}
        >
          Open in Post-processing
        </button>
      </div>
    </div>
  )
}
