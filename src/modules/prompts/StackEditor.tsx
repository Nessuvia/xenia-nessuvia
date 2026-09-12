import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PromptBlock, PromptStack } from '../../core/storage/types'
import { bundledStacks, newBlock, useStacks } from '../../core/stores/stacksStore'
import { useSettings } from '../../core/stores/settingsStore'
import {
  addChild,
  allBlocks,
  contains,
  findBlock,
  insertBlock,
  moveByKey,
  removeBlock,
  replaceBlock as replaceInTree,
} from './blockTree'
import type { MoveDir } from './blockTree'
import BlockCard from './BlockCard'
import { applyType, kindTypes } from './blockTypes'
import type { BlockType } from './blockTypes'
import { boundSources, kindSources, stackKind, validateStack } from './stackKinds'
import type { StackKind } from './stackKinds'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import BlockModal from './BlockModal'
import MiscPromptsPanel from './MiscPromptsPanel'
import { useHashTab } from '../../app/useHashTab'
import { exportStack, parseStack } from './stackFile'
import { parseSillyTavern } from '../../core/sillytavern/importSillyTavern'
import PromptPreview from './PromptPreview'
import './prompts.css'
import { RiDownloadLine, RiUploadLine } from '@remixicon/react'

/** The stack out of a SillyTavern export, or the error the user needs to read. */
function stackFromSt(text: string) {
  let found
  try {
    found = parseSillyTavern(text)
  } catch {
    throw new Error('That file is not a prompt stack or a SillyTavern preset.')
  }
  if (!found.stack) {
    throw new Error(
      'That SillyTavern file holds no prompts. Import it under Settings › Connections.',
    )
  }
  return found.stack
}

interface Drop {
  parentId: string | null
  /** The block the dragged one lands in front of; null appends to that list. */
  beforeId: string | null
}

const indent = (depth: number, step: number) => ({ marginLeft: depth * step })

function nextBlockLabel(stack: PromptStack) {
  const used = stack.active
    .map((b) => Number(/^Block (\d+)$/.exec(b.label)?.[1] ?? 0))
    .reduce((a, b) => Math.max(a, b), 0)
  return `Block ${used + 1}`
}

