// Extension-ful imports on purpose: checkExplain.ts runs this under `node --experimental-strip-types`.
import { sentences } from '../quality/sentences.ts'
import type { AgentRun } from './postStack.ts'
import { applyLint, defaultLintConfig, type LintHit } from './lintRules.ts'
import { agentSwap, operationFor, rewritesParagraph, sentenceFlags } from './runAgent.ts'

export type ExplainedOperation = 'keep' | 'rewriteSentence' | 'rewriteParagraph' | 'delete'

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
      const rules = [...new Set(flags.map((f) => f.rule.label || f.rule.find))]
      return { text: s.text, op: operationFor(flags), rules, flags }
    })
    const paragraph = rewritesParagraph(rows.filter((r) => r.op === 'rewrite').map((r) => r.flags))
    for (const r of rows) {
      const operation = r.op === 'rewrite' ? (paragraph ? 'rewriteParagraph' : 'rewriteSentence') : r.op
      out.push({ text: r.text, operation, rules: r.rules })
    }
  }
  return { swapped, linted, lint, sentences: out }
}
