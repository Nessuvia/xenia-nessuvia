import { useEffect, useState } from 'react'
import type { Chat } from '../../core/storage/types'
import PromptToggles from '../prompts/PromptToggles'
import { stackKind } from '../prompts/stackKinds'
import { useChats } from '../../core/stores/chatStore'
import { useCharacters } from '../../core/stores/charactersStore'
import { useSettings, useAppearance, useActiveConnection } from '../../core/stores/settingsStore'
import ConnectionPicker from '../../app/ConnectionPicker'
import { usePalette } from '../../core/stores/palettesStore'
import { useStacks } from '../../core/stores/stacksStore'
import { participants } from '../../core/stores/roster'
import { chatPanels } from '../../app/moduleRegistry'
import ConnectionParams from './ConnectionParams'
import AppearancePanel from '../appearance/AppearancePanel'
import PromptPanel from './PromptPanel'
import SpeakerColors from './SpeakerColors'

const isGroup = (c: Chat) => participants(c).length > 1

/** The slider stops at 20; typing or stepping reaches anything from 1 to 100. */
const clampWidth = (n: number) => Math.min(100, Math.max(1, n || 100))

/**
 * The open chat's settings, rendered in the sidebar. It reads its own state rather than taking
 * props, save for one presentational flag: the sidebar knows a chat is open, not what's in it.
 *
 * No save button and no dirty state, edits land in the chat record 600ms after the last
 * keystroke. The sidebar keys this on the chat id, so the draft never needs resetting in place.
 */
