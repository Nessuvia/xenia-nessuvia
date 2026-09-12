import type { StreamChunk } from '../connectors/connectorInterface'
import type { Character, Message } from '../storage/types'
import type { Connection } from '../stores/settingsStore'
import { resolveConnection, useSettings } from '../stores/settingsStore'
import { sendMessage } from '../connectors/openaiCompatible'
import { isSentinel } from '../connectors/sentinel'
import { withParam, maxTokensOf, budgetOf, getParam } from '../params/connectionParams'
import { loadTokenizer } from '../prompt/budget'
import { tokenizerFor } from '../prompt/tokenizers'
import { buildCensus, type Census } from '../quality/census'
import { bannedList } from '../quality/bannedStrings'
import { type LexiconEntry } from '../quality/lexicon'
import { decideRewrite, verdictSummary } from '../quality/decide'
import type { ScoreContext } from '../quality/score'
import { collectFindings, type Findings } from './collect'
import { punctuationStream } from './punctuation'
import type { PassContext } from './passContext'
import type { DetectSettings } from './detectSettings'
import { buildCleanPrompt, shouldRunClean } from './buildCleanPrompt'
import { buildRewritePrompt } from './buildRewritePrompt'
import { lengthGuard } from './lengthGuard'
import {
  activeStages,
  type CleanStage,
  type Pipeline,
  type RewriteStage,
  type ScoreStage,
  type Stage,
} from './pipeline'

/**
 * Nessu's Pass: run a pipeline over a finished assistant reply.
 *
 * The reply is already written when this is called. That is the shape the merge settled on: the
 * send path streams the model's own text, the user reads it, and the pass works it over
 * afterwards. A stage that changes the text hands its output to the next stage, so a clean
 * followed by a rewrite rewrites the cleaned text, and a score stage judges whatever the stage
 * before it produced against whatever went into that stage.
 *
 * Yielded `content` is provisional: it is the candidate arriving, which the caller may render over
 * the reply. What gets *stored* is the returned outcome. A candidate that fails its score stage is
 * never in that outcome, and the caller keeps what it had.
 */
export interface RunContext extends PassContext {
  /** Whose card frames a rewrite. */
  character?: Character
  /** The chat up to but not including the message being worked on, oldest first. */
  priorMessages: Message[]
  /** The {{user}} name, for token substitution in a rewrite preset. */
  userName: string
  /** Proper nouns a rewrite may use even when the passage does not contain them. */
  allowNames: string[]
}

export interface PassOutcome {
  /** What to store. Equal to the input text when nothing survived. */
  text: string
  /** The text as it was before the pipeline ran. Kept so a re-run always starts from the true
   *  original rather than compounding rewrites, and so the bubble can show both. */
  original: string
  /** One line naming what happened, for the bubble. Absent when nothing happened. */
  summary?: string
  /** Why a stage's candidate was thrown away. Absent when nothing was thrown away. */
  failed?: string
}

/** Which stage is working, for the caller's progress line. */
export interface StageChunk {
  stage?: { id: string; kind: Stage['kind']; label: string }
}

