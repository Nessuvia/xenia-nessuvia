import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiCodeSSlashLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiMoreLine,
  RiPencilLine,
  RiRefreshLine,
  RiRobot2Line,
  RiSendPlaneLine,
  RiSparkling2Line,
} from '@remixicon/react'
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { AvatarSource, CharacterColors, Message } from '../../core/storage/types'
import { Avatar } from '../../app/Avatar'
import { isNarrator } from '../../core/multiplayer/narrator'
import {
  passFailedFor,
  passOriginalFor,
  passSummaryFor,
  reasoningFor,
  swipeCount,
  swipeIndex,
} from '../../core/stores/swipes'
import { snapshotFor } from '../../core/stores/snapshots'
import { useActiveConnection, useAppearance } from '../../core/stores/settingsStore'
import MakeRulePopover from './MakeRulePopover'
import { reasoningSpan } from '../../core/prompt/reasoning'
import { stripState } from '../../core/trackers/trackerState'
import { usePalette } from '../../core/stores/palettesStore'
import { renderText } from './renderText'
import RewriteBox from './RewriteBox'
import TrackerWarning from './TrackerWarning'
import AgentStream from './AgentStream'
import type { Segment } from './agentSegments'
import SelectionEditDialog from './SelectionEditDialog'
import { contract } from './contract'
import { useMediaQuery } from '../../app/useMediaQuery'
import SelectionMenu from './SelectionMenu'
import { cutSpan, locate, occurrenceBefore, replaceSpan, textOffset, type Span } from './selectionEdit'
import PromptInspector from '../../app/PromptInspector'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'


