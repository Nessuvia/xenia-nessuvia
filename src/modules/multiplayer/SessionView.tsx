import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'
import { useMultiplayer, isMyTurn, currentHolder } from '../../core/stores/multiplayerStore'
import { useChats } from '../../core/stores/chatStore'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { usePalette } from '../../core/stores/palettesStore'
import { useAppearance, useActiveConnection } from '../../core/stores/settingsStore'
import { effectiveFont } from '../../core/palette/palette'
import type { MarkerKind } from '../../core/stores/settingsStore'
import { activeSession } from '../../core/multiplayer/hostSession'
import { guestSay } from '../join/JoinView'
import { narratorId, narratorName as defaultNarratorName } from '../../core/multiplayer/narrator'
import type { RosterCharacter } from '../../core/multiplayer/protocol'
import { emptyColors } from '../../core/storage/types'
import { RiGroupLine, RiSettings3Line } from '@remixicon/react'
import MessageBubble, { colorVars } from '../chat/MessageBubble'
import Composer from '../chat/Composer'
import ChatSettingsPanel from '../chat/ChatSettingsPanel'
import ResponderPicker from '../chat/ResponderPicker'
import { renderText } from '../chat/renderText'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import '../../app/sideDrawer.css'
import CharacterColumn from './CharacterColumn'
import MultiplayerPanel from './MultiplayerPanel'
import './multiplayer.css'

/**
 * The room. One shell for the host and for guests: the same three panels, the same message list,
 * the same composer. What differs is who may change things, the host admits, kicks and reorders
 * people and writes the Narrator prompt; guests read.
 */
export default function SessionView(): JSX.Element {
  const isHost = useMultiplayer((s) => s.role !== 'guest')
  return <Room isHost={isHost} />
}

/** The text look the room paints with. The host's palette, or what the host sent guests. */
interface RoomLook {
  font: string
  fontSize: number
  lineHeight: number
  textColor: string
  emphasisColor: string
  boldColor: string
  quoteColor: string
  overwriteCharColor: boolean
  colorOrder: MarkerKind[]
}

