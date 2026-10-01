import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PromptStack } from '../../core/storage/types'
import { bundledStacks, useStacks } from '../../core/stores/stacksStore'
import { useSettings } from '../../core/stores/settingsStore'
import { stackKind, validateStack } from './stackKinds'
import type { StackKind } from './stackKinds'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import MiscPromptsPanel from './MiscPromptsPanel'
import { useHashTab } from '../../app/useHashTab'
import { exportStack, parseStack } from './stackFile'
import { parseSillyTavern } from '../../core/sillytavern/importSillyTavern'
import PromptPreview from './PromptPreview'
import TemplateEditor from './TemplateEditor'
import LookPanel from './LookPanel'
import DefaultsPanel from './DefaultsPanel'
import { sendMessage } from '../../core/connectors/openaiCompatible'
import { useAskContext, type AskContext } from '../../core/stores/askStore'
import { xeniaPrompt } from '../../core/prompt/xeniaPrompts'
import { buildTemplateMessages, parseTemplateReply } from './templatePrompt'
import PageHeader from '../../app/PageHeader'
import PageTabs from '../../app/PageTabs'
import { tabs } from './tabs'

// Preview first: most visits are to check what the stack sends, and it opens on it.
const viewTabs = [
  ['preview', 'Preview'],
  ['template', 'Template'],
] as const
import './prompts.css'
import { RiDownloadLine, RiUploadLine } from '@remixicon/react'

/** The stack out of a SillyTavern export, or the error the user needs to read. */
function stackFromSt(text: string) {
  let found
  try {
    found = parseSillyTavern(text)
  } catch {
    throw new Error("That file isn't a prompt stack or a SillyTavern preset.")
  }
  if (!found.stack) {
    throw new Error(
      'That SillyTavern file holds no prompts. Import it under Settings › Connections.',
    )
  }
  return found.stack
}

