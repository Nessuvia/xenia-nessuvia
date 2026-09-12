import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { relayConfigured, relayHost } from '../../core/multiplayer/relayConfig'
import { useSettings } from '../../core/stores/settingsStore'
import { useCharacters, displayName } from '../../core/stores/charactersStore'
import { useStacks } from '../../core/stores/stacksStore'
import { useMultiplayer } from '../../core/stores/multiplayerStore'
import { createSession } from '../../core/multiplayer/hostSession'
import { castBlock, narratorCharacter, narratorId, narratorName } from '../../core/multiplayer/narrator'
import EntityPicker from '../../app/EntityPicker'
import SessionView from './SessionView'
import { RelayNotice, relayNoticeAccepted, acceptRelayNotice } from './RelayNotice'
import { usePersonas } from '../../core/stores/personasStore'
import { buildPrompt } from '../../core/prompt/buildPrompt'
import { useDragReorder } from '../../app/useDragReorder'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import { Avatar } from '../../app/Avatar'
import '../../app/dragReorder.css'
import type { Character, Persona, PromptStack } from '../../core/storage/types'

/** The roster cap, as in `hostSession`. The Narrator is outside it. */
const maxCharacters = 4

export default function MultiplayerView(): JSX.Element {
  const phase = useMultiplayer((s) => s.phase)
  const relay = useSettings((s) => s.relay)
  const [accepted, setAccepted] = useState(relayNoticeAccepted)

  const haveRelay = relayConfigured(relay)

  if (phase !== 'idle') return <SessionView />
  if (!haveRelay) {
    return (
      <div className="multiplayerLanding">
        <p>No relay is configured. Set one up in Settings, under Multiplayer.</p>
      </div>
    )
  }
  // Ahead of the landing rather than the create button: picking a cast is already time spent on a
  // feature the user may not want once they read this.
  if (!accepted) {
    return (
      <div className="multiplayerLanding">
        <RelayNotice
          onAccept={() => {
            acceptRelayNotice()
            setAccepted(true)
          }}
        />
      </div>
    )
  }
  return <Landing />
}

