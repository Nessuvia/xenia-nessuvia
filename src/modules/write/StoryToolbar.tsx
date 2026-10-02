// The bar over the document, laid out like an editor toolbar: groups of flat buttons split by
// dividers, attached to the top of the page. Generate, the selection actions, retry and swipes
// for the last generation, find and replace, and the stack's length control when it declares one.
// A rewrite instruction or find and replace opens as a second row under the buttons.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCollapseDiagonalLine,
  RiEditLine,
  RiExpandDiagonalLine,
  RiFindReplaceLine,
  RiRefreshLine,
  RiSparkling2Line,
  RiStopCircleLine,
} from '@remixicon/react'
import type { StackVariable } from '../../core/storage/types'
import { stackVariables, withValue } from '../../core/prompt/stackTemplate'
import { useSettings } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { useWrite } from '../../core/stores/writeStore'
import { countInDoc, replaceInDoc, runAction } from './StoryDocument'

type LengthVariable = Extract<StackVariable, { kind: 'length' }>

const presetLabels = ['S', 'M', 'L']

function ToolButton({
  icon,
  label,
  title,
  disabled,
  pressed,
  onClick,
}: {
  icon?: ReactNode
  label: string
  title?: string
  disabled?: boolean
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="storyToolButton"
      title={title ?? label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {icon}
      <span className="storyToolLabel">{label}</span>
    </button>
  )
}

const Divider = () => <span className="storyToolDivider" aria-hidden="true" />

/**
 * The stack's `length` variable as S/M/L plus a box. It writes the stack's value, so every Story on
 * the stack shares it: per Story is the upgrade path if lengths start differing between works.
 */
function LengthControl() {
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const stack = useStacks((s) => s.stacks.find((x) => x.id === activeStoryStackId))
  const saveStack = useStacks((s) => s.save)
  const v = stack && (stackVariables(stack).find((x) => x.id === 'length' && x.kind === 'length') as LengthVariable | undefined)
  // The box keeps what was typed: a value converted back from a number would eat a cleared field.
  const [draft, setDraft] = useState('')
  useEffect(() => setDraft(v ? String(v.value) : ''), [v?.value])
  if (!stack || !v) return null

  const set = (value: number) => saveStack(withValue(stack, { ...v, value }))

  return (
    <div className="storyToolLength" title={v.info || undefined}>
      <span className="storyToolCaption">
        {v.label} ({v.unit})
      </span>
      {v.presets.map((n, i) => (
        <button
          key={i}
          type="button"
          className="storyToolButton storyToolPreset"
          aria-pressed={v.value === n}
          title={`${n} ${v.unit}`}
          onClick={() => set(n)}
        >
          {presetLabels[i]}
        </button>
      ))}
      <input
        className="storyToolNumber"
        type="number"
        min={1}
        aria-label={`${v.label} (${v.unit})`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (n > 0) set(n)
        }}
      />
    </div>
  )
}

/**
 * Literal find and replace over this Story's document, all matches at once. The document only:
 * premise, beats and the note keep what they say. One change, so one undo reverts it.
 */