export default function StackEditor() {
  const { stacks, load, save, create, duplicate, addBundled, remove, ensureActive } = useStacks()
  // The Chat | Story switch. Not persisted, which builder you're looking at is a glance-level
  // choice; the active stack of each kind lives in settings. `?kind=story` is how the Story
  // sidebar's edit link lands on the right builder.
  const [params] = useSearchParams()
  // The template or the utility prompts. Both edit the same open stack: the picker row above stays put
  // and only the body swaps.
  const [tab, setTab] = useHashTab(tabs.map(([id]) => id))
  const writeEnabled = useSettings((s) => s.writeEnabled)
  const multiplayerEnabled = useSettings((s) => s.multiplayerEnabled)
  const [kind, setKind] = useState<StackKind>(
    writeEnabled && params.get('kind') === 'story' ? 'story' : 'chat',
  )
  const activeStackId = useSettings((s) => s.activeStackId)
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const activeId = kind === 'story' ? activeStoryStackId : activeStackId
  // The stack open in the editor. Picking one here never changes a default: Prompts > Defaults does
  // that. null opens the default of the kind on screen.
  const [editingId, setEditingId] = useState<number | null>(null)
  function pickKind(next: StackKind) {
    setKind(next)
    setEditingId(null)
  }
  const [draft, setDraft] = useState<PromptStack | null>(null)
  // Template or Preview on the Stacks tab. Page view state, not saved.
  const [view, setView] = useState<'template' | 'preview'>('preview')
  // Phone width folds the action buttons into one Options menu: that changes the shape of the row,
  // which is more than a stylesheet can say.
  const mobile = useMediaQuery('(max-width: 700px)')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useCloseOnOutside(menuOpen, () => setMenuOpen(false))
  const [bundledOpen, setBundledOpen] = useState(false)
  const bundledRef = useCloseOnOutside(bundledOpen, () => setBundledOpen(false))
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const open = useStacks.getState().stacks.find((s) => s.id === editingId && stackKind(s) === kind)
    // freshly loaded stack is already in sync, don't autosave it back
    if (open) {
      setDraft(open)
      setSaved(true)
      return
    }
    ensureActive(kind).then((s) => {
      setDraft(s)
      setSaved(true)
    })
  }, [kind, editingId, activeId, ensureActive])

  // Turning Write off while the Story builder is showing snaps back to the chat stack.
  useEffect(() => {
    if (!writeEnabled && kind === 'story') setKind('chat')
  }, [writeEnabled, kind])

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

  // An imported file lands as a new stack of its own kind and opens in the editor. It never
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
      setKind(stackKind(imported))
      setEditingId(id)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  function change(next: PromptStack) {
    setDraft(next)
    setSaved(false)
  }

  // One list feeding both shapes: buttons on the row at desktop width, the Options menu below it on
  // a phone. `icon` marks the two that sit in the right-hand group on desktop.
  const actions = [
    { label: 'New', run: () => create(kind).then(setEditingId) },
    // A session-shaped chat stack: cast slots instead of the speaker's own description.
    ...(kind === 'chat' && multiplayerEnabled
      ? [{ label: 'New multiplayer', run: () => create('chat', 'multiplayer').then(setEditingId) }]
      : []),
    { label: 'Duplicate', run: () => duplicate(draft.id!).then(setEditingId) },
    { label: 'Import', run: () => fileInput.current?.click(), icon: <RiUploadLine size={14} /> },
    { label: 'Export', run: () => exportStack(draft), icon: <RiDownloadLine size={14} /> },
    { label: 'Delete', run: () => remove(draft.id!).then(() => setEditingId(null)), danger: true },
  ] as { label: string; run: () => void; icon?: ReactNode; danger?: boolean }[]

  // The stacks that ship with the build, for the kind on screen. Picking one writes a new row and
  // leaves any existing copy alone, the same as the bundled palette picker.
  const bundled = bundledStacks.filter(
    (b) => b.kind === kind && (!b.multiplayer || multiplayerEnabled),
  )

  return (
    <div className="prompts screenFrame">
      {/* The Story builder only exists in Write mode; with it off there's just the chat stack. */}
      <PageHeader
        title="Prompt stacks"
        actions={
          writeEnabled && tab !== 'defaults' && (
            <div className="kindSwitch">
              <button
                type="button"
                className={kind === 'chat' ? 'active' : ''}
                onClick={() => pickKind('chat')}
              >
                Chat
              </button>
              <button
                type="button"
                className={kind === 'story' ? 'active' : ''}
                onClick={() => pickKind('story')}
              >
                Story
              </button>
            </div>
          )
        }
      >
        <PageTabs tabs={tabs} current={tab} onPick={setTab} />
      </PageHeader>

      {/* Defaults picks across both kinds: no stack is open, so the picker row stays hidden. */}
      {tab !== 'defaults' && (
      <div className="presetRow">
        <div>
          <input
            className="stackNameInput"
            value={draft.name}
            onChange={(e) => change({ ...draft, name: e.target.value })}
            aria-label="Stack name"
            title="Stack name"
          />
          <select value={draft.id ?? ''} onChange={(e) => setEditingId(Number(e.target.value))}>
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
                              addBundled(b.key).then((id) => id !== undefined && setEditingId(id))
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
            <>
              {actions
                .filter((a) => !a.icon && !a.danger)
                .map((a) => (
                  <button key={a.label} type="button" onClick={a.run}>
                    {a.label}
                  </button>
                ))}
              {bundled.length > 0 && (
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
                              addBundled(b.key).then((id) => id !== undefined && setEditingId(id))
                            }}
                          >
                            {b.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
              )}
            </>
          )}
        </div>
        <div>
          {reason ? <span className="error">{reason}</span> : saved && <span className="hint">Saved</span>}
          {/* Delete sits with the file actions, away from New and Duplicate. */}
          {!mobile &&
            actions
              .filter((a) => a.danger)
              .map((a) => (
                <button key={a.label} type="button" className="danger" onClick={a.run}>
                  {a.label}
                </button>
              ))}
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
      )}
      {importError && <p className="error">{importError}</p>}

      {tab === 'defaults' ? (
        <div className="screenBody">
          <DefaultsPanel />
        </div>
      ) : tab === 'misc' ? (
        <div className="screenBody">
          <MiscPromptsPanel stack={draft} onChange={change} />
        </div>
      ) : tab === 'look' ? (
        <LookPanel stack={draft} onChange={change} />
      ) : (
        <section className="panel codePanel promptsStackPanel">
          <div className="codePanelToolbar">
            <PageTabs tabs={viewTabs} current={view} onPick={setView} />
            {/* The budget is a template setting: it shows with the template. */}
            {stackKind(draft) === 'chat' && view === 'template' && (
              <label className="stackBudget">
                World info budget (tokens)
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={draft.worldInfoBudget ?? ''}
                  placeholder="None"
                  title="Empty means no limit."
                  onChange={(e) =>
                    change({
                      ...draft,
                      worldInfoBudget: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
            )}
          </div>
          {view === 'template' ? (
            <TemplateEditor value={draft.template} kind={kind} onChange={(template) => change({ ...draft, template })} />
          ) : (
            <PromptPreview stack={draft} />
          )}
          {kind === 'chat' && <TemplateAsk stack={draft} onChange={change} />}
        </section>
      )}

    </div>
  )
}

/** Registers Ask on the template tab: talk about the template, and a reply carrying a new one applies it. */
function TemplateAsk({ stack, onChange }: { stack: PromptStack; onChange: (stack: PromptStack) => void }) {
  const latest = useRef({ stack, onChange })
  latest.current = { stack, onChange }
  const askContext = useMemo<AskContext>(
    () => ({
      id: 'template',
      label: 'Prompt stacks → Template',
      info: 'Sends the whole template. A reply with a new template applies it.',
      run: async (text, signal, connection, history) => {
        const { stack: current } = latest.current
        const system = xeniaPrompt('stackAsk', useSettings.getState().xeniaPrompts)
        const messages = buildTemplateMessages(system, history, text, current.template)
        let reply = ''
        for await (const chunk of sendMessage(messages, connection, signal)) reply += chunk.content ?? ''
        const parsed = parseTemplateReply(reply)
        if (parsed.template === undefined) return { reply: parsed.text }
        const before = current.template
        // ponytail: writes over the draft as it was at send time, like the Look ask.
        latest.current.onChange({ ...current, template: parsed.template })
        return {
          reply: `${parsed.text}

Template updated.`.trim(),
          undo: () => latest.current.onChange({ ...latest.current.stack, template: before }),
        }
      },
    }),
    [],
  )
  useAskContext(askContext)
  return null
}
