import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { RiDeleteBinLine, RiRobot2Line, RiSparkling2Line } from '@remixicon/react'
import { useParams } from 'react-router-dom'
import { useChats } from '../../core/stores/chatStore'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { useAppearance, useSettings, useActiveConnection } from '../../core/stores/settingsStore'
import { usePalette } from '../../core/stores/palettesStore'
import { effectiveFont } from '../../core/palette/palette'
import { usePersonas } from '../../core/stores/personasStore'
import { useDraft } from '../../core/stores/draftStore'
import MessageBubble, { colorVars } from './MessageBubble'
import Composer from './Composer'
import RosterBar from './RosterBar'
import ResponderPicker from './ResponderPicker'
import { isNarrator } from '../../core/multiplayer/narrator'
import DeleteRangeDialog from './DeleteRangeDialog'
import { renderText } from './renderText'
import { oldMessageInstruction } from '../../core/prompt/rewrite'
import { emptyColors } from '../../core/storage/types'
import { participants } from '../../core/stores/roster'
import { useBlips } from '../../core/stores/blipStore'
import { resolveChatAgent } from '../../core/agent/agentConfig'
import { agentSegments } from './agentSegments'
import { TrackerFloat } from './TrackerPanel'
import AgentStream from './AgentStream'

export default function ChatView() {
  const chatId = Number(useParams().chatId)
  const {
    chat,
    messages,
    streamingText,
    streamingReasoning,
    streaming,
    streamingChatId,
    error,
    trimmedCount,
    miscPrompts,
    regeneratingId,
    speakingName,
    speakingId,
    load,
    send,
    retry,
    retryLast,
    clearError,
    patchChat,
    regenerate,
    swipeTo,
    stop,
    editMessage,
    deleteMessage,
    deleteMessages,
    deleteSwipes,
    passing,
    streamingPending,
    streamingStage,
    passMessage,
    revertMessagePass,
    dismissPassFailure,
  } = useChats()
  const { characters, load: loadCharacters } = useCharacters()
  const connection = useActiveConnection()
  const personas = usePersonas((s) => s.personas)
  const ensurePersona = usePersonas((s) => s.ensureActive)
  const activePersonaId = useSettings((s) => s.activePersonaId)
  const appearance = useAppearance()
  const agentConfig = useSettings((s) => s.agent)
  const palette = usePalette()
  const activePersona = personas.find((p) => p.id === activePersonaId)
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  // Our own scroll-to-bottom fires onScroll too. Without this it lands after the user's scroll
  // event and re-sticks them: scrolling up mid-stream would snap back.
  const selfScroll = useRef(false)
  // Which message has the regen modal open. Lives here: an empty composer submit can open it.
  const [rewritingId, setRewritingId] = useState<number | null>(null)
  const [deletingRange, setDeletingRange] = useState(false)
  // Which message has its inline edit box open. On a phone the composer hides while it does, the
  // edit box and the composer together leave almost no room for the message.
  const [editingId, setEditingId] = useState<number | null>(null)

  useEffect(() => {
    load(chatId)
    // The draft belongs to the chat you typed it in.
    useDraft.getState().setText('')
    // `chat` stays loaded after you leave. The store needs telling when it's actually on screen.
    useChats.getState().setViewing(chatId)
    return () => useChats.getState().setViewing(null)
  }, [chatId, load])

  // Opening any chat of a character is enough to say you've seen what it said.
  useEffect(() => {
    if (chat) useBlips.getState().clear(chat.characterId)
  }, [chat])

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  useEffect(() => {
    ensurePersona()
  }, [ensurePersona])

  // Follow new content, but never yank you back down while you're reading further up.
  useEffect(() => {
    const el = scroller.current
    if (el && stuck.current && el.scrollTop !== el.scrollHeight) {
      selfScroll.current = true
      el.scrollTop = el.scrollHeight
    }
  })

  const character = characters.find((c) => c.id === chat?.characterId)

  if (!chat || !character) return <p className="placeholder">Loading…</p>
  const agent = resolveChatAgent(agentConfig, chat.agent)
  // Stylized hands over its own marks and streams plainly until they arrive. A manual pass in a
  // chat with the agent off streams plainly too.
  const stylized = (agentConfig.style ?? 'stylized') === 'stylized'
  const segments =
    streamingStage?.marks ?? agentSegments(streamingText, streamingPending, agent.enabled && !stylized ? agent.display : 'blur', passing)

  /** The card a message was written by, when it's still around, for the avatar and the re-roll. */
  const speakerOf = (speakerId?: number) =>
    speakerId === undefined ? character : characters.find((c) => c.id === speakerId)

  return (
    // Visual settings arrive as CSS vars on this element: a new knob is a var plus a control.
    <div
      className="chatView"
      style={
        {
          // The chat's own width wins over the palette's default; see CLAUDE.md on specificity.
          '--chatWidth': `${chat.chatWidth ?? palette.chatWidth}%`,
          // An empty value falls through to the var's fallback in chat.css: "off" costs nothing.
          '--chatFont': effectiveFont(palette) || '',
          '--chatFontSize': palette.fontSize ? `${palette.fontSize}px` : '',
          '--chatLineHeight': palette.lineHeight || '',
          '--textColor': palette.textColor || '',
          '--emphasisColor': palette.emphasisColor || '',
          '--boldColor': palette.boldColor || '',
          '--quoteColor': palette.quoteColor || '',
          '--agentBeat': streamingStage ? `${streamingStage.beat}ms` : '',
        } as CSSProperties
      }
    >
      <TrackerFloat />
      <div className="chatViewHeader">
        {titleDraft === null ? (
          <h2 onClick={() => setTitleDraft(chat.title)} title="Rename chat">
            {chat.title}
          </h2>
        ) : (
          <input
            className="titleEdit"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              patchChat({ title: titleDraft.trim() || chat.title })
              setTitleDraft(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') setTitleDraft(null)
            }}
          />
        )}
      </div>

      <div
        className="messageList"
        ref={scroller}
        onScroll={(e) => {
          if (selfScroll.current) {
            selfScroll.current = false
            return
          }
          const el = e.currentTarget
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
        }}
      >
        {/* `who` on a user turn is the name recorded at send time, a deleted persona still gets credited. */}
        {messages.map((m, i) =>
          m.divider ? (
            <div className="chatBreak" key={m.id}>
              <button
                className="chatBreakDelete"
                title="Delete break"
                onClick={() => deleteMessage(m.id!)}
              >
                <RiDeleteBinLine size={16} />
              </button>
            </div>
          ) : (
          <MessageBubble
            key={m.id}
            message={m}
            who={
              m.role === 'user'
                ? (m.personaName ?? activePersona?.name ?? 'User')
                : // Display name of the speaker if the card still exists; the stamped name keeps
                  // a deleted character's old messages attributed.
                  ((s) => (s ? displayName(s) : (m.speakerName ?? character.name)))(
                    speakerOf(m.speakerId),
                  )
            }
            avatar={
              m.role === 'user'
                ? (personas.find((p) => p.id === m.personaId) ?? null)
                : (speakerOf(m.speakerId) ?? null)
            }
            colors={
              (m.role === 'user'
                ? personas.find((p) => p.id === m.personaId)?.colors
                : speakerOf(m.speakerId)?.colors) ?? emptyColors()
            }
            canRegenerate={m.role === 'assistant' && !streaming}
            greeting={i === 0 && m.role === 'assistant'}
            streamingText={regeneratingId === m.id ? streamingText : null}
            streamingReasoning={regeneratingId === m.id ? streamingReasoning : ''}
            defaultInstruction={() =>
              oldMessageInstruction(
                messages.slice(i + 1),
                m.speakerName ?? character.name,
                miscPrompts,
              )
            }
            rewriting={rewritingId === m.id}
            onRewriteOpen={(open) => setRewritingId(open ? m.id! : null)}
            onEdit={(content) => editMessage(m.id!, content)}
            onEditingChange={(on) =>
              setEditingId((cur) => (on ? m.id! : cur === m.id ? null : cur))
            }
            onReprompt={
              m.role === 'user' && i === messages.length - 1 && !streaming
                ? () => retry(character, chat.respondWith)
                : undefined
            }
            onDelete={() => deleteMessage(m.id!)}
            onRegenerate={() => regenerate(character, m.id!)}
            onRewrite={(instruction) => regenerate(character, m.id!, instruction)}
            onSwipe={(index) => swipeTo(m.id!, index)}
            onDeleteSwipes={(indices) => deleteSwipes(m.id!, indices)}
            onPass={m.role === 'assistant' && !streaming ? () => passMessage(m.id!) : undefined}
            onPassRevert={() => revertMessagePass(m.id!)}
            onPassDismiss={() => dismissPassFailure(m.id!)}
            passing={regeneratingId === m.id && passing}
            streamingSegments={segments}
          />
          ),
        )}

        {streaming && streamingChatId === chat.id && regeneratingId === null && (
          // Same per-speaker color vars MessageBubble sets: the stream is colored the moment it
          // starts typing.
          <div className="bubble message assistant" style={colorVars(speakerOf(speakingId ?? undefined)?.colors ?? emptyColors(), palette.overwriteCharColor)}>
            <div className="messageHeader">
              <span className="messageWho">
                {/* Matches MessageBubble's header: the icon is there from the first token rather
                    than appearing once the reply is stored. */}
                {isNarrator(speakingId ?? undefined) && (
                  <RiRobot2Line className="avatar messageAvatar narratorAvatar" size={18} />
                )}
                {speakingName || character.name}
              </span>
            </div>
            {/* Collapsed from the start: an open block grows as tokens arrive and shoves the
                summary out from under the pointer. */}
            {appearance.showReasoning && streamingReasoning && (
              <details className="taggedBlock reasoningBlock">
                <summary>Reasoning</summary>
                {renderText(streamingReasoning, { tagRules: appearance.tagRules, order: palette.colorOrder })}
              </details>
            )}
            {/* A pass stage is overwriting the reply that just finished: what's on screen is
                being replaced as it arrives. */}
            {passing && (
              <p className="passMarker">
                <RiSparkling2Line size={14} />
                Passing
              </p>
            )}
            <div className="messageBody">
              {/* Mid-stream an opener has no closer yet. The block looks like plain text
                  until the model finishes it and folds away. */}
              <AgentStream segments={segments} render={(t) => renderText(t, { tagRules: appearance.tagRules, order: palette.colorOrder })} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="chatError">
          {error}{' '}
          <button type="button" onClick={() => retryLast(character)}>
            Retry
          </button>{' '}
          <button type="button" className="secondary" onClick={clearError}>
            Dismiss
          </button>
        </p>
      )}

      {trimmedCount > 0 && (
        <p className="trimNote">
          {trimmedCount} older message{trimmedCount === 1 ? '' : 's'} trimmed to fit the context
          limit.
        </p>
      )}

      <div className={editingId !== null ? 'chatBottomBar editingOpen' : 'chatBottomBar'}>
        <RosterBar
          chat={chat}
          characters={characters}
          disabled={streaming}
          onSpeak={(id) => retry(character, id)}
          // characterId stays pinned to the first participant: the chat list, titles and every
          // Phase 1 query still read it.
          onChange={(participantIds) =>
            patchChat({ participantIds, characterId: participantIds[0] })
          }
        />

        <div className="chatToolbar">
          {/* Shown in a solo chat too, not only a group: the Narrator is always a choice, and
              picking it is how you hold a narrated stretch without retyping /narrate. */}
          <ResponderPicker
            chat={chat}
            characters={characters}
            withNarrator
            onPick={(id) => patchChat({ respondWith: id })}
          />
          <button
            type="button"
            title="Delete a range of messages"
            disabled={messages.length === 0}
            onClick={() => setDeletingRange(true)}
          >
            <RiDeleteBinLine size={16} />
          </button>
        </div>
      </div>

      {deletingRange && (
        <DeleteRangeDialog
          messages={messages}
          onClose={() => setDeletingRange(false)}
          onConfirm={async (ids) => {
            setDeletingRange(false)
            await deleteMessages(ids)
          }}
        />
      )}

      <div className={editingId !== null ? 'chatComposerSlot editingOpen' : 'chatComposerSlot'}>
        <Composer
          streaming={streaming}
          disabledReason={connection ? '' : 'No active connection, set one up in Settings.'}
          commandTargets={participants(chat)
            .map((id) => characters.find((c) => c.id === id))
            .filter((c) => !!c)
            .map((c) => ({ id: c.id!, name: displayName(c), avatar: c.avatar }))}
          onSend={(text) => send(character, text, chat.respondWith)}
          onStop={stop}
          onRegenLast={() => {
            const last = messages.at(-1)
            if (last?.role === 'assistant') setRewritingId(last.id!)
          }}
        />
      </div>
    </div>
  )
}