export default function ChatSettingsPanel({
  /** Render every control disabled. Guests see the host's settings and cannot change them. */
  readOnly,
}: {
  readOnly?: boolean
} = {}) {
  const chat = useChats((s) => s.chat)
  const patchChat = useChats((s) => s.patchChat)
  const character = useCharacters((s) => s.characters.find((c) => c.id === chat?.characterId))
  const activeConnectionId = useSettings((s) => s.activeConnectionId)
  const connection = useActiveConnection()
  const setActiveConnection = useSettings((s) => s.setActiveConnection)
  const activeStackId = useSettings((s) => s.activeStackId)
  const stacks = useStacks((s) => s.stacks)
  // Story stacks build a different prompt and have no Chat History block, so they can't run a chat.
  const chatStacks = stacks.filter((s) => stackKind(s) === 'chat')
  // A chat with its own stack shows and edits that one. Only a chat without an override reaches
  // the global, so a multiplayer session's stack can't be repointed from here by accident.
  const ownStackId = chat?.stackId
  const shownStackId = ownStackId ?? activeStackId
  const stack = stacks.find((x) => x.id === shownStackId)
  const loadStacks = useStacks((s) => s.load)
  const saveStack = useStacks((s) => s.save)

  const [draft, setDraft] = useState<Partial<Chat>>({})
  const palette = usePalette()
  const debugMode = useSettings((s) => s.debugMode)
  const enabledPlugins = useSettings((s) => s.enabledPlugins)
  const appearance = useAppearance()
  const setAppearance = useSettings((s) => s.setAppearance)

  useEffect(() => {
    loadStacks()
  }, [loadStacks])

  useEffect(() => {
    if (Object.keys(draft).length === 0) return
    const timer = setTimeout(() => patchChat(draft), 600)
    return () => clearTimeout(timer)
  }, [draft, patchChat])

  if (!chat || !character) return null

  const value = { ...chat, ...draft }
  const set = (patch: Partial<Chat>) => setDraft({ ...draft, ...patch })
  // What the note's depth falls back to when this chat hasn't set one.
  const stackDepth = stack?.active.find((b) => b.source === 'authorNote')?.depth
  const roster = participants(value).length

  return (
    <section className="panel chatSettings screenBody">
      <fieldset disabled={readOnly} style={{ border: 'none', margin: 0, padding: 0 }}>
      {/* These select the global active connection/stack, same as Settings and the stack editor.
          Every chat resolves generation from those globals, so this is a global default, not a
          per-chat override. Per-chat: add connectionId to the Chat record (stackId already exists)
          and resolve from it in ChatView. */}
      <ConnectionPicker value={activeConnectionId} onChange={setActiveConnection} />

      {/* <details> for the section toggles, native, and no state to persist. */}
      <details>
        <summary>Author's Note</summary>
        <label>
          Note
          <textarea
            rows={4}
            value={value.authorNote ?? ''}
            onChange={(e) => set({ authorNote: e.target.value })}
          />
        </label>

        <label className="noteDepth">
          Depth
          <input
            type="number"
            min={0}
            value={value.authorNoteDepth ?? ''}
            placeholder={stackDepth === undefined ? '' : String(stackDepth)}
            onChange={(e) =>
              set({ authorNoteDepth: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <p className="hint">
          Messages from the end of the history. 0 is after the last message. Empty uses the stack
          block's depth.
        </p>
      </details>

      <details>
        <summary>Prompt Options</summary>
        <label className="chatSettingsPick">
          <select
            value={shownStackId ?? ''}
            // Disabled on a chat with its own stack: this control writes the global one, and a
            // control that appears to set the session's stack while setting every other chat's is
            // the scope trap CLAUDE.md warns about. Section 14b adds the session-stack control.
            disabled={ownStackId !== undefined}
            onChange={(e) => useSettings.setState({ activeStackId: Number(e.target.value) })}
          >
            {chatStacks.length === 0 && <option value="">No stacks</option>}
            {chatStacks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {ownStackId !== undefined && <p className="hint">This chat has its own stack.</p>}
        {stack && <PromptToggles stack={stack} onChange={saveStack} />}
      </details>

      <details>
        <summary>Parameters</summary>
        {connection ? (
          <>
            <p className="hint">
              These are the connection's parameters. Changes apply to every chat using it.
            </p>
            <ConnectionParams connection={connection} />
          </>
        ) : (
          <p className="hint">Pick an active connection in Settings to set parameters.</p>
        )}
      </details>

      {/* Palette-driven display: these write to the active palette (chat width can carry a per-chat
          override). Distinct from user-level appearance, see the split into Palette vs Appearance. */}
      <details>
        <summary>Palette</summary>
        <label className="chatWidth">
          <span>Chat width</span>
          <input
            type="range"
            min={20}
            max={100}
            value={value.chatWidth ?? palette.chatWidth}
            onChange={(e) => set({ chatWidth: Number(e.target.value) })}
          />
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={value.chatWidth ?? palette.chatWidth}
            onChange={(e) => set({ chatWidth: clampWidth(Number(e.target.value)) })}
          />
          %
        </label>
        <p className="hint">Overrides the chat width in the palette.</p>
        <AppearancePanel colors={false} font="compact" />
      </details>

      {/* Single-chat counterpart to Group Settings, a chat is single or group, never both. Holds the
          one character's colors (written to the character record, so palette-agnostic). */}
      {!isGroup(value) && (
      <details>
        <summary>Chat Settings</summary>
        <label
          className="checkboxRow"
          title="Hides the reasoning collapsible block on assistant messages. Visual only, the reasoning is still stored and sent to the model."
        >
          <input
            type="checkbox"
            checked={appearance.showReasoning}
            onChange={(e) => setAppearance({ showReasoning: e.target.checked })}
          />
          Show reasoning
        </label>
        <SpeakerColors chat={value} />
      </details>
      )}

      {/* Sections contributed by other modules. Order is module registration order (main.tsx). */}
      {chatPanels(enabledPlugins).map(({ label, component: Panel }) => (
        <details key={label}>
          <summary>{label}</summary>
          <Panel />
        </details>
      ))}

      {isGroup(value) && (
      <details>
        <summary>Group Settings</summary>
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={!!value.selfReply}
            onChange={(e) => set({ selfReply: e.target.checked })}
          />
          Self-reply
        </label>

        {value.selfReply && (
          <>
            <label className="replyCount">
              Replies per message
              <input
                type="number"
                min={1}
                value={value.selfReplyCount ?? 1}
                onChange={(e) => set({ selfReplyCount: Number(e.target.value) })}
              />
            </label>
            <p className="hint">
              Characters reply in order after your message. Capped at {roster} in this chat, so
              nobody speaks twice.
            </p>
          </>
        )}
      </details>
      )}

      {debugMode && (
      <details>
        <summary>Prompt preview</summary>
        <PromptPanel />
      </details>
      )}
      </fieldset>
    </section>
  )
}
