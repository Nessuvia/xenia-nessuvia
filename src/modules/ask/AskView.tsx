import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { RiChatSettingsLine, RiCloseLine } from '@remixicon/react'
import { Avatar } from '../../app/Avatar'
import { CollapseButton } from '../../app/CollapseButton'
import { assistantName, useAsk } from '../../core/stores/askStore'
import {
  defaultAssistantPrompt,
  useAppearance,
  useSettings,
} from '../../core/stores/settingsStore'
import { usePalette } from '../../core/stores/palettesStore'
import { effectiveFont } from '../../core/palette/palette'
import { displayName, useCharacters } from '../../core/stores/charactersStore'
import { emptyColors } from '../../core/storage/types'
import EntityPicker, { type PickerItem } from '../../app/EntityPicker'
import { oldMessageInstruction } from '../../core/prompt/rewrite'
import { renderText } from '../chat/renderText'
import MessageBubble, { colorVars } from '../chat/MessageBubble'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import '../../app/sideDrawer.css'

// System prompt, the text appended after every message, and the assistant prompt shown once a
// character is picked. All global settings.
function AskSettings({ className, style }: { className: string; style: CSSProperties }) {
  const askSystemPrompt = useSettings((s) => s.askSystemPrompt)
  const askSuffix = useSettings((s) => s.askSuffix)
  const askCharacterId = useSettings((s) => s.askCharacterId)
  const askAssistantPrompt = useSettings((s) => s.askAssistantPrompt)
  const setAsk = useSettings((s) => s.setAsk)

  return (
    <aside className={`panel askSidebar ${className}`} style={style}>
      <h3>Ask</h3>
      <label className="askField">
        System prompt
        <textarea
          rows={10}
          value={askSystemPrompt}
          onChange={(e) => setAsk({ askSystemPrompt: e.target.value })}
        />
      </label>
      <label className="askField">
        Sent after each message
        <textarea rows={6} value={askSuffix} onChange={(e) => setAsk({ askSuffix: e.target.value })} />
      </label>
      {askCharacterId !== null && (
        <label className="askField">
          Assistant prompt
          <textarea
            rows={8}
            value={askAssistantPrompt}
            placeholder={defaultAssistantPrompt}
            onChange={(e) => setAsk({ askAssistantPrompt: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setAsk({ askAssistantPrompt: defaultAssistantPrompt })}
          >
            Use default
          </button>
        </label>
      )}
    </aside>
  )
}

// One character at a time, saved globally. "None" sends no character framing at all.
// Same picker Write uses to add a cast member.
function CharacterSelect() {
  const characters = useCharacters((s) => s.characters)
  const askCharacterId = useSettings((s) => s.askCharacterId)
  const setAsk = useSettings((s) => s.setAsk)
  const [picking, setPicking] = useState(false)
  const picked = characters.find((c) => c.id === askCharacterId)

  // The key is the id, or 'none' for the row that clears the selection.
  const items: PickerItem[] = [
    ...(picked ? [{ key: 'none', label: 'None' }] : []),
    ...characters
      .filter((c) => c.id !== askCharacterId)
      .map((c) => ({
        key: String(c.id),
        label: displayName(c),
        avatar: c.avatar,
        avatarCrop: c.avatarCrop,
      })),
  ]

  // The button keeps its place in the header and the picker floats over the transcript, so
  // opening it doesn't push the messages down.
  return (
    <div className="askCharacterField">
      <button
        type="button"
        className="askCharacterSelect"
        aria-expanded={picking}
        onClick={() => setPicking(!picking)}
      >
        {picked && <Avatar of={picked} />}
        {picked ? displayName(picked) || 'Unnamed' : 'No character'}
      </button>
      {picking && (
        <EntityPicker
          items={items}
          placeholder="Search characters..."
          emptyText="No characters."
          onCancel={() => setPicking(false)}
          onPick={(item) => {
            setAsk({ askCharacterId: item.key === 'none' ? null : Number(item.key) })
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}

export default function AskView() {
  const {
    turns,
    streaming,
    streamingText,
    streamingReasoning,
    regeneratingId,
    error,
    send,
    stop,
    newChat,
    regenerate,
    swipeTo,
    deleteSwipes,
    editMessage,
    deleteMessage,
    dismissError,
  } = useAsk()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const loadCharacters = useCharacters((s) => s.load)
  // Subscribed so the header name and colors follow a character edit without a reload.
  const characters = useCharacters((s) => s.characters)
  const askCharacterId = useSettings((s) => s.askCharacterId)
  const character = characters.find((c) => c.id === askCharacterId)
  // Which turn has the regen modal open. Lives here so an empty composer submit could open it.
  const [rewritingId, setRewritingId] = useState<number | null>(null)
  const phone = useMediaQuery('(max-width: 700px)')
  // session-local, not persisted. Move to settingsStore if it should survive reloads.
  // On a phone the panel is a drawer: closed on arrival, swipe from the right edge opens it.
  const [panelOpen, setPanelOpen] = useState(!phone)
  const drawer = useSideDrawer({
    side: 'right',
    enabled: phone,
    open: panelOpen,
    setOpen: setPanelOpen,
  })
  // Same display pass as Chat: tag rules, replace rules and marker colours all apply here.
  const appearance = useAppearance()
  const palette = usePalette()
  const renderOpts = {
    tagRules: appearance.tagRules,
    replaceRules: appearance.replaceRules,
    order: palette.colorOrder,
  }
  // Ask has no persona and no roster, so the assistant is either the picked card or nobody.
  const replyName = character ? displayName(character) : 'Assistant'
  const replyColors = character?.colors ?? emptyColors()

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  // Crossing the phone breakpoint: docked means open, drawer means closed.
  useEffect(() => {
    setPanelOpen(!phone)
  }, [phone])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, streamingText])

  function submit() {
    if (streaming || !text.trim()) return
    send(text)
    setText('')
  }

  return (
    <div
      className="ask"
      // Same appearance vars as ChatView; an empty value falls through to the fallback in ask.css.
      style={
        {
          '--chatFont': effectiveFont(palette) || '',
          '--chatFontSize': palette.fontSize ? `${palette.fontSize}px` : '',
          '--chatLineHeight': palette.lineHeight || '',
          '--textColor': palette.textColor || '',
          '--emphasisColor': palette.emphasisColor || '',
          '--boldColor': palette.boldColor || '',
          '--quoteColor': palette.quoteColor || '',
        } as CSSProperties
      }
    >
      {phone && !panelOpen && (
        <div className="drawerOpenButtons">
          <button
            type="button"
            className="drawerOpenButton"
            title="Open Ask panel"
            aria-label="Open Ask panel"
            onClick={() => setPanelOpen(true)}
          >
            <RiChatSettingsLine size={20} />
          </button>
        </div>
      )}

      <div className="askMain">
        <div className="askHeader">
          <CharacterSelect />
          <button type="button" onClick={newChat} disabled={!turns.length && !streaming}>
            New chat
          </button>
          {/* Phones open the panel with the fixed drawer button instead. */}
          {!phone && (
            <CollapseButton
              label="Ask settings"
              collapsed={!panelOpen}
              onToggle={() => setPanelOpen(!panelOpen)}
            />
          )}
        </div>

        {/* .messageList and the whole MessageBubble chrome come from chat.css. */}
        <div className="messageList askTranscript">
          {!turns.length && !streaming && <p className="placeholder">No messages.</p>}
          {turns.map((turn, i) => (
            <MessageBubble
              key={turn.id}
              message={turn}
              who={turn.role === 'user' ? 'You' : replyName}
              avatar={turn.role === 'user' ? null : (character ?? null)}
              colors={turn.role === 'user' ? emptyColors() : replyColors}
              canRegenerate={turn.role === 'assistant' && !streaming}
              // Ask has no card greeting: the first turn is whatever you typed.
              greeting={false}
              streamingText={regeneratingId === turn.id ? streamingText : null}
              streamingReasoning={regeneratingId === turn.id ? streamingReasoning : ''}
              defaultInstruction={() => oldMessageInstruction(turns.slice(i + 1), assistantName())}
              rewriting={rewritingId === turn.id}
              onRewriteOpen={(open) => setRewritingId(open ? turn.id! : null)}
              onEdit={(content) => editMessage(turn.id!, content)}
              onDelete={() => deleteMessage(turn.id!)}
              onRegenerate={() => regenerate(turn.id!)}
              onRewrite={(instruction) => regenerate(turn.id!, instruction)}
              onSwipe={(index) => swipeTo(turn.id!, index)}
              onDeleteSwipes={(indices) => deleteSwipes(turn.id!, indices)}
            />
          ))}
          {streaming && regeneratingId === null && (
            <div className="bubble message assistant" style={colorVars(replyColors, palette.overwriteCharColor)}>
              <div className="messageHeader">
                <span className="messageWho">{replyName}</span>
              </div>
              {appearance.showReasoning && streamingReasoning && (
                <details className="taggedBlock reasoningBlock">
                  <summary>Reasoning</summary>
                  {renderText(streamingReasoning, { ...renderOpts, role: 'assistant' })}
                </details>
              )}
              <div className="messageBody">
                {renderText(streamingText, { ...renderOpts, role: 'assistant' })}
                <span className="caret">▌</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="askError">
            <span>{error}</span>
            <button type="button" onClick={dismissError} aria-label="Dismiss">
              <RiCloseLine size={16} />
            </button>
          </div>
        )}

        <div className="askComposer">
          <textarea
            rows={3}
            value={text}
            placeholder="Message…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          {streaming ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" disabled={!text.trim()} onClick={submit}>
              Send
            </button>
          )}
        </div>
      </div>

      {/* On a phone it stays mounted so it can slide, and the drawer classes park it off-screen. */}
      {(phone || panelOpen) && <AskSettings className={drawer.className} style={drawer.style} />}
    </div>
  )
}
