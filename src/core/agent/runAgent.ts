// Extension-ful imports on purpose: checkRunAgent.ts runs this under `node --experimental-strip-types`.
// Nothing here may reach the store or a connector. The caller supplies `complete`.
import type { ChatMessage } from '../connectors/connectorInterface'
import { findFlags, stripText, type Flag } from '../hammer/strip.ts'
import { applyLexicon } from '../quality/lexicon.ts'
import { sentences } from '../quality/sentences.ts'
import type { AgentRun } from './postStack.ts'
import { flagMessage } from './rules.ts'
import { applyLint, defaultLintConfig } from './lintRules.ts'
import { addsSpeech, echoes, findFlowHits, keepsSpeech } from './flowRules.ts'
import { loadVad } from '../quality/vad.ts'
import { defaultVadLimits, textVadAllows } from './vadGuard.ts'
import { keepsCommitments } from './dialogueGuard.ts'
import { drawNarrationWindow, textSeed } from './styleDraw.ts'
import { quotedRanges } from '../quality/temperature.ts'
import { agentBeat, changedRanges, flashed, freshRuns, mergeMarks, type AgentStage, type Mark, type Marked } from './stage.ts'

/** One model call. Returns the reply text, or '' on failure. */
export type Complete = (messages: ChatMessage[]) => Promise<string>

export interface AgentOutcome {
  text: string
  /** What changed, in one line. Absent when nothing changed. */
  summary?: string
  /** Rewrites that kept the original. Absent when none did. */
  failed?: string
}

export type Operation = 'keep' | 'rewrite' | 'delete'

/** Delete beats rewrite. Swaps already ran. */
export function operationFor(flags: Flag[]): Operation {
  if (flags.some((f) => f.rule.action === 'delete')) return 'delete'
  return flags.length ? 'rewrite' : 'keep'
}

/** The in-code edits: lexicon, then `swap` rules. */
export function agentSwap(text: string, config: AgentRun): string {
  const ignore = config.ignore ?? []
  return stripText(applyLexicon(text, config.lexicon, ignore), config.rules, undefined, ignore).text
}

/** The `rewrite` and `delete` hits in a piece of text. */
export function agentFlags(text: string, config: AgentRun): Flag[] {
  return findFlags(text, config.rules, undefined, config.ignore ?? [])
}

/**
 * Flags per sentence, matched against the whole paragraph. A rule can span sentences
 * ("She didn't cry. She screamed."), and such a hit lands on every sentence it touches.
 */
export function sentenceFlags(para: string, sents: { start: number; end: number }[], config: AgentRun): Flag[][] {
  const flags = agentFlags(para, config)
  return sents.map((s) => flags.filter((f) => f.start < s.end && f.end > s.start))
}

/** Two failing sentences, or one hit from a `wholeParagraph` rule, send the paragraph instead of a sentence. */
export function rewritesParagraph(failingFlags: Flag[][]): boolean {
  return failingFlags.length >= 2 || failingFlags.some((flags) => flags.some((f) => f.rule.wholeParagraph))
}

const maxFlowFixes = 8

/** Paragraph rewrites in flight at once. Above this, the endpoint sees a burst of requests. */
const maxParallelRewrites = 3

const sentenceSystem = 'You edit one sentence of a story reply. Keep its meaning, voice and tense. Reply with the new sentence only.'
const passageSystem = 'You edit one passage of a story reply. Keep what happens, the dialogue word for word, and the tense. Use plain words. Add no new details and no dialogue tags. Reply with the new passage only.'
const flowSystem = 'You smooth the flow of a story reply. Fix the transitions and rhythm between sentences. Keep every event, image and detail, the dialogue word for word, the tense and the paragraph breaks. Use plain words. Reply with the full reply only.'
const dialogueSystem = 'You edit the dialogue in a story reply. Make each quoted line sound spoken, the way this character talks, and answer what was just said to them. You may add one short line of dialogue if it answers the last message and fits the chat. Keep the narration outside the quotes word for word, adding only a tag for a new line. Keep every name, number, refusal and question the dialogue already has. Use plain words. Reply with the full reply only.'
const paragraphSystem = 'You edit one paragraph of a story reply. Keep its meaning, voice and tense. Reply with the new paragraph only.'

/** The slice of a chat message `recentContext` reads. */
export interface ContextMessage {
  role: 'user' | 'assistant'
  content: string
  speakerName?: string
  personaName?: string
  reasoningEnd?: number
}

