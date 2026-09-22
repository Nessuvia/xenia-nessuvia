// Extension-ful imports on purpose: checkExplain.ts runs this under `node --experimental-strip-types`.
import { sentences } from '../quality/sentences.ts'
import type { AgentRun } from './postStack.ts'
import { applyLint, defaultLintConfig, type LintHit } from './lintRules.ts'
import { defaultFlowStyle, findFlowHits } from './flowRules.ts'
import { agentSwap, operationFor, rewritesParagraph, sentenceFlags } from './runAgent.ts'
import { ruleName } from './rules.ts'
import type { PostStackConfig } from './postStack.ts'
import type { IgnorePair } from '../hammer/exclusions.ts'
import { ruleSpans } from '../hammer/strip.ts'
import { lexiconSpans } from '../quality/lexicon.ts'

/** One hit in a reply. `key` is `swap:<entry id>`, `lint:<check id>` or `rule:<rule id>`. */
export interface TesterHit {
  key: string
  start: number
  end: number
}

/**
 * Every swap, style check and rule of a stack, run over a chat's replies with no request. Offsets
 * are into each reply as given, and `counts` is hits per key.
 *
 * Everything is counted, switched off or not: the point is to see what a rule would catch before
 * turning it on. Ignored text still applies.
 *
 * ponytail: each item runs over the untouched reply, not over what the stages before it produced.
 * A swap that creates or removes a later rule's match isn't reflected. Chain the stages here if
 * the counts are ever misleading.
 */
export function testReplies(
  replies: string[],
  config: PostStackConfig,
  ignore: IgnorePair[] = [],
): { hits: TesterHit[][]; counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  const lint = { ...config.lint, enabled: true, mode: 'report' as const, off: [] }
  const hits = replies.map((text) => {
    const found: TesterHit[] = [
      ...config.swaps.lexicon.flatMap((e) => lexiconSpans(text, e, ignore).map((s) => ({ key: `swap:${e.id}`, ...s }))),
      ...applyLint(text, lint, ignore).hits.map((h) => ({ key: `lint:${h.ruleId}`, start: h.start, end: h.end })),
      ...config.rules.list.flatMap((r) => ruleSpans(text, r, ignore).map((s) => ({ key: `rule:${r.id}`, ...s }))),
      ...findFlowHits(text, { enabled: true, off: [] }, config.style ?? defaultFlowStyle, ignore).map((h) => ({ key: `flow:${h.ruleId}`, start: h.start, end: h.end })),
    ]
    for (const hit of found) counts[hit.key] = (counts[hit.key] ?? 0) + 1
    return found.sort((a, b) => a.start - b.start)
  })
  return { hits, counts }
}

export type ExplainedOperation = 'keep' | 'rewriteSentence' | 'rewriteParagraph' | 'delete' | 'fold'

export interface ExplainedSentence {
  text: string
  operation: ExplainedOperation
  /** Label, or find when unlabeled, of each rule that fired. */
  rules: string[]
}

/** What the agent would do to a text, with no request. Mirrors `runAgent`. */
export function explainAgent(
  text: string,
  config: AgentRun,
): { swapped: string; linted: string; lint: LintHit[]; sentences: ExplainedSentence[] } {
  const swapped = agentSwap(text, config)
  const { text: linted, hits: lint } = applyLint(swapped, config.lint ?? defaultLintConfig, config.ignore ?? [])
  const out: ExplainedSentence[] = []
  for (const para of linted.split(/\n\s*\n/)) {
    const sents = sentences(para)
    const perSentence = sentenceFlags(para, sents, config)
    const rows = sents.map((s, i) => {
      const flags = perSentence[i]
      const rules = [...new Set(flags.map((f) => ruleName(f.rule)))]
      return { text: s.text, op: operationFor(flags), rules, flags }
    })
    const paragraph = rewritesParagraph(rows.filter((r) => r.op === 'rewrite').map((r) => r.flags))
    for (const r of rows) {
      const operation =
        r.op === 'rewrite' ? (paragraph ? 'rewriteParagraph' : 'rewriteSentence')
        : r.op === 'fold' && paragraph ? 'rewriteParagraph'
        : r.op
      out.push({ text: r.text, operation, rules: r.rules })
    }
  }
  return { swapped, linted, lint, sentences: out }
}
