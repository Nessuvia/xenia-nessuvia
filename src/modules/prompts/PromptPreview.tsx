import { useEffect, useState } from 'react'
import type { Message, PromptStack } from '../../core/storage/types'
import { buildPrompt } from '../../core/prompt/buildPrompt'
import { buildStoryPrompt } from '../../core/prompt/buildStoryPrompt'
import { storyTokens } from '../../core/prompt/storyTokens'
import { emptyWorldInfo, type ResolvedWorldInfo } from '../../core/prompt/worldInfo'
import { worldInfoFor } from '../../core/stores/chatStore'
import { countTokens, loadTokenizer, perMessageOverhead } from '../../core/prompt/budget'
import { tokenizerFor, defaultTokenizer } from '../../core/prompt/tokenizers'
import { useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings, useActiveConnection, type Connection } from '../../core/stores/settingsStore'
import { CollapseButton, CollapseRail } from '../../app/CollapseButton'
import { budgetOf, maxTokensOf } from '../../core/params/connectionParams'
import { hasSource } from './stackKinds'

const defaultUserLine = 'Hello there.'

// Example inputs for the Story-stack preview, never persisted, editable, reset on reload.
const exampleStory = 'The tavern had emptied hours ago. Nessu wiped the last glass and set it down.'
const exampleDirection = 'Write a short paragraph continuing the scene.'
const exampleCast = 'Name: Nessuvia\nNessu is the Development Team Lead.'
// Stand-ins for the Story tokens: a stack that uses them previews as something readable rather
// than as a page of blanks. Every token gets a value: the point here is to show the stack's shape.
const exampleTokens = storyTokens({
  title: 'Last Call',
  premise: 'A barkeeper closes up and finds someone still sitting in the dark.',
  ending: 'She hands back the key.',
  themes: 'What closing time asks of you.',
  castNames: ['Nessuvia'],
  chapters: [
    {
      id: 1,
      title: 'Opening',
      summary: 'The tavern fills and empties.',
      targetWords: 0,
      blocks: [],
    },
    {
      id: 2,
      title: 'Last Call',
      summary: '',
      targetWords: 800,
      blocks: [
        { id: 'a', beat: 'Nessu notices the last customer', weight: 'brief' },
        { id: 'b', beat: 'She asks him to leave', weight: 'long' },
        { id: 'c', beat: 'He does not', weight: 'normal' },
      ],
    },
    {
      id: 3,
      title: 'After',
      summary: '',
      targetWords: 0,
      blocks: [{ id: 'd', beat: 'Dawn', weight: 'normal' }],
    },
  ],
  chapterId: 2,
  blockId: 'b',
})

