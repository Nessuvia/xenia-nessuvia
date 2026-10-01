// Prompts > Defaults: which stack each feature starts on. Global scope. A chat, game or story with
// its own stack keeps it; these only fill in where nothing more specific is set.
import { useStacks } from '../../core/stores/stacksStore'
import { useSettings } from '../../core/stores/settingsStore'
import { stackKind } from './stackKinds'
import type { StackKind } from './stackKinds'

type DefaultKey = 'activeStackId' | 'activeStoryStackId' | 'activeGameStackId' | 'activeMultiplayerStackId'

interface Row {
  key: DefaultKey
  label: string
  hint: string
  kind: StackKind
  /** Games and Multiplayer work with no default, so they offer an empty choice. */
  optional?: boolean
}

export default function DefaultsPanel() {
  const stacks = useStacks((s) => s.stacks)
  const settings = useSettings()

  const rows: Row[] = [
    { key: 'activeStackId', label: 'Chat', hint: 'Chats without their own stack use this.', kind: 'chat' },
    ...(settings.writeEnabled
      ? [{ key: 'activeStoryStackId', label: 'Write', hint: 'Write mode uses this.', kind: 'story' } as Row]
      : []),
    {
      key: 'activeGameStackId',
      label: 'Games',
      hint: 'Games without their own stack use this. Not set uses the stack named Game.',
      kind: 'chat',
      optional: true,
    },
    ...(settings.multiplayerEnabled
      ? [
          {
            key: 'activeMultiplayerStackId',
            label: 'Multiplayer',
            hint: 'New sessions start with this stack selected.',
            kind: 'chat',
            optional: true,
          } as Row,
        ]
      : []),
  ]

  return (
    <section className="panel defaultsPanel">
      {rows.map((row) => (
        <label key={row.key} className="defaultsRow">
          <span className="defaultsLabel">{row.label}</span>
          <select
            value={settings[row.key] ?? ''}
            onChange={(e) => useSettings.setState({ [row.key]: e.target.value === '' ? null : Number(e.target.value) })}
          >
            {row.optional && <option value="">Not set</option>}
            {stacks
              .filter((s) => stackKind(s) === row.kind)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <span className="hint">{row.hint}</span>
        </label>
      ))}
    </section>
  )
}
