import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCodeSSlashLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiMoreLine,
  RiPencilLine,
  RiRefreshLine,
  RiSendPlaneLine,
  RiSparkling2Line,
} from '@remixicon/react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AvatarSource, CharacterColors, Message } from '../../core/storage/types'
import { Avatar } from '../../app/Avatar'
import {
  passFailedFor,
  passOriginalFor,
  passSummaryFor,
  reasoningFor,
  snapshotFor,
  swipeCount,
  swipeIndex,
} from '../../core/stores/swipes'
import { useActiveConnection, useAppearance } from '../../core/stores/settingsStore'
import { reasoningSpan } from '../../core/prompt/reasoning'
import { usePalette } from '../../core/stores/palettesStore'
import { renderText } from './renderText'
import RewriteBox from './RewriteBox'
import PromptInspector from '../../app/PromptInspector'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { useSlopSample } from '../../core/stores/slopStore'


/** Per-speaker color overrides as CSS vars. Only overridden fields are set: an empty '--textColor'
 *  would resolve var() to empty and wipe the global set on .chatView instead of inheriting it.
 *  `overwrite` (the palette's Overwrite Char. Color) drops every override, so the .chatView vars
 *  show through unshadowed and the palette becomes the only source of color. */
export function colorVars(colors: CharacterColors, overwrite: boolean): CSSProperties {
  if (overwrite) return {}
  const style: Record<string, string> = {}
  if (colors.textColor) style['--textColor'] = colors.textColor
  if (colors.emphasisColor) style['--emphasisColor'] = colors.emphasisColor
  if (colors.boldColor) style['--boldColor'] = colors.boldColor
  if (colors.quoteColor) style['--quoteColor'] = colors.quoteColor
  return style as CSSProperties
}

