// Extension-ful imports on purpose: checkDefaultPipeline.ts runs this under
// `node --experimental-strip-types`. Pure: no store, no Dexie.
import { newPipeline, newStage, type CleanStage, type GateStage, type Pipeline, type RewriteStage } from './pipeline.ts'
import { newRule, type Rule } from './rules.ts'

/**
 * The one pipeline that ships.
 *
 * The rest of this codebase ships no opinions about prose, and that stands: this is not a slop list
 * anyone has to keep. It is a worked example. Every match mode and every action appears exactly
 * once, so opening it answers "what can a rule do" without reading the cheat sheet, and the four
 * stage kinds appear in the order they run.
 *
 * Kept deliberately small. Six rules, two lexicon entries, four stages. Anyone who wants a real
 * rule set writes one or imports one, and deleting this costs nothing.
 *
 * The rewrite stage ships turned off. It needs a second connection the user has not picked yet,
 * and an enabled stage that cannot run would report a problem on a library the user never touched.
 * The preset is written, so switching it on is one dropdown.
 */
export function defaultPipeline(): Pipeline {
  const pipeline = newPipeline('Default')
  pipeline.description =
    'A worked example. Every match mode and every action appears once. Safe to edit or delete.'

  pipeline.detect = {
    rules: defaultRules(),
    punctuation: { dashes: true, quotes: true },
  }

  pipeline.lexicon = [
    { id: 'slop-beat', phrase: 'a beat passed', regex: false, enabled: true, weight: 2 },
    {
      // The regex half of the lexicon, which is a different field from a rule's match mode.
      id: 'slop-shiver',
      phrase: 'a (shiver|chill) (ran|crawled) down .{0,12}spine',
      regex: true,
      enabled: true,
      weight: 3,
    },
  ]

  pipeline.census = { ...pipeline.census, enabled: true }
  pipeline.stages = defaultStages()
  return pipeline
}

/** Six rules: each match mode twice, each action twice, plus one that carries no find at all. */
function defaultRules(): Rule[] {
  return [
    rule('Suddenly', {
      match: 'literal',
      find: 'suddenly',
      action: 'flag',
      note: 'Cut "suddenly", or show the thing changing instead of announcing that it did.',
    }),
    rule('Very', {
      // Word-bounded on purpose: a literal find is a substring, and "very" would cut into "every".
      match: 'regex',
      find: '\\bvery\\b',
      action: 'strip',
    }),
    rule('Slight gestures', {
      // `$1` is the first capture group, so the verb survives and the hedge goes.
      match: 'regex',
      find: '\\b(smiled|nodded|shrugged|frowned) (?:slightly|a little)\\b',
      action: 'replace',
      replacement: '$1',
    }),
    rule('Filler description', {
      // The part-of-speech DSL: no fixed string, so it catches "with a heavy heart" and "with a
      // graceful elegance" alike. A pattern never matches across a sentence break.
      match: 'pattern',
      find: 'with a [adj] [noun]',
      action: 'strip',
    }),
    rule('Adverb on an adjective', {
      match: 'pattern',
      find: '[adv] [adj]',
      action: 'flag',
      note: 'This reads as filler. Cut the adverb, or replace the pair with one stronger word.',
    }),
    rule('No naming emotions', {
      // No find: a standing rule, true of every reply rather than found in this one. It goes to
      // the clean stage on every pass and never counts as a match.
      match: 'literal',
      find: '',
      action: 'flag',
      note: 'Never name an emotion outright. Show it in what the character does or notices.',
    }),
  ]
}

function rule(label: string, over: Partial<Rule>): Rule {
  // Stable ids rather than random ones: two installs seeding the same example should agree, and a
  // rule's id is what an edit patches.
  return { ...newRule(), id: `default-${slug(label)}`, label, ...over }
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

/** All four stage kinds, in the order a reply meets them. */
function defaultStages(): Pipeline['stages'] {
  const gate = newStage('gate') as GateStage
  gate.config = { minNotes: 1, standingCounts: false }

  const clean = newStage('clean') as CleanStage
  clean.config = {
    connectionId: null,
    userPrompt: 'Fix only what is listed. Keep the voice, the length and the events as they are.',
    skipWhenClean: true,
  }

  const rewrite = newStage('rewrite') as RewriteStage
  rewrite.enabled = false
  rewrite.config = {
    ...rewrite.config,
    preset: 'Rewrite the passage in the same voice and at the same length. Keep every event and every line of dialogue. Cut the filler.',
  }

  // Score last, and only worth having once something above it produces a candidate to judge.
  const score = newStage('score')

  return [gate, clean, rewrite, score]
}