function Room({ isHost }: { isHost: boolean }): JSX.Element {
  const characters = useMultiplayer((s) => s.characters)
  const narratorName = useMultiplayer((s) => s.narratorName)
  const settings = useMultiplayer((s) => s.settings)
  const shared = useMultiplayer((s) => s.appearance)
  const palette = usePalette()
  // Host-side reads. The first two mark who is speaking in the left panel; the last two are read
  // only to subscribe. The host's messages live in chatStore. Without them the shell would not
  // re-render on a new message, and the effect below would stop following the bottom.
  const streaming = useChats((s) => s.streaming)
  const speakingId = useChats((s) => s.speakingId)
  const messageCount = useChats((s) => s.messages.length)
  const hostStreamLength = useChats((s) => s.streamingText.length)
  void messageCount
  void hostStreamLength
  const [leftShut, setLeftShut] = useState(false)
  const [rightShut, setRightShut] = useState(false)
  // A phone gets the message column and nothing else; the two side panels become drawers on their
  // own edges, opened by the buttons at the top right. One at a time, either one covers the
  // screen. Both open would only mean one of them is buried.
  //
  // Neither opens on a swipe: the navbar already owns the left-to-right swipe, and a room with two
  // panels has no way to say which one a swipe from the right meant. A swipe closes whichever is
  // open, which is the half that matters once you are looking at one.
  const phone = useMediaQuery('(max-width: 700px)')
  const [openPanel, setOpenPanel] = useState<'session' | 'room' | null>(null)
  const leftDrawer = useSideDrawer({
    side: 'left',
    enabled: phone,
    swipeOpen: false,
    open: openPanel === 'session',
    setOpen: (next) => setOpenPanel(next ? 'session' : null),
  })
  const rightDrawer = useSideDrawer({
    side: 'right',
    enabled: phone,
    swipeOpen: false,
    open: openPanel === 'room',
    setOpen: (next) => setOpenPanel(next ? 'room' : null),
  })
  const [linkCopied, setLinkCopied] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)

  // Follow new content, but never yank you back down while you're reading further up.
  useEffect(() => {
    const el = scroller.current
    if (el && stuck.current) el.scrollTop = el.scrollHeight
  })

  // Guests render the host's look: everyone sees one scene. Before the first `state` lands there
  // is nothing to render from, and the local palette stands in.
  const look: RoomLook =
    !isHost && shared
      ? shared
      : {
          font: effectiveFont(palette),
          fontSize: palette.fontSize,
          lineHeight: palette.lineHeight,
          textColor: palette.textColor,
          emphasisColor: palette.emphasisColor,
          boldColor: palette.boldColor,
          quoteColor: palette.quoteColor,
          overwriteCharColor: palette.overwriteCharColor,
          colorOrder: palette.colorOrder,
        }

  // A guest arrived through the link: its own URL is the invite. The host asks the session.
  const roomLink = () => (isHost ? activeSession()?.link : window.location.href)

  return (
    <div
      className="multiplayerRoom"
      style={
        {
          '--chatWidth': '100%',
          '--chatFont': look.font || '',
          '--chatFontSize': look.fontSize ? `${look.fontSize}px` : '',
          '--chatLineHeight': look.lineHeight || '',
          '--textColor': look.textColor || '',
          '--emphasisColor': look.emphasisColor || '',
          '--boldColor': look.boldColor || '',
          '--quoteColor': look.quoteColor || '',
        } as CSSProperties
      }
    >
      {phone && (
        <div className="drawerOpenButtons">
          <button
            type="button"
            className="drawerOpenButton"
            title="Open Session panel"
            aria-label="Open Session panel"
            onClick={() => setOpenPanel('session')}
          >
            <RiGroupLine size={20} />
          </button>
          <button
            type="button"
            className="drawerOpenButton"
            title="Open Room panel"
            aria-label="Open Room panel"
            onClick={() => setOpenPanel('room')}
          >
            <RiSettings3Line size={20} />
          </button>
        </div>
      )}

      {leftShut && !phone ? (
        <CollapseRail label="Session" onToggle={() => setLeftShut(false)} />
      ) : (
        <aside className={`multiplayerPanel left ${leftDrawer.className}`} style={leftDrawer.style}>
          <header className="panelHeader">
            <h3>Session</h3>
            <CollapseButton
              label="Session"
              collapsed={false}
              onToggle={() => (phone ? setOpenPanel(null) : setLeftShut(true))}
            />
          </header>
          <div className="panelContent">
            <button
              type="button"
              className="sessionLinkCopy"
              onClick={() => {
                const link = roomLink()
                if (link) navigator.clipboard.writeText(link).then(() => setLinkCopied(true))
              }}
            >
              {linkCopied ? 'Copied' : 'Copy room link'}
            </button>
            {settings && (
              <p className="sessionSummary">
                <SessionTitle title={settings.title} isHost={isHost} /> ·{' '}
                {settings.characterCount} character
                {settings.characterCount === 1 ? '' : 's'}
              </p>
            )}
            <CharacterColumn
              characters={characters}
              narratorName={narratorName}
              speakingId={isHost && streaming ? (speakingId ?? undefined) : undefined}
            />
            {/* Host only: it reads the open chat, which a guest's tab does not have. */}
            {isHost && <ChatSettingsPanel />}
          </div>
        </aside>
      )}

      <main className="multiplayerPanel middle">
        <div
          className="messageList"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget
            stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
          }}
        >
          {isHost ? <HostMessages look={look} /> : <GuestMessages look={look} />}
        </div>

        {isHost ? <HostBar /> : <GuestBar />}
      </main>

      {rightShut && !phone ? (
        <CollapseRail label="Room" onToggle={() => setRightShut(false)} />
      ) : (
        <aside className={`multiplayerPanel right ${rightDrawer.className}`} style={rightDrawer.style}>
          <header className="panelHeader">
            <h3>Room</h3>
            {/* On a phone the chevron points the way the drawer leaves. */}
            <CollapseButton
              label="Room"
              collapsed={phone}
              onToggle={() => (phone ? setOpenPanel(null) : setRightShut(true))}
            />
          </header>
          <div className="panelContent">
            <MultiplayerPanel isHost={isHost} />
          </div>
        </aside>
      )}
    </div>
  )
}

/** The chat's name. The host clicks to rename it; a guest reads it. Per-chat: it writes the
 *  session's own Chat row and nothing wider. */