export default function StackEditor() {
  const { stacks, load, save, create, duplicate, addBundled, remove, ensureActive } = useStacks()
  // The Chat | Story switch. Not persisted, which builder you're looking at is a glance-level
  // choice; the active stack of each kind lives in settings. `?kind=story` is how the Story
  // sidebar's edit link lands on the right builder.
  const [params] = useSearchParams()
  // Blocks or the utility prompts. Both edit the same open stack: the picker row above stays put
  // and only the body swaps.
  const [tab] = useHashTab(['stacks', 'misc'] as const)
  const writeEnabled = useSettings((s) => s.writeEnabled)
  const multiplayerEnabled = useSettings((s) => s.multiplayerEnabled)
  const [kind, setKind] = useState<StackKind>(
    writeEnabled && params.get('kind') === 'story' ? 'story' : 'chat',
  )
  const activeStackId = useSettings((s) => s.activeStackId)
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const activeId = kind === 'story' ? activeStoryStackId : activeStackId
  const [draft, setDraft] = useState<PromptStack | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // sessionStorage, not a stored setting: survives navigation, clears on tab close.
  // global for the tab, not per stack, key by stack id if that matters.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    JSON.parse(sessionStorage.getItem('promptsCollapsed') ?? '{}'),
  )
  const toggleZone = (key: string) =>
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] }
      sessionStorage.setItem('promptsCollapsed', JSON.stringify(next))
      return next
    })
  // Phone width folds the action buttons into one Options menu and shortens the nesting indent
  // both change the shape of the row, which is more than a stylesheet can say.
  const mobile = useMediaQuery('(max-width: 700px)')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useCloseOnOutside(menuOpen, () => setMenuOpen(false))
  const [bundledOpen, setBundledOpen] = useState(false)
  const bundledRef = useCloseOnOutside(bundledOpen, () => setBundledOpen(false))
  const [saved, setSaved] = useState(false)
  // Not persisted, matching the chat list's copy of this: skipping the confirm is a decision for
  // this sitting, not a setting that follows you into the next one.
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false)

  const [nestError, setNestError] = useState('')
  // After a keyboard move the card lands in a new spot; refocus it so arrows keep working.
  const [focusId, setFocusId] = useState<string | null>(null)

  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  const drag = useRef<string | null>(null)
  // Drop targets are addressed by parent and next-sibling id, not an index: after the dragged
  // block is pulled out of the tree every index would have shifted.
  const [drop, setDrop] = useState<Drop | null>(null)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    ensureActive(kind).then((s) => {
      setDraft(s)
      setSaved(true) // freshly loaded stack is already in sync, don't autosave it back
    })
  }, [kind, activeId, ensureActive])

  // Turning Write off while the Story builder is showing snaps back to the chat stack.
  useEffect(() => {
    if (!writeEnabled && kind === 'story') setKind('chat')
  }, [writeEnabled, kind])

  useEffect(() => {
    if (!focusId) return
    const el = document.querySelector<HTMLElement>(`[data-block-id="${focusId}"]`)
    el?.focus()
  }, [focusId, draft])

  const reason = draft ? validateStack(draft) : ''

  // The one write path: the debounce below and Ctrl+S both go through it.
  async function persist() {
    if (reason || !draft) return
    await save(draft)
    setSaved(true)
  }

  // Debounced autosave: fires 1s after the last edit.
  useEffect(() => {
    if (saved || reason || !draft) return
    const timer = setTimeout(persist, 1000)
    return () => clearTimeout(timer)
  }, [saved, reason, draft, save])

  if (!draft) return <p className="placeholder">Loading…</p>

  // The bound sources and allowed sources for this stack's kind (chat vs story).
  const bound = boundSources[stackKind(draft)]
  const sources = kindSources(stackKind(draft))
  const blocks = allBlocks(draft.active)
  const editing = blocks.find((b) => b.id === editingId)
  const parentOf = (id: string) =>
    blocks.find((b) => (b.children ?? []).some((c) => c.id === id))
  // What the picker on each card offers. One description block, not three, a bound source already
  // used elsewhere in the stack is offered but disabled.
  const types = kindTypes(sources)
  const takenTypes = (block: PromptBlock, nested: boolean): BlockType[] => [
    ...blocks.filter((b) => b.id !== block.id).map((b) => b.source).filter((s) => bound.includes(s)),
    // Chat History's turns carry their own roles. It can't sit inside another block.
    ...(nested ? (['chatHistory'] as BlockType[]) : []),
  ]

  // An imported file lands as a new stack of its own kind, and becomes the active one. It never
  // overwrites the stack you were looking at.
  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError('')
    try {
      const text = await file.text()
      // A SillyTavern export is the other thing anyone drops on this button. Only its stack half
      // lands here. Its samplers and instruct sequences need a connection: the full import is in
      // Settings › Connections.
      const imported = text.includes('nessu-prompt-stack') ? parseStack(text) : stackFromSt(text)
      const id = await save(imported)
      const importedKind = stackKind(imported)
      useSettings.setState(
        importedKind === 'story' ? { activeStoryStackId: id } : { activeStackId: id },
      )
      setKind(importedKind)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  function change(next: PromptStack) {
    setDraft(next)
    setSaved(false)
    setNestError('')
  }

  function move(target: Drop) {
    const fromId = drag.current
    if (!fromId || !draft) return
    const block = findBlock(draft.active, fromId)
    if (!block || target.beforeId === fromId) return
    if (block.source === 'chatHistory' && target.parentId !== null) {
      setNestError("Chat History can't go inside another block, its turns carry their own roles.")
      return
    }
    // Dropping a container into its own subtree would detach both from the tree.
    if (target.parentId && contains(block, target.parentId)) return

    const pruned = removeBlock(draft.active, fromId)
    change({ ...draft, active: insertBlock(pruned, block, target.parentId, target.beforeId) })
  }

  function moveBlock(id: string, dir: MoveDir) {
    if (!draft) return
    const next = moveByKey(draft.active, id, dir)
    if (!next) return // edge of the list, already top level, or a nest Chat History can't take
    change({ ...draft, active: next })
    setFocusId(id) // the card moved in the tree; put focus back on it
  }

  function replaceBlock(block: PromptBlock, closeModal = true) {
    if (!draft) return
    change({ ...draft, active: replaceInTree(draft.active, block) })
    if (closeModal) setEditingId(null)
  }

  function deleteBlock(id: string) {
    if (!draft) return
    // The only delete path for a block. The confirm belongs here rather than in the modal.
    const block = findBlock(draft.active, id)
    if (!skipDeleteConfirm && block) {
      const nested = block.children?.length ? ' and the blocks inside it' : ''
      if (!confirm(`Delete "${block.label}"${nested}?`)) return
    }
    // Children go with the parent: a wrapper's contents don't outlive their tags.
    change({ ...draft, active: removeBlock(draft.active, id) })
    setEditingId(null)
  }

  function append(block: PromptBlock, edit: boolean) {
    if (!draft) return
    change({ ...draft, active: [...draft.active, block] })
    if (edit) setEditingId(block.id)
  }

  // Every block starts as freeform text at the bottom of the stack; the picker on the card is
  // where it becomes something else.
  const addBlock = () => append(newBlock({ label: nextBlockLabel(draft) }), false)

  const setType = (block: PromptBlock, type: BlockType) =>
    replaceBlock(applyType(block, type), false)

  function addChildBlock(parentId: string) {
    if (!draft) return
    const child = newBlock({ label: nextBlockLabel(draft), role: findBlock(draft.active, parentId)!.role })
    change({ ...draft, active: addChild(draft.active, parentId, child) })
    setEditingId(child.id)
  }

  function isDropHere(parentId: string | null, beforeId: string | null) {
    return drop?.parentId === parentId && drop.beforeId === beforeId
  }

  function renderList(list: PromptBlock[], parentId: string | null, depth: number) {
    const step = mobile ? 8 : 20
    return (
      <>
        {list.map((block, i) => (
          <div key={block.id}>
            {isDropHere(parentId, block.id) && (
              <div className="dropLine" style={indent(depth, step)} />
            )}
            <div style={indent(depth, step)}>
              <BlockCard
                block={block}
                types={types}
                takenTypes={takenTypes(block, parentId !== null)}
                onClick={() => setEditingId(block.id)}
                onType={(type) => setType(block, type)}
                onAddChild={() => addChildBlock(block.id)}
                onToggle={() => replaceBlock({ ...block, disabled: !block.disabled }, false)}
                onMove={(dir) => moveBlock(block.id, dir)}
                onDragStart={() => (drag.current = block.id)}
                onDragOver={(before) =>
                  // Below the midpoint means "in front of my next sibling". A container's
                  // whole subtree stays together.
                  setDrop({ parentId, beforeId: before ? block.id : (list[i + 1]?.id ?? null) })
                }
              />
            </div>
            {block.children && renderList(block.children, block.id, depth + 1)}
          </div>
        ))}

        {isDropHere(parentId, null) && <div className="dropLine" style={indent(depth, step)} />}

        {parentId !== null && list.length === 0 && (
          <div
            className="childSlot"
            style={indent(depth, step)}
            onDragOver={(e) => {
              e.preventDefault()
              setDrop({ parentId, beforeId: null })
            }}
          />
        )}
      </>
    )
  }

  function renderZone(title: string, hint: ReactNode) {
    const list = draft!.active
    if (collapsed.active) return <CollapseRail label={title} onToggle={() => toggleZone('active')} />
    return (
      <section
        className="panel stackZone"
        onDragOver={(e) => {
          e.preventDefault()
          // Bare zone background: land at the end of the top level, not inside anything.
          if (e.target === e.currentTarget) setDrop({ parentId: null, beforeId: null })
        }}
        onDrop={(e) => {
          e.preventDefault()
          move(drop ?? { parentId: null, beforeId: null })
          drag.current = null
          setDrop(null)
        }}
        onDragEnd={() => {
          drag.current = null
          setDrop(null)
        }}
      >
        <div className="zoneHeader">
          <CollapseButton label={title} collapsed={false} onToggle={() => toggleZone('active')} />
          <h3>{title}</h3>
          <button type="button" onClick={addBlock}>
            Add block
          </button>
        </div>
        <p className="hint">{hint}</p>
        <div className="blockList">
          {renderList(list, null, 0)}
          {list.length === 0 && <p className="placeholder">Drop blocks here.</p>}
        </div>
      </section>
    )
  }

  // One list feeding both shapes: buttons on the row at desktop width, the Options menu below it on
  // a phone. `icon` marks the two that sit in the right-hand group on desktop.
  const actions = [
    { label: 'New', run: () => create(kind) },
    // A session-shaped chat stack: cast slots instead of the speaker's own description.
    ...(kind === 'chat' && multiplayerEnabled
      ? [{ label: 'New multiplayer', run: () => create('chat', 'multiplayer') }]
      : []),
    { label: 'Duplicate', run: () => duplicate(draft.id!) },
    { label: 'Import', run: () => fileInput.current?.click(), icon: <RiUploadLine size={14} /> },
    { label: 'Export', run: () => exportStack(draft), icon: <RiDownloadLine size={14} /> },
    { label: 'Delete', run: () => remove(draft.id!), danger: true },
  ] as { label: string; run: () => void; icon?: ReactNode; danger?: boolean }[]

  // The stacks that ship with the build, for the kind on screen. Picking one writes a new row and
  // leaves any existing copy alone, the same as the bundled palette picker.
  const bundled = bundledStacks.filter(
    (b) => b.kind === kind && (!b.multiplayer || multiplayerEnabled),
  )

  return (
    <div className="prompts screenFrame">
      <h2>Prompt stacks</h2>

      {/* The Story builder only exists in Write mode; with it off there's just the chat stack. */}
      {writeEnabled && (
        <div className="kindSwitch">
          <button
            type="button"
            className={kind === 'chat' ? 'active' : ''}
            onClick={() => setKind('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={kind === 'story' ? 'active' : ''}
            onClick={() => setKind('story')}
          >
            Story
          </button>
        </div>
      )}

      <div className="presetRow">
        <div>
          <select
            value={activeId ?? ''}
            onChange={(e) =>
              useSettings.setState(
                kind === 'story'
                  ? { activeStoryStackId: Number(e.target.value) }
                  : { activeStackId: Number(e.target.value) },
              )
            }
          >
            {stacks
              .filter((s) => stackKind(s) === kind)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          {mobile ? (
            <div className="presetMenuWrap" ref={menuRef}>
              <button type="button" onClick={() => setMenuOpen((v) => !v)}>
                Options
              </button>
              {menuOpen && (
                <div className="panel presetMenu">
                  {actions.map((a) => (
                    <Fragment key={a.label}>
                      {/* One flat menu on a phone: the bundled stacks are listed here rather than
                          behind a second dropdown. */}
                      {a.label === 'Delete' &&
                        bundled.map((b) => (
                          <button
                            key={b.key}
                            type="button"
                            onClick={() => {
                              setMenuOpen(false)
                              addBundled(b.key)
                            }}
                          >
                            Bundled: {b.name}
                          </button>
                        ))}
                      <button
                        type="button"
                        className={a.danger ? 'danger' : undefined}
                        onClick={() => {
                          setMenuOpen(false)
                          a.run()
                        }}
                      >
                        {a.label}
                      </button>
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          ) : (
            actions
              .filter((a) => !a.icon)
              .map((a) => (
                <Fragment key={a.label}>
                  {a.label === 'Delete' && bundled.length > 0 && (
                    <div className="stackBundled" ref={bundledRef}>
                      <button type="button" onClick={() => setBundledOpen(!bundledOpen)}>
                        Bundled
                      </button>
                      {bundledOpen && (
                        <div className="panel stackBundledMenu">
                          {bundled.map((b) => (
                            <button
                              key={b.key}
                              type="button"
                              onClick={() => {
                                setBundledOpen(false)
                                addBundled(b.key)
                              }}
                            >
                              {b.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className={a.danger ? 'danger' : undefined}
                    onClick={a.run}
                  >
                    {a.label}
                  </button>
                </Fragment>
              ))
          )}
        </div>
        <div>
          {reason ? <span className="error">{reason}</span> : saved && <span className="hint">Saved</span>}
          {!mobile &&
            actions
              .filter((a) => a.icon)
              .map((a) => (
                <button key={a.label} type="button" onClick={a.run}>
                  {a.icon} {a.label}
                </button>
              ))}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onImportFile}
          />
        </div>
      </div>
      {importError && <p className="error">{importError}</p>}

      <div className="presetRow">
        Name: 
        <input
          value={draft.name}
          onChange={(e) => change({ ...draft, name: e.target.value })}
          aria-label="Stack name"
        />
        {stackKind(draft) === 'chat' && (
          <label className="stackBudget">
            World info budget
            <input
              type="number"
              min={0}
              step={100}
              value={draft.worldInfoBudget ?? ''}
              placeholder="No limit"
              onChange={(e) =>
                change({
                  ...draft,
                  worldInfoBudget: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
            tokens
          </label>
        )}
        <label className="blockDeleteToggle">
          <input
            type="checkbox"
            checked={skipDeleteConfirm}
            onChange={(e) => setSkipDeleteConfirm(e.target.checked)}
          />
          Delete blocks without confirming
        </label>
      </div>

      {nestError && <p className="error">{nestError}</p>}

      {tab === 'misc' ? (
        <div className="screenBody">
          <MiscPromptsPanel stack={draft} onChange={change} />
        </div>
      ) : (
        <div className="screenBody zones">
          {renderZone(
            'Active stack',
            'Assembled top to bottom. “+” on a block nests another inside it.',
          )}
          <PromptPreview
            stack={draft}
            collapsed={!!collapsed.preview}
            onToggleCollapsed={() => toggleZone('preview')}
          />
        </div>
      )}

      {editing && (
        <BlockModal
          block={editing}
          kind={kind}
          nested={!!parentOf(editing.id)}
          onChange={(b) => replaceBlock(b, false)}
          onDelete={() => deleteBlock(editing.id)}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

// native HTML5 DnD, no touch support, no keyboard reorder. dnd-kit if that bites.