export async function* runPipeline(
  text: string,
  pipeline: Pipeline,
  context: RunContext,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk & StageChunk, PassOutcome> {
  const original = text
  let current = text
  const summaries: string[] = []
  let failed: string | undefined

  const lexicon = pipeline.lexicon
  const census = buildCensus(context.history ?? [], pipeline.census)
  const findings = collectFindings(current, pipeline.detect, context)
  /** Where each rewrite stage's candidate came from, so a score stage after it compares the pair
   *  that was actually made. Per run, not module state: two chats can pass at once. */
  const sources = new Map<string, string>()

  for (const stage of activeStages(pipeline)) {
    yield { stage: { id: stage.id, kind: stage.kind, label: stage.label } }

    if (stage.kind === 'gate') {
      const reasons =
        findings.notes.length + (stage.config.standingCounts ? findings.standing.length : 0)
      if (reasons < Math.max(0, stage.config.minNotes)) {
        // The gate stopped the pipeline, which is the gate working. Not a failure, and nothing is
        // marked on the message: the reply was clean enough to leave alone.
        return finish(current, original, summaries, failed)
      }
      continue
    }

    if (stage.kind === 'clean') {
      // The mechanical half is free and has already happened, in `collectFindings`. Taking it is
      // what makes a clean stage worth running with no connection at all.
      if (findings.cleaned !== current) {
        current = findings.cleaned
        summaries.push('cleaned')
      }
      const edited = yield* runClean(current, stage, findings, pipeline.detect.punctuation, signal)
      if (edited && edited !== current) {
        current = edited
        summaries.push('edited')
      }
      continue
    }

    if (stage.kind === 'rewrite') {
      const before = current
      const result = yield* runRewrite(before, stage, context, census, lexicon, signal)
      if ('reason' in result) {
        failed = result.reason
        continue
      }
      current = result.text
      summaries.push('rewritten')
      // A score stage right after this one judges `before` against `current`. Carried on the
      // candidate rather than recomputed, so the pair being compared is the pair that was made.
      sources.set(stage.id, before)
      continue
    }

    // score: judge the candidate against what went into the stage that made it.
    const source = lastCandidateSource(pipeline, stage, sources) ?? original
    const verdict = judge(source, current, stage, pipeline, context, census, lexicon)
    if ('reason' in verdict) {
      failed = verdict.reason
      current = source
      // The rewrite it was judging is gone, so the summary that claimed it is too.
      const at = summaries.lastIndexOf('rewritten')
      if (at >= 0) summaries.splice(at, 1)
      continue
    }
    current = verdict.text
    summaries.push(verdict.summary)
  }

  return finish(current, original, summaries, failed)
}

function lastCandidateSource(
  pipeline: Pipeline,
  stage: ScoreStage,
  sources: Map<string, string>,
): string | undefined {
  const stages = activeStages(pipeline)
  const at = stages.indexOf(stage)
  for (let i = at - 1; i >= 0; i--) {
    const prior = stages[i]
    if (prior.kind === 'rewrite') return sources.get(prior.id)
  }
  return undefined
}

function finish(
  text: string,
  original: string,
  summaries: string[],
  failed?: string,
): PassOutcome {
  const changed = text !== original
  return {
    text,
    original,
    summary: changed && summaries.length ? summaries.join(', ') : undefined,
    failed,
  }
}

/**
 * The clean stage's model request: the cleaned passage plus its notes, back as the whole passage.
 *
 * Returns the edited text, or undefined when no request was made or the request produced nothing.
 * A failed edit is not recorded as a failure: the text it was editing is a real reply, and losing
 * it to a second request that need not have been made would be the worse outcome.
 */
async function* runClean(
  text: string,
  stage: CleanStage,
  findings: Findings,
  punctuation: DetectSettings['punctuation'],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk, string | undefined> {
  const { connectionId, userPrompt, skipWhenClean } = stage.config
  if (!shouldRunClean(findings.notes, userPrompt, skipWhenClean, findings.standing)) return undefined

  const editor = resolveConnection(connectionId)
  // The sentinel counts as no connection: it would answer the edit request with its own next line,
  // which would then be stored as the reply. A real passage is worth more unedited than replaced.
  if (!editor || isSentinel(editor.endpointUrl)) return undefined

  const wide = withParam(editor, 'max_tokens', Math.max(maxTokensOf(editor), estimateTokens(text)))
  // The edited text gets the punctuation sweep too. The model is told not to write em dashes and
  // writes them anyway, both by missing one and by introducing a fresh one while fixing something
  // else, and this is the last look anything takes at the text.
  const sweep = punctuationStream(punctuation)

  let edited = ''
  try {
    const prompt = buildCleanPrompt(text, findings.notes, userPrompt, findings.standing)
    for await (const chunk of sendMessage(prompt, wide, signal)) {
      if (chunk.content) {
        edited += chunk.content
        const out = sweep.push(chunk.content)
        if (out) yield { content: out }
      }
    }
    const tail = sweep.flush()
    if (tail) yield { content: tail }
  } catch (err) {
    if (signal?.aborted) throw err
    return undefined
  }
  return edited.trim() ? edited : undefined
}

/** The rewrite stage's request: a second model, a slim window, the whole passage back. */
async function* runRewrite(
  text: string,
  stage: RewriteStage,
  context: RunContext,
  census: Census,
  lexicon: LexiconEntry[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk, { text: string } | { reason: string }> {
  const connection = rewriteConnection(stage.config.connectionId)
  if (!connection) return { reason: 'No connection is set for the rewrite stage.' }

  await loadTokenizer(tokenizerFor(connection))
  const banned = bannedList(census, lexicon)

  const messages = buildRewritePrompt(
    {
      character: stage.config.includeCharacter ? context.character : undefined,
      userName: context.userName,
      messages: context.priorMessages,
      text,
      config: stage.config,
      banned,
    },
    budgetOf(connection),
  )
  if (!messages.length) return { reason: 'The rewrite stage has no preset text.' }

  let wide = withParam(
    connection,
    'max_tokens',
    Math.max(maxTokensOf(connection), estimateTokens(text)),
  )
  // Only when the connection already carries the param. Adding a key an endpoint has never been
  // told about is how a request starts coming back 400, and which endpoints accept `banned_strings`
  // is not something this file can know: the user adding the knob is the signal that theirs does.
  if (
    stage.config.samplerBannedList &&
    banned.length &&
    getParam(connection, 'banned_strings') !== undefined
  ) {
    wide = withParam(wide, 'banned_strings', banned)
  }

  let rewrite = ''
  try {
    for await (const chunk of sendMessage(messages, wide, signal)) {
      if (chunk.content) {
        rewrite += chunk.content
        yield { content: chunk.content }
      }
      // The rewriting model's reasoning is not the message's reasoning: the first model's is what
      // the bubble shows, and this one belongs to a request the user did not ask to see.
    }
  } catch (err) {
    // A deliberate stop throws through, same as the normal send path. Anything else is a failed
    // rewrite, and a failed rewrite keeps the passage that already exists.
    if (signal?.aborted) throw err
    return { reason: (err as Error).message }
  }

  return rewrite.trim() ? { text: rewrite } : { reason: 'The rewrite came back empty.' }
}

/** The score stage: the length band, then the per-paragraph decision. */
function judge(
  source: string,
  candidate: string,
  stage: ScoreStage,
  pipeline: Pipeline,
  context: RunContext,
  census: Census,
  lexicon: LexiconEntry[],
): { text: string; summary: string } | { reason: string } {
  // Whole-message first: an empty or runaway candidate is rejected outright, and chunk work on it
  // would be measuring something that was never a candidate.
  const rejected = lengthGuard(source, candidate, stage.config)
  if (rejected) return { reason: rejected }

  const scoreContext: ScoreContext = {
    census,
    lexicon,
    rules: pipeline.detect.rules,
    role: 'assistant',
  }
  const quality = {
    ...stage.config.quality,
    invariants: { ...stage.config.quality.invariants, allowNames: context.allowNames },
  }
  const verdict = decideRewrite(source, candidate, scoreContext, quality)
  if (!verdict.changed) {
    return { reason: verdict.decisions[0]?.reason ?? 'No passage scored better than the original.' }
  }
  return { text: verdict.text, summary: verdictSummary(verdict) }
}

/**
 * The connection a rewrite stage sends on.
 *
 * Named outright, with no fallback to the active connection: rewriting with the connection that
 * just wrote the reply is the one thing the stage must not do silently. The sentinel counts as
 * none, since it answers with a fixed line rather than model output.
 */
export function rewriteConnection(connectionId: string): Connection | undefined {
  if (!connectionId) return undefined
  const found = useSettings.getState().connections.find((c) => c.id === connectionId)
  return found && !isSentinel(found.endpointUrl) ? found : undefined
}

/** Rough token count for sizing a request's budget. Four characters per token is the usual English
 *  approximation, and this only has to be big enough, never exact. The real tokenizer in
 *  `core/prompt/budget` is for counting what is sent, not for padding a limit. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4) + 200
}
