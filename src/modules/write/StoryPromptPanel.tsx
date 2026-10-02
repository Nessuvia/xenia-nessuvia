import { useEffect, useState } from 'react'
import { buildRequestBody, redact } from '../../core/connectors/buildRequestBody'
import { buildStoryPrompt, beatValues, countWords, storyScanText } from '../../core/prompt/buildStoryPrompt'
import { countTokens, loadTokenizer } from '../../core/prompt/budget'
import { tokenizerFor, defaultTokenizer } from '../../core/prompt/tokenizers'
import { withPlaceholder } from '../../core/prompt/miscPrompts'
import { useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings, useActiveConnection } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { splitDoc, storyInputs, useWrite } from '../../core/stores/writeStore'
import PromptPreviewPanel from '../../app/PromptPreviewPanel'
import { paramDefList } from '../../core/stores/paramDefsStore'
import { maxTokensOf } from '../../core/params/connectionParams'

/**
 * What the next generation would send, rendered in the Story rail. Continue at the cursor, or a
 * rewrite when there's a selection. It calls `buildStoryPrompt` and `buildRequestBody`, the same
 * two functions a generation calls.
 *
 * The document comes from the saved text, which the editor writes 500ms after the last keystroke.
 * The preview trails typing by about that long.
 */
export default function StoryPromptPanel() {
  const story = useWrite((s) => s.story)
  const cursor = useWrite((s) => s.cursor)
  const connection = useActiveConnection()
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const stack = useStacks((s) => s.stacks.find((x) => x.id === activeStoryStackId))
  // Subscribed to only so an edit to a cast member's card re-renders the preview.
  useCharacters((s) => s.characters)
  usePersonas((s) => s.personas)

  const [ready, setReady] = useState(false)
  const tokenizerId = connection ? tokenizerFor(connection) : defaultTokenizer
  useEffect(() => {
    setReady(false)
    loadTokenizer(tokenizerId).then(() => setReady(true))
  }, [tokenizerId])

  const text = story?.text ?? ''
  const { before, selection, after } = splitDoc(text, Math.min(cursor.from, text.length), Math.min(cursor.to, text.length))

  // Reading lorebook entries is async, so the match lands in the store and the render reads it.
  const worldInfo = useWrite((s) => s.worldInfo)
  const refreshWorldInfo = useWrite((s) => s.refreshWorldInfo)
  const worldInfoBudget = stack?.worldInfoBudget
  const note = story?.note ?? ''
  const { beat } = beatValues(story?.beats ?? [])
  useEffect(() => {
    if (story) refreshWorldInfo(storyScanText(before + selection, [note, beat]), worldInfoBudget)
  }, [story, before, selection, note, beat, worldInfoBudget, refreshWorldInfo])

  if (!story) return null
  if (!stack) return <p className="hint">No Story stack yet. It's created on the first generation.</p>

  const action = selection ? 'rewrite' : 'continue'
  const budget = connection
    ? { contextLimit: connection.contextLimit, maxTokens: maxTokensOf(connection), safetyMarginPct: connection.safetyMarginPct }
    : undefined
  const built = buildStoryPrompt(stack, storyInputs(story, { action, instruction: '', before, after, selection }, worldInfo), budget)

  let body: string | undefined
  let bodyError = ''
  if (connection) {
    try {
      body = JSON.stringify(redact(buildRequestBody(built.messages, withPlaceholder(connection, stack.miscPrompts), paramDefList()), connection))
    } catch (err) {
      bodyError = (err as Error).message
    }
  }

  const beforeTokens = countTokens(built.beforeIncluded)
  const margin = connection ? Math.floor((connection.contextLimit * connection.safetyMarginPct) / 100) : 0

  return (
    <PromptPreviewPanel
      messages={built.messages}
      json={body}
      jsonError={bodyError}
      notes={
        <>
          {!connection && <p className="hint">No active connection. Token limits are unknown.</p>}
          {!ready && <p className="hint">Loading tokenizer…</p>}
          <p className="hint">
            {action === 'rewrite' ? 'Rewrite of the selection.' : 'Continue at the cursor.'} {countWords(text)} words in the
            document.
          </p>
          {connection && (
            <p className="hint">
              {built.fixedTokens + beforeTokens} of {connection.contextLimit} tokens. Fixed text {built.fixedTokens}, document{' '}
              {beforeTokens}, reply reserve {maxTokensOf(connection)}, safety margin {connection.safetyMarginPct}% ({margin}).
            </p>
          )}
          {built.droppedChars > 0 && (
            <p className="hint">{built.droppedChars} characters from the top of the document don't fit and aren't sent.</p>
          )}
          {worldInfo.dropped.length > 0 && (
            <p className="hint">
              Over the world info budget, not sent: {worldInfo.dropped.map((d) => d.name || 'Unnamed').join(', ')}.
            </p>
          )}
        </>
      }
    />
  )
}
