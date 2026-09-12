import { useEffect, useState } from 'react'
import { buildRequestBody, redact } from '../../core/connectors/buildRequestBody'
import { buildStoryPrompt, castText, storyFit, storyScanText } from '../../core/prompt/buildStoryPrompt'
import { storyTokens } from '../../core/prompt/storyTokens'
import { loadTokenizer } from '../../core/prompt/budget'
import { tokenizerFor, defaultTokenizer } from '../../core/prompt/tokenizers'
import { useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings, useActiveConnection } from '../../core/stores/settingsStore'
import { useStacks } from '../../core/stores/stacksStore'
import { resolveCast, useWrite } from '../../core/stores/writeStore'
import PromptPreviewPanel from '../../app/PromptPreviewPanel'
import { paramDefList } from '../../core/stores/paramDefsStore'
import { maxTokensOf } from '../../core/params/connectionParams'
import { resolveParams } from '../../core/settings/resolveParams'

/**
 * What the next generation would send, rendered in the Story settings panel. It calls
 * `buildStoryPrompt` and `buildRequestBody`, the same two functions `generate` calls. What it
 * shows and what goes over the wire can't diverge.
 *
 * The prose comes from the saved Chapter, which the editor writes 800ms after the last keystroke.
 * The preview trails typing by about that long.
 */
export default function StoryPromptPanel() {
  const story = useWrite((s) => s.story)
  const chapters = useWrite((s) => s.chapters)
  const activeChapterId = useWrite((s) => s.activeChapterId)
  const activeBlockId = useWrite((s) => s.activeBlockId)
  const direction = useWrite((s) => s.story?.direction ?? '')
  const baseConnection = useActiveConnection()
  const activeStoryStackId = useSettings((s) => s.activeStoryStackId)
  const stack = useStacks((s) => s.stacks.find((x) => x.id === activeStoryStackId))
  // Subscribed to only so an edit to a cast member's card re-renders the preview.
  useCharacters((s) => s.characters)
  usePersonas((s) => s.personas)

  const [ready, setReady] = useState(false)
  const [typed, setTyped] = useState(direction)

  const tokenizerId = baseConnection ? tokenizerFor(baseConnection) : defaultTokenizer

  useEffect(() => {
    setReady(false)
    loadTokenizer(tokenizerId).then(() => setReady(true))
  }, [tokenizerId])

  // Token counting on every keystroke in the Direction box is the one thing here that could feel
  // slow.
  useEffect(() => {
    const timer = setTimeout(() => setTyped(direction), 200)
    return () => clearTimeout(timer)
  }, [direction])

  // Reading lorebook entries is async. The match can't happen in the render below. It lands in
  // the store, which is also where writeBlock reads it from: one value, one result in both places.
  const worldInfo = useWrite((s) => s.worldInfo)
  const refreshWorldInfo = useWrite((s) => s.refreshWorldInfo)
  const worldInfoBudget = stack?.worldInfoBudget
  useEffect(() => {
    if (!story || chapters.length === 0) return
    const active = chapters.find((c) => c.id === activeChapterId) ?? chapters.at(-1)
    const block = active?.blocks.find((b) => b.id === activeBlockId)
    const split = storyFit(chapters, active?.id ?? null, block?.id ?? null, block?.context ?? 'both')
    refreshWorldInfo(storyScanText(split.storyText, [typed, block?.beat ?? '']), worldInfoBudget)
  }, [story, chapters, activeChapterId, activeBlockId, typed, worldInfoBudget, refreshWorldInfo])

  if (!story || chapters.length === 0) return null
  if (!stack) return <p className="hint">No Story stack yet. It is created on the first generation.</p>

  // Same fallback generate() uses: no cursor yet means the last Chapter.
  const active = chapters.find((c) => c.id === activeChapterId) ?? chapters.at(-1)

  // The same story > connection resolution generate() does. The budget shown is the real one.
  const connection = baseConnection && resolveParams(baseConnection, undefined, story)

  // Split around the Block the cursor is in, the same way writeBlock() does. The preview shows
  // the "What follows" block the next generation would actually send, and honours that Block's own
  // context setting. The prose here is the saved text. It trails typing.
  const activeBlock = active?.blocks.find((b) => b.id === activeBlockId)
  const fit = storyFit(
    chapters,
    active?.id ?? null,
    activeBlock?.id ?? null,
    activeBlock?.context ?? 'both',
  )

  const budget = connection
    ? {
        contextLimit: connection.contextLimit,
        maxTokens: maxTokensOf(connection),
        safetyMarginPct: connection.safetyMarginPct,
      }
    : undefined

  const built = buildStoryPrompt(
    {
      stack,
      castText: castText(resolveCast(story.cast)),
      tokens: storyTokens({
        title: story.title,
        premise: story.premise ?? '',
        ending: story.ending ?? '',
        themes: story.themes ?? '',
        castNames: resolveCast(story.cast).map((m) => m.name),
        chapters,
        chapterId: active?.id ?? null,
        blockId: activeBlock?.id ?? null,
      }),
      ...fit,
      worldInfo: { before: worldInfo.before, after: worldInfo.after },
      direction: typed,
    },
    budget,
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
      json={body}
      jsonError={bodyError}
      notes={
        <>
          {!connection && <p className="hint">No active connection. Token limits are unknown.</p>}
          {!ready && <p className="hint">Loading tokenizer…</p>}

          {connection && (
            <p className="hint">
              {built.fixedTokens + built.storyTokens} of {connection.contextLimit} tokens. Fixed
              blocks {built.fixedTokens}, Story prose {built.storyTokens}, reply reserve{' '}
              {maxTokensOf(connection)}, safety margin {connection.safetyMarginPct}% ({margin}).
            </p>
          )}

          {worldInfo.dropped.length > 0 && (
            <p className="hint">
              Over the world info budget, not sent:{' '}
              {worldInfo.dropped.map((d) => d.name || 'Unnamed').join(', ')}.
            </p>
          )}

          {fit.degraded().count > 0 && (
            <p className="hint">
              {fit.degraded().count} of {fit.degraded().of} earlier blocks send their beat
              instructions in place of their prose.
            </p>
          )}
        </>
      }
    />
  )
}