/** The last `count` messages as `Name: text`, think blocks left out. '' when there are none. */
export function recentContext(messages: ContextMessage[], count: number): string {
  // A stack saved before the field existed has no count, and sends none.
  if (!(count > 0)) return ''
  return messages
    .slice(-count)
    .map((m) => {
      const name = m.role === 'user' ? (m.personaName ?? 'User') : (m.speakerName ?? 'Character')
      return `${name}: ${m.content.slice(m.reasoningEnd ?? 0).trim()}`
    })
    .join('\n\n')
}

/** The scene around a paragraph: recent chat, then the paragraphs either side of it. */
function surroundings(context: string | undefined, before: string | undefined, after: string | undefined): string {
  const section = (label: string, text: string | undefined) => (text?.trim() ? `${label}:\n${text.trim()}\n\n` : '')
  return section('Recent chat', context) + section('Before', before) + section('After', after)
}

function problems(flags: Flag[]): string {
  return flags.map((f) => `- ${flagMessage(f.rule, f.slice)}`).join('\n')
}

/**
 * Work a reply over sentence by sentence.
 * Swaps run in code first: lexicon, then `swap` rules.
 * A paragraph with one failing sentence gets a sentence rewrite.
 * A paragraph with two or more, or a hit from a `wholeParagraph` rule, gets one paragraph rewrite.
 * A candidate is accepted once no rule flags it after swaps.
 * After `maxTries` rejected candidates the text stays as it was.
 */
