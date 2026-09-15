// Extension-ful imports on purpose: checkRunAgent.ts runs this under `node --experimental-strip-types`.
// Nothing here may reach the store or a connector. The caller supplies `complete`.
import type { ChatMessage } from '../connectors/connectorInterface'
import { findFlags, stripText, type Flag } from '../hammer/strip.ts'
import { applyLexicon } from '../quality/lexicon.ts'
import { sentences } from '../quality/sentences.ts'
import type { AgentRun } from './postStack.ts'
import { flagMessage } from './rules.ts'
import { applyLint, defaultLintConfig } from './lintRules.ts'
import { loadArousal } from '../quality/arousal.ts'
import { agentBeat, changedRanges, flashed, mergeMarks, type AgentStage, type Mark, type Marked } from './stage.ts'

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

const sentenceSystem = 'You edit one sentence of a story reply. Keep its meaning, voice and tense. Reply with the new sentence only.'
const paragraphSystem = 'You edit one paragraph of a story reply. Keep its meaning, voice and tense. Reply with the new paragraph only.'

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

  const tryRewrite = async (messages: ChatMessage[]): Promise<string | null> => {
    for (let i = 0; i < tries; i++) {
      const candidate = swap((await complete(messages)).trim())
      if (candidate && !flagsIn(candidate).length) return candidate
    }
    return null
  }

  // Style checks run once on the reply, not on rewrite candidates.
  if (config.lint?.enabled) await loadArousal()
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
  const marks = (): Marked[] =>
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

  // An aborted run can leave the delete walk mid-beat. Nothing reports after the run ends.
  let done = false
  const report = (from: number) => {
    if (done) return
    if (!wait) {
      onProgress?.(parts.join(''), plans.slice(from).flatMap((plan) => plan?.failing.map((i) => plan.sents[i].text) ?? []))
      return
    }
    const stage = { marks: marks(), beat }
    onProgress?.(stage.marks.map((run) => run.text).join(''), [], stage)
  }
  report(0)

  // Top to bottom, on a timer of its own, so a slow rewrite never holds up the deletes below it.
  const deletes = async () => {
    for (let p = 0; p < parts.length; p += 2) {
      const plan = plans[p]!
      const show = shown[p]!
      for (let i = 0; i < plan.ops.length; i++) {
        if (plan.ops[i] !== 'delete' || show.whole !== null || done) continue
        show.rows[i] = { text: plan.sents[i].text, mark: 'strike' }
        report(0)
        await wait!(beat)
        show.rows[i] = { text: null, mark: 'none' }
        report(0)
      }
    }
  }

  const rewrites = async () => {
    for (let p = 0; p < parts.length; p += 2) {
      const { para, sents, flags, texts, failing } = plans[p]!
      const rows = shown[p]!.rows
      const unblur = (i: number) => (rows[i] = { text: sents[i].text, mark: 'none' })
      if (!failing.length) continue
      if (rewritesParagraph(failing.map((i) => flags[i]))) {
        const candidate = await tryRewrite([
          { role: 'system', content: paragraphSystem },
          { role: 'user', content: `Paragraph:\n${parts[p]}\n\nProblems:\n${problems(failing.flatMap((i) => flags[i]))}` },
        ])
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
          { role: 'user', content: `Paragraph:\n${para}\n\nSentence:\n${sents[i].text}\n\nProblems:\n${problems(flags[i])}` },
        ])
        if (candidate) {
          texts[i] = candidate
          rows[i] = { text: candidate, mark: 'fresh' }
          rewritten += 1
          parts[p] = rebuild(para, sents, texts)
        } else {
          unblur(i)
          kept += 1
        }
      }
      report(p + 1)
      // Lets the crossfade play before the next step, or before the stored reply replaces the stream.
      if (wait) await wait(beat)
    }
  }

  try {
    if (wait) {
      // One beat with every hit flagged before anything resolves.
      if (deleted || plans.some((plan) => plan?.failing.length)) await wait(beat)
      await Promise.all([deletes(), rewrites()])
    } else await rewrites()
  } finally {
    done = true
  }

  const final = parts.join('')
  const summary = [
    swap(text) !== text && 'swapped words',
    linted.hits.length && `${config.lint?.mode === 'fix' ? 'fixed' : 'flagged'} ${linted.hits.length} style ${linted.hits.length === 1 ? 'issue' : 'issues'}`,
    rewritten && `rewrote ${rewritten}`,
    deleted && `deleted ${deleted}`,
  ].filter(Boolean).join(', ')
  return {
    text: final,
    summary: (final !== text || linted.hits.length) && summary ? `Post-processing ${summary}.` : undefined,
    failed: kept ? `${kept} ${kept === 1 ? 'sentence' : 'sentences'} kept after ${tries} tries.` : undefined,
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