export default function PromptPreview({
  stack,
  collapsed,
  onToggleCollapsed,
}: {
  stack: PromptStack
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const [ready, setReady] = useState(false)
  const activeConnection = useActiveConnection()
  const tokenizerId = activeConnection ? tokenizerFor(activeConnection) : defaultTokenizer

  useEffect(() => {
    setReady(false)
    loadTokenizer(tokenizerId).then(() => setReady(true))
  }, [tokenizerId])

  if (collapsed) {
    return <CollapseRail label="Preview" onToggle={onToggleCollapsed} />
  }

  const header = (
    <div className="zoneHeader">
      <CollapseButton label="Preview" collapsed={false} onToggle={onToggleCollapsed} />
      <h3>Preview</h3>
    </div>
  )

  return (stack.kind ?? 'chat') === 'story' ? (
    <StoryPreview stack={stack} header={header} ready={ready} />
  ) : (
    <ChatPreview stack={stack} header={header} ready={ready} />
  )
}

function budgetFor(connection?: Connection) {
  return connection
    ? {
        contextLimit: connection.contextLimit,
        maxTokens: maxTokensOf(connection),
        safetyMarginPct: connection.safetyMarginPct,
      }
    : undefined
}

// A Story stack has no character and no chat history: the Co-Writer takes a Story-context blob and
// a Direction. The preview mirrors that: example prose plus an example Direction, nothing else.
function StoryPreview({ stack, header, ready }: { stack: PromptStack; header: React.ReactNode; ready: boolean }) {
  const connection = useActiveConnection()
  const [storyText, setStoryText] = useState(exampleStory)
  const [direction, setDirection] = useState(exampleDirection)

  const built = buildStoryPrompt(
    {
      stack,
      castText: exampleCast,
      tokens: exampleTokens,
      storyText,
      direction,
    },
    budgetFor(connection),
  )

  return (
    <section className="panel stackZone preview">
      {header}

      <div className="previewExamples">
        <label>
          Example Story context
          <textarea rows={3} value={storyText} onChange={(e) => setStoryText(e.target.value)} />
        </label>
        <label>
          Example Direction
          <textarea rows={2} value={direction} onChange={(e) => setDirection(e.target.value)} />
        </label>
      </div>

      {!connection && <p className="hint">No active connection, token limits unknown.</p>}
      {!ready && <p className="hint">Loading tokenizer…</p>}

      {built.droppedChars > 0 && (
        <p className="hint">
          {built.droppedChars} characters of older Story prose would be dropped to fit the budget.
        </p>
      )}

      <div className="previewList">
        {built.messages.map((m, i) => (
          <div className="previewMessage" key={i}>
            <div className="previewMessageHeader">
              <span className="blockRole">{m.role}</span>
              <span className="hint">{countTokens(m.content) + perMessageOverhead} tokens</span>
            </div>
            <pre>{m.content}</pre>
          </div>
        ))}
        {built.messages.length === 0 && <p className="placeholder">Nothing to send.</p>}
      </div>
    </section>
  )
}

function ChatPreview({ stack, header, ready }: { stack: PromptStack; header: React.ReactNode; ready: boolean }) {
  const { characters, load } = useCharacters()
  const connection = useActiveConnection()
  const personas = usePersonas((s) => s.personas)
  const ensurePersona = usePersonas((s) => s.ensureActive)
  const activePersonaId = useSettings((s) => s.activePersonaId)

  const [characterId, setCharacterId] = useState<number | null>(null)
  const [charLine, setCharLine] = useState<string | null>(null)
  const [userLine, setUserLine] = useState(defaultUserLine)
  const [worldInfo, setWorldInfo] = useState<ResolvedWorldInfo>(emptyWorldInfo)

  useEffect(() => {
    load()
    ensurePersona()
  }, [load, ensurePersona])

  const character = characters.find((c) => c.id === characterId) ?? characters[0]

  const persona = personas.find((p) => p.id === activePersonaId) ?? personas[0]

  // example lines only, never persisted, reload resets them.
  const history: Message[] = [
    {
      ownerId: 'local',
      chatId: 0,
      role: 'assistant',
      content: charLine ?? character?.firstMessage ?? 'Hello yourself.',
      createdAt: 1,
    },
    { ownerId: 'local', chatId: 0, role: 'user', content: userLine, createdAt: 2 },
  ]

  // No chat here: the books in play are the character's plus every global one. Matched against
  // the example lines above, a key typed into the user line shows its entry appearing.
  // Deps are the values `history` is built from, the array itself is new on every render.
  useEffect(() => {
    if (!character) return setWorldInfo(emptyWorldInfo)
    let live = true
    worldInfoFor(character, null, history, stack.worldInfoBudget).then((resolved) => {
      if (live) setWorldInfo(resolved)
    })
    return () => {
      live = false
    }
  }, [character, charLine, userLine, stack.worldInfoBudget])

  if (!character || !persona) {
    return (
      <section className="panel stackZone">
        {header}
        <p className="hint">Add a character to preview the assembled prompt.</p>
      </section>
    )
  }

  // The same call the send path makes: the preview can't drift from what gets sent. Counts and
  // warnings read from this one. Indentation never touches the numbers.
  const built = buildPrompt({ stack, character, persona, messages: history, worldInfo }, budgetOf(connection))
  // A second, display-only pass with nested content indented. Same inputs: its messages line up
  // 1:1 with `built` (indentation doesn't change role boundaries), and the <pre> shows this text.
  const display = buildPrompt(
    { stack, character, persona, messages: history, worldInfo, indent: true },
    budgetOf(connection),
  )

  return (
    <section className="panel stackZone preview">
      {header}

      <select
        value={character.id}
        onChange={(e) => {
          setCharacterId(Number(e.target.value))
          setCharLine(null)
        }}
        aria-label="Preview character"
      >
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="previewExamples">
        <label>
          Example first message
          <textarea
            rows={2}
            value={charLine ?? character.firstMessage ?? ''}
            onChange={(e) => setCharLine(e.target.value)}
          />
        </label>
        <label>
          Example user reply
          <textarea rows={2} value={userLine} onChange={(e) => setUserLine(e.target.value)} />
        </label>
      </div>

      {!connection && <p className="hint">No active connection, token limits unknown.</p>}
      {!ready && <p className="hint">Loading tokenizer…</p>}

      {built.overflow && (
        <p className="error">
          The context limit can't fit the fixed blocks plus the reply reserve. No history is being
          sent, raise contextLimit or lower maxTokens.
        </p>
      )}

      {built.droppedCount > 0 && !built.overflow && (
        <p className="hint">
          {built.droppedCount} older history message{built.droppedCount === 1 ? '' : 's'} would be
          dropped.
        </p>
      )}

      {worldInfo.dropped.length > 0 && (
        <p className="hint">
          Over the world info budget, not sent: {worldInfo.dropped.map((d) => d.name || 'Unnamed').join(', ')}.
        </p>
      )}

      {worldInfo.atDepth.length > 0 && !hasSource(stack, 'worldInfoDepth') && (
        <p className="hint">
          Entries positioned at a depth are going in as system turns. Add a World info, at depth
          block to set their role.
        </p>
      )}

      <div className="previewList">
        {built.messages.map((m, i) => (
          <div className="previewMessage" key={i}>
            <div className="previewMessageHeader">
              <span className="blockRole">{m.role}</span>
              <span className="hint">{countTokens(m.content) + perMessageOverhead} tokens</span>
            </div>
            <pre>{display.messages[i]?.content ?? m.content}</pre>
          </div>
        ))}
        {built.messages.length === 0 && <p className="placeholder">Nothing to send.</p>}
      </div>
    </section>
  )
}