export async function runAgent(
  text: string,
  config: AgentRun,
  complete: Complete,
  /**
   * The current text and the sentences still being worked on. Called before work and after each paragraph.
   * Stylized runs pass `stage` instead of `pending`, and report every step.
   */
  onProgress?: (text: string, pending: string[], stage?: AgentStage) => void,
  /** Present means Stylized: deletes show and strike out one by one, and each step waits one beat. */
  wait?: (ms: number) => Promise<void>,
): Promise<AgentOutcome> {
  const swap = (s: string) => agentSwap(s, config)
  const flagsIn = (s: string) => agentFlags(s, config)
  const tries = Math.max(1, Math.floor(config.maxTries))

  const tryRewrite = async (messages: ChatMessage[], accept: (candidate: string) => boolean = () => true): Promise<string | null> => {
    for (let i = 0; i < tries; i++) {
      const candidate = swap((await complete(messages)).trim())
      if (candidate && !flagsIn(candidate).length && accept(candidate)) return candidate
    }
    return null
  }

  // Style checks run once on the reply, not on rewrite candidates.
  if (config.lint?.enabled) await loadVad()
  const linted = applyLint(swap(text), config.lint ?? defaultLintConfig, config.ignore ?? [])
  const swapped = linted.text
  let rewritten = 0
  let deleted = 0
  let kept = 0

  // Odd indices are the blank-line separators. Deletes apply up front to what the model sees.
  const parts = swapped.split(/(\n\s*\n)/)
  let offset = 0
  const plans = parts.map((para, p) => {
    const at = offset
    offset += para.length
    if (p % 2) return null
    const sents = sentences(para)
    const flags = sentenceFlags(para, sents, config)
    const ops = flags.map(operationFor)
    const texts: (string | null)[] = sents.map((s, i) => (ops[i] === 'delete' ? null : s.text))
    deleted += ops.filter((op) => op === 'delete').length
    parts[p] = rebuild(para, sents, texts)
    return { para, at, sents, flags, ops, texts, failing: ops.flatMap((op, i) => (op === 'rewrite' ? [i] : [])) }
  })

  // Stylized only: what the reader sees, which lags `parts` while deletes strike out one at a time.
  // `whole` is a paragraph rewrite that replaced every row.
  const beat = agentBeat(deleted + plans.reduce((n, plan) => n + (plan?.failing.length ?? 0), 0))
  const flashes = wait ? changedRanges(text, swapped) : []
  const shown = plans.map(
    (plan) =>
      plan && {
        whole: null as string | null,
        rows: plan.sents.map((s, i): { text: string | null; mark: Mark } => ({ text: s.text, mark: plan.ops[i] === 'keep' ? 'none' : 'pending' })),
      },
  )
  // Set once the detector and whole-reply steps start: `parts` has collapsed to one string by then, and
  // the paragraph plans above no longer describe it.
  let override: Marked[] | null = null
  const marks = (): Marked[] =>
    override ??
    mergeMarks(
      parts.flatMap((part, p): Marked[] => {
        const plan = plans[p]
        const show = shown[p]
        if (!plan || !show) return [{ text: part, mark: 'none' }]
        if (show.whole !== null) return [{ text: show.whole, mark: 'fresh' }]
        if (!plan.sents.length) return [{ text: plan.para, mark: 'none' }]
        const out: Marked[] = []
        let prevEnd = 0
        plan.sents.forEach((s, i) => {
          const gap = plan.para.slice(prevEnd, s.start)
          prevEnd = s.end
          const row = show.rows[i]
          if (row.text === null) return
          out.push({ text: out.length ? gap : plan.para.slice(0, plan.sents[0].start), mark: 'none' })
          if (plan.ops[i] === 'keep') out.push(...flashed(s.text, plan.at + s.start, flashes))
          else out.push({ text: row.text, mark: row.mark })
        })
        out.push({ text: plan.para.slice(prevEnd), mark: 'none' })
        return out
      }),
    )

  // Paragraphs with a rewrite still in flight. Rewrites run several at a time, so this is a set
  // rather than a point in the walk.
  const inFlight = new Set(plans.flatMap((plan, p) => (plan?.failing.length ? [p] : [])))

  // An aborted run can leave the delete walk mid-beat. Nothing reports after the run ends.
  let done = false
  const report = () => {
    if (done) return
    if (!wait) {
      onProgress?.(parts.join(''), [...inFlight].sort((a, b) => a - b).flatMap((p) => plans[p]!.failing.map((i) => plans[p]!.sents[i].text)))
      return
    }
    const stage = { marks: marks(), beat }
    onProgress?.(stage.marks.map((run) => run.text).join(''), [], stage)
  }
  report()

  /**
   * Progress for the steps after the rule rewrites. Stylized shows `runs` and, with `pause`, holds a
   * beat so a fresh span can fade in. Default blurs `pending`.
   */
  const show = async (runs: Marked[], pending: string[], pause: boolean) => {
    if (done) return
    if (!wait) {
      onProgress?.(parts.join(''), pending)
      return
    }
    override = mergeMarks(runs)
    report()
    if (pause) await wait(beat)
  }

  // Every doomed sentence strikes on the same beat and they dissolve together: one motion over the
  // whole reply rather than a queue draining top to bottom. Runs on its own timer, so a slow
  // rewrite never holds it up.
  const deletes = async () => {
    const struck = parts.flatMap((_, p) =>
      p % 2 || shown[p]!.whole !== null ? [] : plans[p]!.ops.flatMap((op, i) => (op === 'delete' ? [[p, i] as const] : [])),
    )
    if (!struck.length || done) return
    struck.forEach(([p, i]) => (shown[p]!.rows[i] = { text: plans[p]!.sents[i].text, mark: 'strike' }))
    report()
    await wait!(beat)
    if (done) return
    struck.forEach(([p, i]) => (shown[p]!.rows[i] = { text: null, mark: 'none' }))
    report()
  }

  // The neighbours a paragraph gets as context, read before any rewrite lands. Paragraphs are
  // rewritten several at a time now, so a live read would hand one paragraph another's fresh text
  // and leave the result depending on which call came back first.
  const neighbours = [...parts]

  const rewriteParagraph = async (p: number) => {
    {
      const { para, sents, flags, texts, failing } = plans[p]!
      const rows = shown[p]!.rows
      const unblur = (i: number) => (rows[i] = { text: sents[i].text, mark: 'none' })
      const around = surroundings(config.context, neighbours[p - 2], neighbours[p + 2])
      if (rewritesParagraph(failing.map((i) => flags[i]))) {
        const candidate = await tryRewrite([
          { role: 'system', content: paragraphSystem },
          { role: 'user', content: `${around}Paragraph:\n${parts[p]}\n\nProblems:\n${problems(failing.flatMap((i) => flags[i]))}` },
        ], (candidate) => !addsSpeech(parts[p], candidate) && !echoes(candidate, parts.filter((_, k) => k !== p).join('')))
        if (candidate) {
          parts[p] = candidate
          shown[p]!.whole = candidate
          rewritten += failing.length
        } else {
          failing.forEach(unblur)
          kept += failing.length
        }
      } else {
        const i = failing[0]
        const candidate = await tryRewrite([
          { role: 'system', content: sentenceSystem },
          { role: 'user', content: `${around}Paragraph:\n${para}\n\nSentence:\n${sents[i].text}\n\nProblems:\n${problems(flags[i])}` },
        ], (candidate) => !addsSpeech(sents[i].text, candidate) && !echoes(candidate, parts.map((part, k) => (k === p ? rebuild(para, sents, texts.map((t, j) => (j === i ? null : t))) : part)).join('')))
        if (candidate) {
          texts[i] = candidate
          rows[i] = { text: candidate, mark: 'fresh' }
          rewritten += 1
          parts[p] = rebuild(para, sents, texts)
        } else {
          // Escalate once: the sentence and its neighbours in this paragraph, rewritten together.
          // A sentence can fail alone because the fix needs room its neighbours hold. Nothing goes wider.
          const lo = texts[i - 1] != null ? i - 1 : i
          const hi = texts[i + 1] != null ? i + 1 : i
          const group = lo < hi ? para.slice(sents[lo].start, sents[hi].end) : ''
          const without = texts.map((t, j) => (j >= lo && j <= hi ? null : t))
          const merged =
            group &&
            (await tryRewrite(
              [
                { role: 'system', content: passageSystem },
                { role: 'user', content: `${around}Paragraph:\n${para}\n\nPassage:\n${group}\n\nProblems:\n${problems(flags[i])}` },
              ],
              (candidate) => !addsSpeech(group, candidate) && !echoes(candidate, parts.map((part, k) => (k === p ? rebuild(para, sents, without) : part)).join('')),
            ))
          if (merged) {
            texts.splice(lo, hi - lo + 1, merged, ...Array<null>(hi - lo).fill(null))
            for (let j = lo; j <= hi; j++) rows[j] = j === lo ? { text: merged, mark: 'fresh' } : { text: null, mark: 'none' }
            rewritten += 1
            parts[p] = rebuild(para, sents, texts)
          } else {
            unblur(i)
            kept += 1
          }
        }
      }
      inFlight.delete(p)
      report()
      // Lets the crossfade play before the next step, or before the stored reply replaces the stream.
      if (wait) await wait(beat)
    }
  }

  // Up to `maxParallelRewrites` paragraphs at once, so the reply looks worked over in one go rather
  // than top to bottom. The cap keeps a long reply from opening a dozen requests together.
  const rewrites = async () => {
    const queue = [...inFlight].sort((a, b) => a - b)
    const worker = async () => {
      for (let p = queue.shift(); p !== undefined; p = queue.shift()) await rewriteParagraph(p)
    }
    await Promise.all(Array.from({ length: Math.min(maxParallelRewrites, queue.length) }, worker))
  }

  // Message detectors, one hit at a time on the current text, detecting again after each fix so
  // spans stay small and a fix that also clears a later hit saves its call.
  // ponytail: capped at maxFlowFixes calls per reply; raise it if long replies stay rough.
  let smoothed = 0
  let smoothKept = 0
  const flows = async () => {
    if (!config.flow) return
    const tried = new Set<string>()
    // One draw per reply, from the text as it arrived, so every fix in the loop aims at the same window.
    const style = { ...config.flow.style, narrationRatio: drawNarrationWindow(config.flow.style, textSeed(text)) }
    for (let step = 0; step < maxFlowFixes; step++) {
      const current = parts.join('')
      const hit = findFlowHits(current, { enabled: true, off: config.flow.off }, style, config.ignore ?? [])
        .find((h) => !tried.has(`${h.ruleId}:${current.slice(h.start, h.end)}`))
      if (!hit) return
      const passage = current.slice(hit.start, hit.end)
      tried.add(`${hit.ruleId}:${passage}`)
      const before = current.slice(0, hit.start)
      const after = current.slice(hit.end)
      await show(
        [{ text: before, mark: 'none' }, { text: passage, mark: 'pending' }, { text: after, mark: 'none' }],
        sentences(passage).map((s) => s.text),
        false,
      )
      const candidate = await tryRewrite(
        [
          { role: 'system', content: passageSystem },
          { role: 'user', content: `${surroundings(config.context, before, after)}Passage:\n${passage}\n\nProblems:\n- ${hit.note}` },
        ],
        // Speech is compared across the whole reply: a staccato span can sit inside a quote, and the
        // passage alone then holds no quote marks to compare.
        (candidate) => keepsSpeech(current, before + candidate + after) && !echoes(candidate, before + after),
      )
      if (!candidate) {
        smoothKept++
        await show([{ text: current, mark: 'none' }], [], false)
        continue
      }
      // Collapse to one part: paragraph plans no longer line up once a passage crosses a break.
      parts.splice(0, parts.length, before + candidate + after)
      smoothed++
      await show(freshRuns(current, parts[0]), [], true)
    }
  }

  // The flow pass: one call over the whole reply once every smaller fix is in. The guards keep it to
  // smoothing: sentence count within the stack's drift, speech word for word, no repeated takes, and
  // no large swing in feeling except toward the message being answered.
  let flowed = false
  const flowPass = async () => {
    if (!config.flowPass) return
    const current = parts.join('')
    if (!current.trim()) return
    await loadVad()
    const count = sentences(current).length
    const drift = Math.max(1, Math.round(count * config.flowPass.sentenceDrift))
    const candidate = await tryRewrite(
      [
        { role: 'system', content: flowSystem },
        { role: 'user', content: `${surroundings(config.context, undefined, undefined)}Reply:
${current}` },
      ],
      (candidate) =>
        Math.abs(sentences(candidate).length - count) <= drift &&
        keepsSpeech(current, candidate) &&
        !echoes(candidate, '') &&
        textVadAllows(current, candidate, config.lastMessage, config.flowPass!),
    )
    if (!candidate || candidate === current) return
    parts.splice(0, parts.length, candidate)
    flowed = true
    await show(freshRuns(current, candidate), [], true)
  }

  // The dialogue pass: last, so nothing after it rewrites speech. The only step allowed to add a line.
  let voiced = false
  const dialoguePass = async () => {
    if (!config.dialoguePass) return
    const current = parts.join('')
    if (!quotedRanges(current).length) return
    await loadVad()
    const candidate = await tryRewrite(
      [
        { role: 'system', content: dialogueSystem },
        { role: 'user', content: `${surroundings(config.context, undefined, undefined)}Reply:
${current}` },
      ],
      (candidate) =>
        keepsCommitments(current, candidate) &&
        !echoes(candidate, '') &&
        textVadAllows(current, candidate, config.lastMessage, config.flowPass ?? defaultVadLimits),
    )
    if (!candidate || candidate === current) return
    parts.splice(0, parts.length, candidate)
    voiced = true
    await show(freshRuns(current, candidate), [], true)
  }

  // Stop keeps the pass where it stood. `complete` throws only on abort (it swallows real call
  // failures and returns ''), so an AbortError here is the user's Stop and the work so far stands.
  let stopped = false
  try {
    if (wait) {
      // One beat with every hit flagged before anything resolves.
      if (deleted || plans.some((plan) => plan?.failing.length)) await wait(beat)
      await Promise.all([deletes(), rewrites()])
      await flows()
      await flowPass()
      await dialoguePass()
    } else {
      await rewrites()
      await flows()
      await flowPass()
      await dialoguePass()
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') throw err
    stopped = true
  } finally {
    done = true
  }

  // Stylized lags `parts` while deletes strike out one at a time, so a stop stores what was on
  // screen rather than the deletes that had not played yet.
  const final = stopped && wait ? marks().map((run) => run.text).join('') : parts.join('')
  const summary = [
    swap(text) !== text && 'swapped words',
    linted.hits.length && `${config.lint?.mode === 'fix' ? 'fixed' : 'flagged'} ${linted.hits.length} style ${linted.hits.length === 1 ? 'issue' : 'issues'}`,
    rewritten && `rewrote ${rewritten}`,
    flowed && 'smoothed the flow',
    voiced && 'reworked the dialogue',
    smoothed && `smoothed ${smoothed} ${smoothed === 1 ? 'passage' : 'passages'}`,
    deleted && `deleted ${deleted}`,
  ].filter(Boolean).join(', ')
  return {
    text: final,
    summary: (final !== text || linted.hits.length) && summary ? `Post-processing ${summary}.` : undefined,
    failed: [
      kept && `${kept} ${kept === 1 ? 'sentence' : 'sentences'} kept after ${tries} tries.`,
      smoothKept && `${smoothKept} ${smoothKept === 1 ? 'passage' : 'passages'} kept after ${tries} tries.`,
    ].filter(Boolean).join(' ') || undefined,
  }
}

/** Put a paragraph back together. `null` drops a sentence and the gap before it. */
function rebuild(para: string, sents: { start: number; end: number }[], texts: (string | null)[]): string {
  if (!sents.length) return para
  let out = ''
  let prevEnd = 0
  sents.forEach((s, i) => {
    const gap = para.slice(prevEnd, s.start)
    prevEnd = s.end
    if (texts[i] === null) return
    out += out ? gap : para.slice(0, sents[0].start)
    out += texts[i]
  })
  return out + para.slice(prevEnd)
}