export default function MessageBubble({
  message,
  who,
  avatar,
  colors,
  canRegenerate,
  greeting,
  streamingText,
  streamingReasoning,
  defaultInstruction,
  rewriting,
  onRewriteOpen,
  onEdit,
  onEditingChange,
  onReprompt,
  onDelete,
  onRegenerate,
  onRewrite,
  onSwipe,
  onDeleteSwipes,
  onPass,
  onPassRevert,
  passing = false,
  readOnly = false,
}: {
  message: Message
  who: string
  /** The speaker's picture and its crop; null when they have none or their card is gone. */
  avatar: AvatarSource | null
  /** This speaker's per-character color overrides; empty fields fall through to the global colors. */
  colors: CharacterColors
  canRegenerate: boolean
  /** The seeded greeting message: swipes loop through the other greetings, never regenerate. */
  greeting: boolean
  /** Non-null while this message is being re-rolled: shown in place of its stored content. */
  streamingText: string | null
  /** Reasoning so far for that re-roll; empty when there is none. */
  streamingReasoning: string
  /** Called only when the rewrite box opens, building it quotes every later message. */
  defaultInstruction: () => string
  /** Owned by ChatView: an empty composer submit opens this on the last reply. */
  rewriting: boolean
  onRewriteOpen: (open: boolean) => void
  onEdit: (content: string) => void
  /** Fires when the inline edit box opens and closes. The composer hides while it is open. */
  onEditingChange?: (editing: boolean) => void
  /** Only passed for the last user message: generate a reply to it, as if it were just sent. */
  onReprompt?: () => void
  onDelete: () => void
  onRegenerate: () => void
  onRewrite: (instruction: string) => void
  onSwipe: (index: number) => void
  /** Drop these alternates. Dropping all of them deletes the message. */
  onDeleteSwipes: (indices: number[]) => void
  /** Run Second Sweep over this message, and the retry on a failed one. Omitted by views that
   *  have no pass (Ask, and a multiplayer guest). */
  onPass?: () => void
  /** Put the pre-rewrite text back. */
  onPassRevert?: () => void
  /** A pass stage's candidate is streaming over this message's text right now. */
  passing?: boolean
  /** No action buttons at all. A guest in a session owns none of the transcript. */
  readOnly?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null
  // Through a ref: the parent passes a fresh closure every render, and depending on it would fire
  // the callback on every render rather than on the open/close edge.
  const editingCb = useRef(onEditingChange)
  editingCb.current = onEditingChange
  useEffect(() => editingCb.current?.(editing), [editing])
  const [pickingSwipes, setPickingSwipes] = useState(false)
  // Quick actions is a <details>, but a bare <details> only closes when its own summary is clicked
  // again, it sat open while the pointer went back to the message. Controlled so the standard
  // dropdown dismissal applies: a click anywhere outside, or Escape.
  const [quickActions, setQuickActions] = useState(false)
  const navigate = useNavigate()
  const quickRef = useCloseOnOutside<HTMLDetailsElement>(quickActions, () =>
    setQuickActions(false),
  )
  // Blur commits the edit, so Escape has to say it meant the other thing.
  const cancelled = useRef(false)
  const [inspecting, setInspecting] = useState(false)
  // View state only: the rewrite stays the message either way. Reverting is the quick action.
  const [showOriginal, setShowOriginal] = useState(false)
  const appearance = useAppearance()
  const tagRules = appearance.tagRules
  const replaceRules = appearance.replaceRules
  const palette = usePalette()
  const order = palette.colorOrder

  // A text-completion model writes its thinking inline in the reply rather than on the separate
  // stream channel `message.reasoning` holds. The stored text stays whole; the split happens here,
  // at render, from the connection's markers. `reasoningEnd` on the message is the same offset
  // recorded at save time, for the code that reads a reply without rendering it.
  const reasoningConfig = useActiveConnection()?.template?.reasoning
  const inline =
    message.role === 'assistant' && reasoningConfig?.autoParse
      ? reasoningSpan(message.content, reasoningConfig)
      : null
  const inlineReasoning = inline ? message.content.slice(inline.start, inline.end) : ''
  const bodyText = inline
    ? message.content.slice(inline.end).replace(/^\s+/, '')
    : message.content

  const assistant = message.role === 'assistant'
  const count = swipeCount(message)
  const at = swipeIndex(message)
  // The right arrow at the end re-rolls, the familiar behaviour. The greeting never re-rolls:
  // its arrows loop through the greeting options instead.
  const nextIsNew = !greeting && at >= count - 1
  // The greeting has no model regeneration at all, arrows only cycle the seeded greetings.
  const modelRegen = canRegenerate && !greeting
  // `who` already resolves the speaker's display name (or the stamped name for a deleted card).
  const name = who
  const passOriginal = passOriginalFor(message)
  const passFailure = passFailedFor(message)
  // What the pass did, when it ran. Only the hover title uses it: a line of chrome per message
  // would be louder than the decision deserves.
  const passSummary = passSummaryFor(message)

  return (
    <div className={`bubble message ${message.role}`} style={colorVars(colors, palette.overwriteCharColor)}>
      <div className="messageHeader">
        <span className="messageWho">
          <Avatar of={avatar} className="avatar messageAvatar" />
          {name}
        </span>
        {!readOnly && (
        <span className="messageActions">
          {assistant && (
            <span className="swipes">
              <button
                type="button"
                title={greeting ? 'Previous greeting' : 'Previous alternate'}
                disabled={greeting ? count <= 1 : at === 0 || !canRegenerate}
                onClick={() => onSwipe(greeting ? (at - 1 + count) % count : at - 1)}
              >
                <RiArrowLeftSLine size={16} />
              </button>
              <span className="swipeCount">
                {at + 1}/{count}
              </span>
              <button
                type="button"
                title={greeting ? 'Next greeting' : nextIsNew ? 'Generate another' : 'Next alternate'}
                disabled={greeting ? count <= 1 : !canRegenerate}
                onClick={() =>
                  greeting
                    ? onSwipe((at + 1) % count)
                    : nextIsNew
                      ? onRegenerate()
                      : onSwipe(at + 1)
                }
              >
                <RiArrowRightSLine size={16} />
              </button>
            </span>
          )}
          {assistant && (
            <button
              type="button"
              title="Show the request that produced this"
              aria-pressed={inspecting}
              onClick={() => setInspecting(!inspecting)}
            >
              <RiCodeSSlashLine size={16} />
            </button>
          )}
          {passOriginal !== undefined && (
            <button
              type="button"
              title={
                showOriginal
                  ? 'Show the swept text'
                  : passSummary || "Show the text before Second Sweep"
              }
              aria-pressed={showOriginal}
              onClick={() => setShowOriginal(!showOriginal)}
            >
              <RiSparkling2Line size={16} />
            </button>
          )}
          <button type="button" title="Edit" onClick={() => setDraft(message.content)}>
            <RiPencilLine size={16} />
          </button>
          {onReprompt && (
            <button type="button" title="Re-Prompt" onClick={onReprompt}>
              <RiSendPlaneLine size={16} />
            </button>
          )}
          <button type="button" title="Delete" onClick={onDelete}>
            <RiDeleteBinLine size={16} />
          </button>
          {modelRegen && (
            <button type="button" title="Regenerate" onClick={onRegenerate}>
              <RiRefreshLine size={16} />
            </button>
          )}
          <details
            className="quickActions"
            ref={quickRef}
            open={quickActions}
            // The summary still toggles natively; this is what tells React it happened.
            onToggle={(e) => setQuickActions((e.target as HTMLDetailsElement).open)}
          >
            <summary title="Quick actions">
              <RiMoreLine size={16} />
            </summary>
            <div className="quickActionsMenu">
              <button
                type="button"
                onClick={() => {
                  onEdit(message.content.replace(/\n{2,}/g, '\n'))
                  setQuickActions(false)
                }}
              >
                Collapse newlines
              </button>
              <button
                type="button"
                onClick={() => {
                  onEdit(message.content.replace(/\n+/g, '\n\n'))
                  setQuickActions(false)
                }}
              >
                Add newlines
              </button>
              {assistant && (
                <button
                  type="button"
                  disabled={!modelRegen}
                  onClick={() => {
                    onRewriteOpen(true)
                    setQuickActions(false)
                  }}
                >
                  Regen with instructions
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(message.content)
                  setQuickActions(false)
                }}
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  // The store is the handoff buffer; the screen takes it on mount and clears it.
                  useSlopSample.getState().setSample(message.content)
                  navigate('/slopdentifier')
                  setQuickActions(false)
                }}
              >
                Send to Slop-dentifier
              </button>
              {assistant && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSwipes([at])
                    setQuickActions(false)
                  }}
                >
                  Delete Swipe
                </button>
              )}
              {assistant && onPass && (
                <button
                  type="button"
                  onClick={() => {
                    onPass()
                    setQuickActions(false)
                  }}
                >
                  {passOriginal === undefined ? "Second Sweep" : "Sweep again"}
                </button>
              )}
              {assistant && onPassRevert && passOriginal !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOriginal(false)
                    onPassRevert()
                    setQuickActions(false)
                  }}
                >
                  Revert the sweep
                </button>
              )}
              {assistant && count > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setPickingSwipes(true)
                    setQuickActions(false)
                  }}
                >
                  Delete Swipe(s)
                </button>
              )}
            </div>
          </details>
        </span>
        )}
      </div>

      {appearance.showReasoning && streamingText !== null && streamingReasoning && (
        <details className="taggedBlock reasoningBlock">
          <summary>Reasoning</summary>
          {renderText(streamingReasoning, { tagRules, replaceRules, order, role: message.role })}
        </details>
      )}

      {appearance.showReasoning && streamingText === null && draft === null &&
        (reasoningFor(message) || inlineReasoning) && (
        <details className="taggedBlock reasoningBlock">
          <summary>Reasoning</summary>
          {renderText(reasoningFor(message) ?? inlineReasoning, {
            tagRules,
            replaceRules,
            order,
            role: message.role,
          })}
        </details>
      )}

      {streamingText !== null ? (
        <div className="messageBody">
          {renderText(streamingText, { tagRules, replaceRules, order, role: message.role })}
          <span className="caret">▌</span>
        </div>
      ) : draft === null ? (
        // The rewrite is the message; showing the original is a look at what it replaced, and the
        // class marks it so the two are never confused for each other.
        <div className={showOriginal && passOriginal !== undefined ? 'messageBody passOriginalBody' : 'messageBody'}>
          {renderText(showOriginal && passOriginal !== undefined ? passOriginal : bodyText, {
            tagRules,
            replaceRules,
            order,
            role: message.role,
          })}
        </div>
      ) : (
        <textarea
          autoFocus
          className="messageEdit"
          rows={draft.split('\n').length + 2}
          ref={(el) => {
            if (!el) return
            el.style.height = 'auto'
            el.style.height = el.scrollHeight + 'px'
          }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (cancelled.current) cancelled.current = false
            else if (draft !== message.content) onEdit(draft)
            setDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              cancelled.current = true
              setDraft(null)
            } else if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (draft !== message.content) onEdit(draft)
              setDraft(null)
            }
          }}
        />
      )}
      {passing && streamingText !== null && (
        <p className="passMarker">
          <RiSparkling2Line size={14} />
          Passing
        </p>
      )}

      {passFailure && streamingText === null && (
        <p className="passMarker">
          <RiErrorWarningLine size={14} />
          {passFailure}
          {onPass && (
            <button type="button" className="passMarkerRetry" onClick={onPass}>
              Retry
            </button>
          )}
        </p>
      )}

      {draft !== null && <p className="editHint">Enter or click out saves · Shift+Enter for a new line · Esc discards</p>}

      {inspecting && <PromptInspector json={snapshotFor(message)} />}

      {pickingSwipes && (
        <SwipePicker
          swipes={message.swipes ?? [message.content]}
          onCancel={() => setPickingSwipes(false)}
          onDelete={(indices) => {
            setPickingSwipes(false)
            onDeleteSwipes(indices)
          }}
        />
      )}

      {rewriting && (
        <RewriteBox
          initial={defaultInstruction()}
          onSubmit={(instruction) => {
            onRewriteOpen(false)
            onRewrite(instruction)
          }}
          onCancel={() => onRewriteOpen(false)}
        />
      )}
    </div>
  )
}

