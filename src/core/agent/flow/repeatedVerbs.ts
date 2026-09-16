// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import { CompromiseTagger, memoizeTagger, wordTokens } from '../../hammer/tagger.ts'
import type { FlowHit, FlowRule } from '../flowRules.ts'
import { isNarration } from './words.ts'

const tagger = memoizeTagger(new CompromiseTagger())

const auxiliaries = new Set(['be', 'is', 'was', 'were', 'been', 'being', 'am', 'are', 'had', 'has', 'have', 'do', 'did', 'does', 'could', 'would', 'should', 'will', 'can', 'might', 'must', 'may'])

// ponytail: suffix stripping, not a lemmatizer. "looked"/"looks"/"looking" match; "stood"/"stand"
// and "stopped"/"stops" don't. Swap in compromise's infinitive if the misses matter.
const stem = (word: string) => word.toLowerCase().replace(/(?:ing|ed|es|s)$/, '')

function verbsOf(sentence: string): Set<string> {
  return new Set(
    wordTokens(tagger.tokenize(sentence))
      .filter((t) => t.pos.includes('verb') && !auxiliaries.has(t.text.toLowerCase()))
      .map((t) => stem(t.text)),
  )
}

// "Damien looked down at his arms. Then he looked up at the doorframe." The same verb in back-to-back
// narration sentences. The second sentence is flagged; the first stays as the anchor.
export const repeatedVerbs: FlowRule = {
  id: 'repeated-verbs',
  label: 'Repeated verbs',
  description: 'Flags a narration sentence that reuses a verb from the narration sentence right before it.',
  check(text, { sents, quoted }) {
    const hits: FlowHit[] = []
    let prev: Set<string> | null = null
    for (const s of sents) {
      if (!isNarration(text, s, quoted)) {
        prev = null
        continue
      }
      const verbs = verbsOf(s.text)
      const shared = prev ? [...verbs].filter((v) => prev!.has(v)) : []
      if (shared.length) {
        hits.push({
          ruleId: this.id,
          start: s.start,
          end: s.end,
          note: `Uses the same verb as the sentence before ("${shared[0]}"). Pick a different verb or restructure.`,
        })
      }
      prev = verbs
    }
    return hits
  },
}
