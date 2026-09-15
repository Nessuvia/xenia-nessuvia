// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { LintHit, LintRule } from '../lintRules.ts'
import { inRanges } from '../../quality/temperature.ts'
import { sentences } from '../../quality/sentences.ts'

// "Somewhere beyond the fence a dog barked twice and went quiet." A far-off, unseen sound that
// nobody in the scene reacts to, dropped in to make the world feel lived in.
const locator = /\b(?:somewhere|in the distance|distant|far[- ]off|far away|down the (?:street|road|block|hall)|next door|(?:streets?|blocks?|floors?) (?:over|away|below|above))\b/i
const sound =
  /\b(?:bark(?:ed|s|ing)?|slam(?:med|s|ming)?|honk(?:ed|s|ing)?|wail(?:ed|s|ing)?|howl(?:ed|s|ing)?|rustl(?:ed|es|ing)|hum(?:med|s|ming)?|chirp(?:ed|s|ing)?|caw(?:ed|s|ing)?|rumbl(?:ed|es|ing)|clang(?:ed|s|ing)?|tick(?:ed|s|ing)|dripp(?:ed|ing)|creak(?:ed|s|ing)?|rang|ringing|whin(?:ed|es|ing)|buzz(?:ed|es|ing)?|revv(?:ed|ing)|screech(?:ed|es|ing)|echo(?:ed|es|ing)|sirens?|laughter|shout(?:ed|s|ing)?|music|television|tv|radio)\b/i

// ponytail: keyword pair, no parse. A plot-relevant distant sound ("somewhere a gun fired") is hit too; report mode shows it first.
export const ambientFiller: LintRule = {
  id: 'ambient-filler',
  label: 'Ambient filler',
  description: 'Removes narration sentences about a distant sound (somewhere a dog barked).',
  check(para, { quoted }) {
    const sents = sentences(para)
    const hits: LintHit[] = []
    sents.forEach((s, i) => {
      if (inRanges(quoted, s.start) || !locator.test(s.text) || !sound.test(s.text)) return
      // Take the whitespace after the sentence, or before it when it ends the paragraph.
      const next = sents[i + 1]
      const start = next || i === 0 ? s.start : sents[i - 1].end
      const end = next ? next.start : s.end
      hits.push({ ruleId: this.id, start, end, replacement: '', note: `Ambient filler: "${s.text}"` })
    })
    return hits
  },
}