function FindRow({ onClose }: { onClose: () => void }) {
  const streaming = useWrite((s) => s.streaming)
  // Subscribed to so the count follows edits to the document.
  useWrite((s) => s.story?.text)
  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const count = countInDoc(find, matchCase)

  return (
    <form
      className="storyToolRow"
      onSubmit={(e) => {
        e.preventDefault()
        setDone(replaceInDoc(find, replace, matchCase))
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <input
        className="storyToolField"
        autoFocus
        placeholder="Find"
        value={find}
        onChange={(e) => {
          setFind(e.target.value)
          setDone(null)
        }}
      />
      <input
        className="storyToolField"
        placeholder="Replace with"
        value={replace}
        onChange={(e) => {
          setReplace(e.target.value)
          setDone(null)
        }}
      />
      <label className="storyToolCheck">
        <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
        Match case
      </label>
      <span className="storyToolCaption">
        {done !== null ? `Replaced ${done}.` : find ? `${count} found.` : ''}
      </span>
      <button type="submit" disabled={streaming || !find || count === 0}>
        Replace all
      </button>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </form>
  )
}

/** The toolbar's Continue: an optional instruction, then continue from the cursor. Enter sends,
 *  Shift+Enter is a new line. */
function ContinueDialog({ onClose }: { onClose: () => void }) {
  const [instruction, setInstruction] = useState('')
  const send = () => {
    onClose()
    runAction('continue', instruction.trim())
  }
  // Portalled: the toolbar is sticky with a z-index of its own, which would trap the backdrop's.
  return createPortal(
    <div className="dialogBackdrop" onClick={onClose}>
      <form
        className="panel dialog storyContinueDialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3>Continue</h3>
        <textarea
          className="storyContinueInput"
          autoFocus
          rows={3}
          value={instruction}
          placeholder="Write an optional instruction and hit &quot;Enter&quot; to continue."
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="dialogActions">
          <button type="submit">Continue</button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function InstructionRow({ onClose }: { onClose: () => void }) {
  const [instruction, setInstruction] = useState('')
  return (
    <form
      className="storyToolRow"
      onSubmit={(e) => {
        e.preventDefault()
        runAction('rewrite', instruction.trim())
        onClose()
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <input
        className="storyToolField storyToolWide"
        autoFocus
        value={instruction}
        placeholder="Instruction (optional)"
        onChange={(e) => setInstruction(e.target.value)}
      />
      <button type="submit">Rewrite</button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </form>
  )
}

export default function StoryToolbar() {
  const streaming = useWrite((s) => s.streaming)
  const last = useWrite((s) => s.last)
  const hasSelection = useWrite((s) => s.cursor.from !== s.cursor.to)
  const retry = useWrite((s) => s.retry)
  const swipe = useWrite((s) => s.swipe)
  const stop = useWrite((s) => s.stop)
  // Nothing has arrived yet: the request is out, or the stack and lorebooks are still loading.
  const waiting = useWrite((s) => s.streaming && !s.streamingText)
  const [row, setRow] = useState<'rewrite' | 'find' | null>(null)
  const [asking, setAsking] = useState(false)
  const noSelection = streaming || !hasSelection

  return (
    <div className="storyToolbar" role="toolbar" aria-label="Story tools">
      <div className="storyToolGroups">
        <div className="storyToolGroup">
          {streaming ? (
            <>
              <ToolButton icon={<RiStopCircleLine size={16} />} label="Stop" title="Stop (Esc)" onClick={stop} />
              <span className="storyToolCaption storyToolStatus" role="status">
                {waiting ? 'Waiting for the model...' : 'Writing...'}
              </span>
            </>
          ) : (
            <ToolButton
              icon={<RiSparkling2Line size={16} />}
              label="Continue"
              title="Write from the cursor (Ctrl+Enter)"
              onClick={() => setAsking(true)}
            />
          )}
        </div>
        <Divider />
        <div className="storyToolGroup">
          <ToolButton
            icon={<RiEditLine size={16} />}
            label="Rewrite"
            title="Rewrite the selection"
            disabled={noSelection}
            pressed={row === 'rewrite'}
            onClick={() => setRow(row === 'rewrite' ? null : 'rewrite')}
          />
          <ToolButton
            icon={<RiExpandDiagonalLine size={16} />}
            label="Expand"
            title="Make the selection longer"
            disabled={noSelection}
            onClick={() => runAction('expand')}
          />
          <ToolButton
            icon={<RiCollapseDiagonalLine size={16} />}
            label="Shorten"
            title="Make the selection shorter"
            disabled={noSelection}
            onClick={() => runAction('shorten')}
          />
        </div>
        <Divider />
        <div className="storyToolGroup">
          <ToolButton
            icon={<RiRefreshLine size={16} />}
            label="Retry"
            title="Retry the last generation (Ctrl+Shift+Enter)"
            disabled={streaming || !last}
            onClick={retry}
          />
          {last && last.alternates.length > 1 && (
            <>
              <button
                type="button"
                className="storyToolButton"
                disabled={streaming || last.index === 0}
                onClick={() => swipe(-1)}
                title="Previous version (Alt+Left)"
              >
                <RiArrowLeftSLine size={16} />
              </button>
              <span className="storyToolCaption storyToolCount">
                {last.index + 1}/{last.alternates.length}
              </span>
              <button
                type="button"
                className="storyToolButton"
                disabled={streaming || last.index === last.alternates.length - 1}
                onClick={() => swipe(1)}
                title="Next version (Alt+Right)"
              >
                <RiArrowRightSLine size={16} />
              </button>
            </>
          )}
        </div>
        <Divider />
        <div className="storyToolGroup">
          <ToolButton
            icon={<RiFindReplaceLine size={16} />}
            label="Replace"
            title="Find and replace"
            pressed={row === 'find'}
            onClick={() => setRow(row === 'find' ? null : 'find')}
          />
        </div>
        <LengthControl />
      </div>
      {row === 'rewrite' && <InstructionRow onClose={() => setRow(null)} />}
      {row === 'find' && <FindRow onClose={() => setRow(null)} />}
      {asking && <ContinueDialog onClose={() => setAsking(false)} />}
    </div>
  )
}
