import { useEffect, useState } from 'react'
import type { Message } from '../../core/storage/types'
import { buildRequestBody, redact } from '../../core/connectors/buildRequestBody'
import { buildPrompt } from '../../core/prompt/buildPrompt'
import { emptyWorldInfo, type ResolvedWorldInfo } from '../../core/prompt/worldInfo'
import { loadTokenizer } from '../../core/prompt/budget'
import { tokenizerFor, defaultTokenizer } from '../../core/prompt/tokenizers'
import { useCharacters } from '../../core/stores/charactersStore'
import { useChats, resolvedConnection, worldInfoFor } from '../../core/stores/chatStore'
import { nextSpeakerId } from '../../core/stores/roster'
import { useDraft } from '../../core/stores/draftStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings, useActiveConnection } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import PromptPreviewPanel from '../../app/PromptPreviewPanel'
import { paramDefList } from '../../core/stores/paramDefsStore'
import { budgetOf, maxTokensOf } from '../../core/params/connectionParams'

/**
 * What the next send would contain, rendered in the sidebar next to the chat's other settings.
 * It calls `buildPrompt` and `buildRequestBody`, the same two functions the send path calls.
 * What it shows and what goes over the wire can't diverge.
 *
 * debounced full rebuild, no incremental diffing, profile before optimising.
 */
export default function PromptPanel() {
  const chat = useChats((s) => s.chat)
  const messages = useChats((s) => s.messages)
  const characters = useCharacters((s) => s.characters)
  const character = characters.find((c) => c.id === chat?.characterId)
  const personas = usePersonas((s) => s.personas)
  const activePersonaId = useSettings((s) => s.activePersonaId)
  const activeStackId = useSettings((s) => s.activeStackId)
  const tagRules = useSettings((s) => s.appearance.tagRules)
  // Subscribed to only so edits in Settings re-render this; the value comes from the store helper
  // below, which is the one place override precedence is applied.
  const activeConnection = useActiveConnection()
  // The chat's own stack wins, as it does on the send path, otherwise the preview would show a
  // prompt built from a stack the send never uses.
  const stack = useStacks((s) => s.stacks.find((x) => x.id === (chat?.stackId ?? activeStackId)))
  const draftText = useDraft((s) => s.text)

  const [typed, setTyped] = useState(draftText)
  const [ready, setReady] = useState(false)
  // Resolved in an effect rather than inline: matching reads entries out of storage, and it has to
  // run against the same pending history the preview is built from.
  const [worldInfo, setWorldInfo] = useState<ResolvedWorldInfo>(emptyWorldInfo)
  const speakerId = chat ? (nextSpeakerId(chat) ?? chat.characterId) : null

  // activeConnection, not the resolved one: `tokenizer` isn't overridable, and the resolved
  // connection isn't built until further down.
  const tokenizerId = activeConnection ? tokenizerFor(activeConnection) : defaultTokenizer

  useEffect(() => {
    setReady(false)
    loadTokenizer(tokenizerId).then(() => setReady(true))
  }, [tokenizerId])

  useEffect(() => {
    const speaker = characters.find((c) => c.id === speakerId)
    if (!chat || !speaker) return setWorldInfo(emptyWorldInfo)
    // The unsent draft counts as the next user turn here too: a key typed into the composer
    // shows its entry appearing in the preview.
    const pending: Message[] = typed.trim()
      ? [...messages, { ownerId: 'local', chatId: chat.id!, role: 'user' as const, content: typed, createdAt: Date.now() }]
      : messages
    let live = true
    worldInfoFor(speaker, chat, pending, stack?.worldInfoBudget).then((resolved) => {
      if (live) setWorldInfo(resolved)
    })
    return () => {
      live = false
    }
  }, [chat, characters, speakerId, messages, typed, stack?.worldInfoBudget])

  // Token counting on every keystroke is the one thing here that could feel slow.
  useEffect(() => {
    const timer = setTimeout(() => setTyped(draftText), 200)
    return () => clearTimeout(timer)
  }, [draftText])

  const persona = personas.find((p) => p.id === activePersonaId) ?? personas[0]
  if (!chat || !character || !persona || !stack) return null

  // The preview is of the *next* turn: it resolves against whoever is up, card, labels, params.
  const speaker = characters.find((c) => c.id === nextSpeakerId(chat)) ?? character
  const connection = activeConnection && resolvedConnection(speaker, chat)

  // The unsent draft counts as the next user turn.
  const pending: Message[] = typed.trim()
    ? [...messages, { ownerId: 'local', chatId: chat.id!, role: 'user', content: typed, createdAt: Date.now() }]
    : messages

  const built = buildPrompt(
    {
      stack,
      character,
      persona,
      chat,
      speaker,
      messages: pending,
      worldInfo,
      tagRules,
    },
    budgetOf(connection),
  )

  let body: string | undefined
  let bodyError = ''
  if (connection) {
    try {
      body = JSON.stringify(redact(buildRequestBody(built.messages, connection, paramDefList()), connection))
    } catch (err) {
      bodyError = (err as Error).message
    }
  }

  const margin = connection
    ? Math.floor((connection.contextLimit * connection.safetyMarginPct) / 100)
    : 0

  return (
    <PromptPreviewPanel
      messages={built.messages}
      dropped={built.dropped}
      json={body}
      jsonError={bodyError}
      notes={
        <>
          {!connection && <p className="hint">No active connection. Token limits are unknown.</p>}
          {!ready && <p className="hint">Loading tokenizer…</p>}

          {connection && (
            <p className="hint">
              {built.tokensUsed} of {connection.contextLimit} tokens. Fixed blocks{' '}
              {built.fixedTokens}, reply reserve {maxTokensOf(connection)}, safety margin{' '}
              {connection.safetyMarginPct}% ({margin}). History allowance {built.available}.
            </p>
          )}

          {built.overflow && (
            <p className="hint">
              The context limit can't fit the fixed blocks plus the reply reserve. No history is
              being sent.
            </p>
          )}

          {worldInfo.dropped.length > 0 && (
            <p className="hint">
              Over the world info budget, not sent:{' '}
              {worldInfo.dropped.map((d) => d.name || 'Unnamed').join(', ')}.
            </p>
          )}
        </>
      }
      footer={
        built.skipped.length > 0 && (
          <p className="hint">
            Skipped blocks:{' '}
            {built.skipped
              .map((s) => `${s.label} (${s.reason === 'disabled' ? 'disabled' : 'no text'})`)
              .join(', ')}
            .
          </p>
        )
      }
    />
  )
}