function SessionTitle({ title, isHost }: { title: string; isHost: boolean }): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)

  if (!isHost || !editing) {
    return isHost ? (
      <button
        type="button"
        className="sessionTitleEdit"
        onClick={() => {
          setDraft(title)
          setEditing(true)
        }}
      >
        {title || 'Untitled chat'}
      </button>
    ) : (
      <span>{title || 'Untitled chat'}</span>
    )
  }

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== title) void activeSession()?.setTitle(next)
  }

  return (
    <input
      className="sessionTitleInput"
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
      }}
    />
  )
}

// --- the host's half -----------------------------------------------------

function HostMessages({ look }: { look: RoomLook }): JSX.Element | null {
  const chat = useChats((s) => s.chat)
  const messages = useChats((s) => s.messages)
  const streaming = useChats((s) => s.streaming)
  const streamingChatId = useChats((s) => s.streamingChatId)
  const streamingText = useChats((s) => s.streamingText)
  const streamingReasoning = useChats((s) => s.streamingReasoning)
  const speakingName = useChats((s) => s.speakingName)
  const speakingId = useChats((s) => s.speakingId)
  const error = useChats((s) => s.error)
  const editMessage = useChats((s) => s.editMessage)
  const deleteMessage = useChats((s) => s.deleteMessage)
  const swipeTo = useChats((s) => s.swipeTo)
  const deleteSwipes = useChats((s) => s.deleteSwipes)
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const appearance = useAppearance()

  const character = characters.find((c) => c.id === chat?.characterId)
  if (!chat || !character) return <p className="placeholder">Loading…</p>

  /** The card a message was written by, when it's still around, for the avatar and the name. */
  const speakerOf = (speakerId?: number) =>
    speakerId === undefined ? character : characters.find((c) => c.id === speakerId)

  return (
    <>
      {messages.map((m, i) => (
        <MessageBubble
          key={m.id}
          message={m}
          who={
            m.role === 'user'
              ? (m.personaName ?? 'User')
              : ((s) => (s ? displayName(s) : (m.speakerName ?? character.name)))(
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
          canRegenerate={false}
          greeting={i === 0 && m.role === 'assistant'}
          streamingText={null}
          streamingReasoning=""
          defaultInstruction={() => ''}
          rewriting={false}
          onRewriteOpen={() => {}}
          onEdit={(content) => editMessage(m.id!, content)}
          onDelete={() => deleteMessage(m.id!)}
          onRegenerate={() => {}}
          onRewrite={() => {}}
          onSwipe={(index) => swipeTo(m.id!, index)}
          onDeleteSwipes={(indices) => deleteSwipes(m.id!, indices)}
        />
      ))}

      {streaming && streamingChatId === chat.id && (
        <div
          className="bubble message assistant"
          style={colorVars(
            speakerOf(speakingId ?? undefined)?.colors ?? emptyColors(),
            look.overwriteCharColor,
          )}
        >
          <div className="messageHeader">
            <span className="messageWho">{speakingName || character.name}</span>
          </div>
          {appearance.showReasoning && streamingReasoning && (
            <details className="taggedBlock reasoningBlock" open>
              <summary>Reasoning</summary>
              {renderText(streamingReasoning, {
                tagRules: appearance.tagRules,
                order: look.colorOrder,
              })}
            </details>
          )}
          <div className="messageBody">
            {renderText(streamingText, { tagRules: appearance.tagRules, order: look.colorOrder })}
            <span className="caret">▌</span>
          </div>
        </div>
      )}

      {error && <p className="chatError">{error}</p>}
    </>
  )
}

function HostBar(): JSX.Element | null {
  const chat = useChats((s) => s.chat)
  const streaming = useChats((s) => s.streaming)
  const stop = useChats((s) => s.stop)
  const patchChat = useChats((s) => s.patchChat)
  const characters = useCharacters((s) => s.characters)
  const roster = useMultiplayer((s) => s.characters)
  const connection = useActiveConnection()

  if (!chat) return null

  return (
    <>
      <div className="chatBottomBar">
        <div className="chatToolbar">
          {/* Writes chat.respondWith, the same field an ordinary chat's picker writes. */}
          <ResponderPicker
            chat={chat}
            characters={characters}
            onPick={(id) => patchChat({ respondWith: id })}
            withNarrator
          />
        </div>
      </div>

      <Composer
        streaming={streaming}
        disabledReason={connection ? '' : 'No active connection, set one up in Settings.'}
        commandTargets={roster}
        // Through the session, not chatStore: the session broadcasts the turn and advances it.
        onSend={(text) => {
          void activeSession()?.say(text, chat.respondWith ?? narratorId)
        }}
        onStop={stop}
        onRegenLast={() => {}}
      />
    </>
  )
}

// --- a guest's half ------------------------------------------------------

function GuestMessages({ look }: { look: RoomLook }): JSX.Element {
  const characters = useMultiplayer((s) => s.characters)
  const narratorName = useMultiplayer((s) => s.narratorName)
  const messages = useMultiplayer((s) => s.messages)
  const streaming = useMultiplayer((s) => s.streaming)
  const appearance = useAppearance()

  /** The roster character behind a stream/history name, for its avatar. Untrusted: this is the
   *  only path an avatar can reach the page through. Never a raw string treated as a src. */
  const speakerAvatar = (name: string | undefined) => {
    const found = characters.find((c) => c.name === name)
    return found?.avatar ? { avatar: found.avatar } : null
  }

  return (
    <>
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={{
            id: m.id,
            ownerId: 'local',
            chatId: 0,
            role: m.role,
            content: m.content,
            personaName: m.personaName,
            speakerName: m.speakerName,
            createdAt: m.createdAt,
          }}
          who={m.role === 'user' ? (m.personaName ?? 'User') : (m.speakerName ?? narratorName)}
          avatar={m.role === 'assistant' ? speakerAvatar(m.speakerName) : null}
          colors={emptyColors()}
          canRegenerate={false}
          greeting={false}
          streamingText={null}
          streamingReasoning=""
          defaultInstruction={() => ''}
          rewriting={false}
          onRewriteOpen={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
          onRegenerate={() => {}}
          onRewrite={() => {}}
          onSwipe={() => {}}
          onDeleteSwipes={() => {}}
          readOnly
        />
      ))}

      {streaming && (
        <div
          className="bubble message assistant"
          style={colorVars(emptyColors(), look.overwriteCharColor)}
        >
          <div className="messageHeader">
            <span className="messageWho">{streaming.speakerName || narratorName}</span>
          </div>
          <div className="messageBody">
            {renderText(streaming.text, { tagRules: appearance.tagRules, order: look.colorOrder })}
            <span className="caret">▌</span>
          </div>
        </div>
      )}
    </>
  )
}