/** Per-speaker color overrides as CSS vars. Only overridden fields are set. `overwrite` drops
 *  every override. */
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
  onRandomSwipe,
  onSwipe,
  onDeleteSwipes,
  onPass,
  onPassClean,
  onPassRevert,
  onPassDismiss,
  passing = false,
  streamingSegments,
  readOnly = false,
}: {
  message: Message
  who: string
  /** The speaker's picture and its crop; null when they've none or their card is gone. */
  avatar: AvatarSource | null
  /** This speaker's per-character color overrides; empty fields fall through to the global colors. */
  colors: CharacterColors
  canRegenerate: boolean
  /** The seeded greeting message: swipes loop through the other greetings, never regenerate. */
  greeting: boolean
  /** Non-null while this message is being re-rolled: shown in place of its stored content. */
  streamingText: string | null
  /** Reasoning so far for that re-roll; empty when there's none. */
  streamingReasoning: string
  /** Called only when the rewrite box opens, building it quotes every later message. */
  defaultInstruction: () => string
  /** Owned by ChatView: an empty composer submit opens this on the last reply. */
  rewriting: boolean
  onRewriteOpen: (open: boolean) => void
  onEdit: (content: string) => void
  /** Fires when the inline edit box opens and closes. The composer hides while it's open. */
  onEditingChange?: (editing: boolean) => void
  /** Only passed for the last user message: generate a reply to it, as if it were just sent. */
  onReprompt?: () => void
  onDelete: () => void
  onRegenerate: () => void
  onRewrite: (instruction: string) => void
  /** A new swipe drawn as an acrostic. Omitted when post-processing is off for the chat. */
  onRandomSwipe?: () => void
  onSwipe: (index: number) => void
  /** Drop these alternates. Dropping all of them deletes the message. */
  onDeleteSwipes: (indices: number[]) => void
  /** Run the agent pass over this message, and the retry on a failed one. Omitted by views that
   *  have no pass (Ask, and a multiplayer guest). */
  onPass?: () => void
  /** The pass without rewrite rules: only what runs in code, no request. */
  onPassClean?: () => void
  /** Put the pre-rewrite text back. */
  onPassRevert?: () => void
  /** Hide the failed-pass notice. */
  onPassDismiss?: () => void
  /** A pass stage's candidate is streaming over this message's text right now. */
  passing?: boolean
  /** The re-roll under the agent's display mode. null shows a working marker. Omitted shows the plain stream. */
  streamingSegments?: Segment[] | null
  /** No action buttons at all. A guest in a session owns none of the transcript. */
  readOnly?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const editing = draft !== null
  const editingCb = useRef(onEditingChange)
  editingCb.current = onEditingChange
  useEffect(() => editingCb.current?.(editing), [editing])
  const [pickingSwipes, setPickingSwipes] = useState(false)
  const [quickActions, setQuickActions] = useState(false)
  const quickRef = useCloseOnOutside<HTMLDetailsElement>(quickActions, () =>
    setQuickActions(false),
  )
  const cancelled = useRef(false)
  const [inspecting, setInspecting] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const appearance = useAppearance()
  const tagRules = appearance.tagRules
  const replaceRules = appearance.replaceRules
  const palette = usePalette()
  const order = palette.colorOrder

  const reasoningConfig = useActiveConnection()?.template?.reasoning
  const inline =
    message.role === 'assistant' && reasoningConfig?.autoParse
      ? reasoningSpan(message.content, reasoningConfig)
      : null
  const inlineReasoning = inline ? message.content.slice(inline.start, inline.end) : ''
  const bodyText = inline
    ? message.content.slice(inline.end).replace(/^\s+/, '')
    : message.content

  // Offset of bodyText inside message.content: renderText only ever sees the body, while every
  // edit writes the whole stored string back.
  const bodyOffset = message.content.length - bodyText.length

  const onPhone = useMediaQuery('(max-width: 700px)')
  const bodyRef = useRef<HTMLDivElement>(null)
  const [selectionMenu, setSelectionMenu] = useState<
    { x: number; y: number; span: Span; text: string } | null
  >(null)
  const [editingSelection, setEditingSelection] = useState<{ span: Span; text: string } | null>(null)
  const [makingRule, setMakingRule] = useState<{ x: number; y: number; text: string } | null>(null)

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
  const passSummary = passSummaryFor(message)

  // Right-click on a run of selected text in a reply. Shift falls through to the browser's own
  // menu, and so does anything the selection can't be traced back to: a selection that leaves this
  // body, the pre-sweep preview, a reply that's still streaming.
  const openSelectionMenu = (x: number, y: number): boolean => {
    if (!assistant || readOnly || showOriginal || streamingText !== null) return false
    const root = bodyRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.isCollapsed || !selection.rangeCount) return false
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return false
    const text = selection.toString()
    if (!text.trim()) return false

    const rendered = root.textContent ?? ''
    const start = textOffset(root, range.startContainer, range.startOffset)
    if (start < 0) return false
    const span = locate(bodyText, text, occurrenceBefore(rendered, text, start))
    if (!span) return false

    setSelectionMenu({
      x,
      y,
      span: { start: span.start + bodyOffset, end: span.end + bodyOffset },
      text: message.content.slice(span.start + bodyOffset, span.end + bodyOffset),
    })
    return true
  }

  const onBodyContextMenu = (e: MouseEvent) => {
    if (e.shiftKey) return
    if (openSelectionMenu(e.clientX, e.clientY)) e.preventDefault()
  }

  // Touch has no right-click, and the OS selection handles make a long press mean something else.
  // On a phone, lifting a finger with text selected opens the same menu: it catches the end of a
  // drag on the handles and a tap on the selection alike.
  const onBodyPointerUp = (e: React.PointerEvent) => {
    if (!onPhone || e.pointerType === 'mouse') return
    const { clientX, clientY } = e
    // The selection isn't final until the browser settles the handles.
    window.setTimeout(() => openSelectionMenu(clientX, clientY), 0)
  }

  return (
    <div className={`bubble message ${message.role}`} style={colorVars(colors, palette.overwriteCharColor)}>
      <div className="messageHeader">
        <span className="messageWho">
          {/* The Narrator has no card and so no avatar. The same icon the responder picker uses
              stands in, otherwise the slot is empty and the name sits where no other name does. */}
          {isNarrator(message.speakerId) ? (
            <RiRobot2Line className="avatar messageAvatar narratorAvatar" size={18} />
          ) : (
            <Avatar of={avatar} className="avatar messageAvatar" />
          )}
          {name}
        </span>
        {assistant && <TrackerWarning failures={message.trackerUpdates?.[at]?.failures} />}
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
                  : passSummary || "Show the text before post-processing"
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
            <button type="button" title="Re-prompt" onClick={onReprompt}>
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
                  onClick={() => {
                    onEdit(contract(message.content))
                    setQuickActions(false)
                  }}
                >
                  Use contractions
                </button>
              )}
              {assistant && (
                <button
                  type="button"
                  onClick={() => {
                    setInspecting(!inspecting)
                    setQuickActions(false)
                  }}
                >
                  {inspecting ? 'Hide prompt preview' : 'Prompt preview'}
                </button>
              )}
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
              {assistant && onRandomSwipe && (
                <button
                  type="button"
                  disabled={!modelRegen}
                  onClick={() => {
                    onRandomSwipe()
                    setQuickActions(false)
                  }}
                >
                  Randomized swipe
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
              {assistant && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteSwipes([at])
                    setQuickActions(false)
                  }}
                >
                  Delete swipe
                </button>
              )}
              {assistant && onPassClean && (
                <button
                  type="button"
                  onClick={() => {
                    onPassClean()
                    setQuickActions(false)
                  }}
                >
                  Post-process (clean only)
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
                  {passOriginal === undefined ? "Post-process" : "Post-process again"}
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
                  Delete swipe(s)
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
          <AgentStream segments={streamingSegments === undefined ? [{ text: streamingText, mark: 'none' }] : streamingSegments} render={(t) => renderText(stripState(t), { tagRules, replaceRules, order, role: message.role })} />
        </div>
      ) : draft === null ? (
        <div
          ref={bodyRef}
          onContextMenu={onBodyContextMenu}
          onPointerUp={onBodyPointerUp}
          className={showOriginal && passOriginal !== undefined ? 'messageBody passOriginalBody' : 'messageBody'}
        >
          {renderText(stripState(showOriginal && passOriginal !== undefined ? passOriginal : bodyText), {
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
      {selectionMenu && (
        <SelectionMenu
          at={selectionMenu}
          onClose={() => setSelectionMenu(null)}
          onDelete={() => {
            onEdit(cutSpan(message.content, selectionMenu.span))
            setSelectionMenu(null)
          }}
          onEdit={() => {
            setEditingSelection({ span: selectionMenu.span, text: selectionMenu.text })
            setSelectionMenu(null)
          }}
          onMakeRule={() => {
            setMakingRule({ x: selectionMenu.x, y: selectionMenu.y, text: selectionMenu.text })
            setSelectionMenu(null)
          }}
        />
      )}

      {makingRule && <MakeRulePopover at={makingRule} text={makingRule.text} onClose={() => setMakingRule(null)} />}

      {editingSelection && (
        <SelectionEditDialog
          text={editingSelection.text}
          onClose={() => setEditingSelection(null)}
          onSave={(text) => {
            onEdit(replaceSpan(message.content, editingSelection.span, text))
            setEditingSelection(null)
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
          {onPassDismiss && (
            <button type="button" className="passMarkerRetry" title="Dismiss" aria-label="Dismiss" onClick={onPassDismiss}>
              <RiCloseLine size={14} />
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

/** Pick alternates to delete. Numbers toggle selection; the last one clicked shows in the preview. */
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