/** Pick alternates to delete. Numbers toggle selection; the last one clicked shows in the preview.
 *  rendered inline in the bubble, not portalled, the backdrop is position:fixed anyway. */
function SwipePicker({
  swipes,
  onCancel,
  onDelete,
}: {
  swipes: string[]
  onCancel: () => void
  onDelete: (indices: number[]) => void
}) {
  const [selected, setSelected] = useState<number[]>([])
  const [preview, setPreview] = useState(0)
  const text = swipes[preview] ?? ''
  return (
    <div className="dialogBackdrop" onClick={onCancel}>
      <div className="dialog swipePicker" onClick={(e) => e.stopPropagation()}>
        <h3>Delete swipes</h3>
        <div className="swipeNumbers">
          {swipes.map((_, i) => (
            <button
              key={i}
              type="button"
              className={selected.includes(i) ? 'active' : ''}
              onClick={() => {
                setPreview(i)
                setSelected((s) => (s.includes(i) ? s.filter((n) => n !== i) : [...s, i]))
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
        {/* One line on purpose: newlines inside a <pre> in JSX render as whitespace. */}
        <pre className="swipePreview"><code>{text}</code></pre>
        <div className="dialogActions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" disabled={!selected.length} onClick={() => onDelete(selected)}>
            Delete {selected.length} swipe{selected.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