function Landing(): JSX.Element {
  const characters = useCharacters((s) => s.characters)
  const loadCharacters = useCharacters((s) => s.load)
  const stacks = useStacks((s) => s.stacks)
  const loadStacks = useStacks((s) => s.load)
  const [picked, setPicked] = useState<number[]>([])
  const [stackId, setStackId] = useState<number | undefined>(undefined)
  const [personaLock, setPersonaLock] = useState(false)
  const storedRelay = useSettings((s) => s.relay)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [previewCollapsed, setPreviewCollapsed] = useState(false)
  const [persona, setPersona] = useState<Persona | null>(null)
  /** Whose turn the preview assembles: `narratorId` for the Narrator row, otherwise a character
   *  id. Undefined is slot 1. Preview-only, it is not carried into the session. */
  const [previewSpeakerId, setPreviewSpeakerId] = useState<number | undefined>(undefined)

  useEffect(() => {
    loadCharacters()
    loadStacks()
    usePersonas.getState().ensureActive().then(setPersona)
  }, [loadCharacters, loadStacks])

  // Slot order for {{char1}}…{{char4}}: `picked` is the order, and the list below lets the host
  // change it before starting.
  const { itemProps, over } = useDragReorder((from, to) =>
    setPicked((prev) => {
      const next = [...prev]
      next.splice(to, 0, ...next.splice(from, 1))
      return next
    }),
  )
  const cast = picked
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => !!c)

  const chatStacks = stacks.filter((s) => (s.kind ?? 'chat') === 'chat')
  const full = picked.length >= maxCharacters

  function toggle(id: number) {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < maxCharacters ? [...prev, id] : prev,
    )
  }

  async function create() {
    setError('')
    setCreating(true)
    try {
      const session = await createSession(cast, stackId, {
        personaLock,
        relay: storedRelay,
      })
      setLink(session.link)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (link) {
    return (
      <div className="multiplayerLanding">
        <h2>Session open</h2>
        <div className="sessionLink">
          <input type="text" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(link).then(() => setCopied(true))
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p className="pickerHint">The link works on the deployed site.</p>
      </div>
    )
  }

  return (
    <div className="multiplayerLanding">
      <h2>New session</h2>

      <div className="landingColumns">
        <div className="landingColumn">
        <section className="pickerBlock">
          <h3>Characters</h3>
          {characters.length === 0 ? (
            <p className="placeholder">No characters yet.</p>
          ) : (
            <EntityPicker
              items={characters.map((c) => ({
                key: String(c.id),
                label: displayName(c),
                avatar: c.avatar,
                avatarCrop: c.avatarCrop,
              }))}
              placeholder="Search characters..."
              emptyText="No characters."
              selectedKeys={picked.map(String)}
              disabledKeys={
                full
                  ? characters.filter((c) => !picked.includes(c.id!)).map((c) => String(c.id))
                  : []
              }
              rows={6}
              onPick={(item) => toggle(Number(item.key))}
            />
          )}
          <p className="pickerHint">
            Up to {maxCharacters} characters. {narratorName} is always present.
          </p>

          {cast.length > 0 && (
            <>
              <ul className="castSlotList">
                {/* Not a slot and not draggable: the Narrator has no {{charN}} token and never
                    moves. It is here to let the preview read as a Narrator turn. */}
                <li
                  className={`castSlotRow narratorSlotRow${previewSpeakerId === narratorId ? ' previewing' : ''}`}
                  onClick={() => setPreviewSpeakerId(narratorId)}
                >
                  <Avatar of={undefined} name={narratorName} />
                  <span className="castSlotName">{narratorName}</span>
                </li>
                {cast.map((c, i) => (
                  <li
                    key={c.id}
                    className={`castSlotRow${over === i ? ' dropTarget' : ''}${speakerIdOf(previewSpeakerId, cast) === c.id ? ' previewing' : ''}`}
                    onClick={() => setPreviewSpeakerId(c.id)}
                    {...itemProps(i)}
                  >
                    <span className="castSlotToken">{`{{char${i + 1}}}`}</span>
                    <Avatar of={c} name={displayName(c)} />
                    <span className="castSlotName">{displayName(c)}</span>
                    <DescriptionPicker character={c} onPick={() => setPreviewSpeakerId(c.id)} />
                  </li>
                ))}
              </ul>
              <p className="pickerHint">Drag to change slot order. Click a row to preview its turn.</p>
            </>
          )}
        </section>

        <section className="pickerBlock">
          <h3>Prompt stack</h3>
          {chatStacks.length === 0 ? (
            <p className="placeholder">No prompt stacks yet.</p>
          ) : (
            <ul className="pickerList">
              {chatStacks.map((s) => (
                <li key={s.id}>
                  <label>
                    <input
                      type="radio"
                      name="sessionStack"
                      checked={stackId === s.id}
                      onChange={() => setStackId(s.id)}
                    />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {error && <p className="chatError">{error}</p>}

        <button type="button" disabled={picked.length === 0 || creating} onClick={create}>
          Create session
        </button>
        </div>

        <div className="landingColumn">
          <section className="pickerBlock">
            <h3>Host options</h3>
            <p className="pickerHint">
              Relay: {relayHost(storedRelay)}. Change it in Settings, under Multiplayer. The
              address goes on the invite link.
            </p>

            <label className="pickerCheck">
              <input
                type="checkbox"
                checked={personaLock}
                onChange={(e) => setPersonaLock(e.target.checked)}
              />
              Lock guest personas
            </label>
            <p className="pickerHint">
              {personaLock
                ? 'Guests cannot edit their name, description or picture. You can edit anyone’s.'
                : 'Guests can edit their name, description and picture. A change takes effect on their next turn.'}
            </p>
          </section>

          <StackPreview
            stack={chatStacks.find((s) => s.id === stackId)}
            cast={cast}
            speakerId={speakerIdOf(previewSpeakerId, cast)}
            persona={persona}
            collapsed={previewCollapsed}
            onToggleCollapsed={() => setPreviewCollapsed((v) => !v)}
          />
        </div>
      </div>
    </div>
  )
}

/**
 * The row the preview is bound to, resolved against the current cast: the Narrator, a picked
 * character, or slot 1 when nothing is chosen or the chosen character has been unpicked.
 */
function speakerIdOf(chosen: number | undefined, cast: Character[]): number | undefined {
  if (chosen === narratorId) return narratorId
  if (chosen !== undefined && cast.some((c) => c.id === chosen)) return chosen
  return cast[0]?.id
}

/**
 * Which description of a character the prompt uses. Global scope: this writes
 * `activeDescriptionIndex` on the stored card, the same field the Characters tab edits. The choice
 * outlives the session and every other chat with this character sees it. The narrower level
 * (per-session, or per-chat) needs an override field the send path reads. `characterAt` in
 * chatStore resolves the speaker from the characters store rather than from the session cast. A
 * cast copy alone would not change what gets sent.
 *
 * Picking also moves the preview to this character: a description-bound block resolves against the
 * speaker. A flip on any other row would leave the preview unchanged and read as a dead control.
 */
function DescriptionPicker({
  character,
  onPick,
}: {
  character: Character
  onPick: () => void
}): JSX.Element | null {
  const save = useCharacters((s) => s.save)
  if (!character.altDescriptions.length) return null
  return (
    <select
      className="castSlotDescription"
      value={character.activeDescriptionIndex}
      title="Description"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        save({ ...character, activeDescriptionIndex: Number(e.target.value) })
        onPick()
      }}
    >
      <option value={-1}>Default</option>
      {character.altDescriptions.map((d, i) => (
        <option key={i} value={i}>
          {d.title || `Description ${i + 1}`}
        </option>
      ))}
    </select>
  )
}

/**
 * The picked stack assembled with the real cast: the host reads what a slot token turns into
 * before the room opens. Calls `buildPrompt` with the same arguments the session will
 * (`nameSpeakers` on, the cast in slot order). The preview cannot drift from what gets sent.
 * Speaker-bound blocks resolve against the row the host picked, slot 1 by default, or the
 * Narrator: that is how `[if Narrator]` branches get read before the room opens.
 */
function StackPreview({
  stack,
  cast,
  speakerId,
  persona,
  collapsed,
  onToggleCollapsed,
}: {
  stack: PromptStack | undefined
  cast: Character[]
  speakerId: number | undefined
  persona: Persona | null
  collapsed: boolean
  onToggleCollapsed: () => void
}): JSX.Element {
  if (collapsed) return <CollapseRail label="Preview" onToggle={onToggleCollapsed} />

  // Same split the send path uses: `character` is the chat's opener, `speaker` is whose turn it is.
  const speaker =
    speakerId === narratorId ? narratorCharacter() : cast.find((c) => c.id === speakerId)
  const speakerName = speaker ? (speakerId === narratorId ? narratorName : displayName(speaker)) : ''

  const header = (
    <div className="zoneHeader">
      <CollapseButton label="Preview" collapsed={false} onToggle={onToggleCollapsed} />
      <h3>Preview</h3>
      {speakerName && <span className="previewSpeakerName">{speakerName}&apos;s turn</span>}
    </div>
  )

  if (!stack || !persona || cast.length === 0) {
    return (
      <section className="pickerBlock castPreview">
        {header}
        <p className="placeholder">Pick a character and a prompt stack to preview.</p>
      </section>
    )
  }

  const built = buildPrompt({
    stack,
    character: cast[0],
    speaker,
    persona,
    messages: [],
    cast,
    // Only the host is in the room before it opens: {{personas}} previews one line. Guests are
    // appended to this same block as they join. `pushSessionPersonas` rebuilds it per turn.
    personas: castBlock([{ name: persona.name, description: persona.description }]),
    nameSpeakers: true,
    indent: true,
  })

  return (
    <section className="pickerBlock castPreview">
      {header}
      <div className="castPreviewList">
        {built.messages.map((m, i) => (
          <div className="castPreviewMessage" key={i}>
            <span className="blockRole">{m.role}</span>
            <pre>{m.content}</pre>
          </div>
        ))}
        {built.messages.length === 0 && <p className="placeholder">Nothing to send.</p>}
      </div>
    </section>
  )
}