function GuestBar(): JSX.Element {
  const characters = useMultiplayer((s) => s.characters)
  const narratorName = useMultiplayer((s) => s.narratorName)
  const myTurn = useMultiplayer(isMyTurn)
  const holder = useMultiplayer(currentHolder)
  const [responderId, setResponderId] = useState<number>(narratorId)

  return (
    <>
      <div className="chatBottomBar">
        <div className="chatToolbar">
          {myTurn ? (
            <GuestResponderPicker
              characters={characters}
              narratorName={narratorName}
              value={responderId}
              onPick={setResponderId}
            />
          ) : (
            <span className="turnHint">{holder ? `${holder.name}'s turn.` : ''}</span>
          )}
        </div>
      </div>

      <Composer
        streaming={false}
        disabledReason={myTurn ? '' : `It is ${holder?.name ?? 'someone else'}'s turn.`}
        // Completed from the roster the host sent; the command itself is read on the host.
        // This side only has to offer the names.
        commandTargets={characters}
        onSend={(text) => guestSay(text, responderId)}
        onStop={() => {}}
        onRegenLast={() => {}}
      />
    </>
  )
}

/** A guest's turn-holder pick. Rides in `say.responderId`, there is no `chat.respondWith` to
 *  write on this side of the wire. */
function GuestResponderPicker({
  characters,
  narratorName,
  value,
  onPick,
}: {
  characters: RosterCharacter[]
  narratorName: string
  value: number
  onPick: (id: number) => void
}): JSX.Element {
  return (
    <select
      className="guestResponderPick"
      value={value}
      onChange={(e) => onPick(Number(e.target.value))}
    >
      <option value={narratorId}>{narratorName || defaultNarratorName}</option>
      {characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}
