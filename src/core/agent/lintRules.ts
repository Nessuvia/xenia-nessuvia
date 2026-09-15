// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { CompromiseTagger, memoizeTagger, type Token } from '../hammer/tagger.ts'
import { quotedRanges, sceneTemperature } from '../quality/temperature.ts'
import { adverbPlacement } from './lint/adverbPlacement.ts'
import { intensifierBudget } from './lint/intensifierBudget.ts'

export type LintProfile = 'fiction' | 'fanfic'

/** Style checks. Code-defined rules; the config only turns them on and off. */
export interface LintConfig {
  enabled: boolean
  /** `fix` applies replacements. `report` only lists hits. */
  mode: 'fix' | 'report'
  profile: LintProfile
  /** Rule ids turned off. */
  off: string[]
}

export const defaultLintConfig: LintConfig = { enabled: false, mode: 'report', profile: 'fiction', off: [] }

export interface LintContext {
  /** Tagged words of the paragraph, offsets into it. */
  tokens: Token[]
  quoted: [number, number][]
  /** 0 to 1. See `sceneTemperature`. */
  temperature: number
  profile: LintProfile
}

export interface LintHit {
  ruleId: string
  /** Offsets into the paragraph. */
  start: number
  end: number
  /** Set when code can fix the hit. '' removes the span. */
  replacement?: string
  note: string
}

export interface LintRule {
  id: string
  label: string
  description: string
  check(paragraph: string, ctx: LintContext): LintHit[]
}

export const lintRules: LintRule[] = [adverbPlacement, intensifierBudget]

const tagger = memoizeTagger(new CompromiseTagger())

/** Run the enabled style checks per paragraph. Fix mode applies hits right to left, skipping overlaps. */
export function applyLint(text: string, config: LintConfig): { text: string; hits: LintHit[] } {
  if (!config.enabled) return { text, hits: [] }
  const rules = lintRules.filter((r) => !config.off.includes(r.id))
  const all: LintHit[] = []
  let offset = 0
  const parts = text.split(/(\n\s*\n)/).map((para, p) => {
    const base = offset
    offset += para.length
    if (p % 2 || !para.trim()) return para
    const ctx: LintContext = {
      tokens: tagger.tokenize(para),
      quoted: quotedRanges(para),
      temperature: sceneTemperature(para),
      profile: config.profile,
    }
    const hits = rules.flatMap((r) => r.check(para, ctx)).sort((a, b) => b.start - a.start)
    all.push(...hits.map((h) => ({ ...h, start: h.start + base, end: h.end + base })))
    if (config.mode !== 'fix') return para
    let out = para
    let floor = Infinity
    for (const h of hits) {
      if (h.replacement === undefined || h.end > floor) continue
      out = out.slice(0, h.start) + h.replacement + out.slice(h.end)
      floor = h.start
    }
    return out
  })
  return { text: parts.join(''), hits: all.sort((a, b) => a.start - b.start) }
}
