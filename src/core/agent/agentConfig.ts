// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { Rule } from './rules.ts'
import type { LexiconEntry } from '../quality/lexicon.ts'
import { defaultLintConfig, type LintConfig } from './lintRules.ts'

/** The global agent config. Lives in `settingsStore`. */
export interface AgentConfig {
  /** Runs on every assistant reply when on. The manual message action runs either way. */
  enabled: boolean
  /** null uses the chat's connection. */
  connectionId: string | null
  /** Failed rewrites allowed per sentence or paragraph before the original stays. */
  maxTries: number
  rules: Rule[]
  lexicon: LexiconEntry[]
  /** Style checks, run in code after swaps. Absent on configs saved before it existed. */
  lint?: LintConfig
  /** Stylized animates the edits and ignores a chat's display mode. Absent reads as stylized. Global only. */
  style?: AgentStyle
}

export type AgentStyle = 'default' | 'stylized'

/** How a reply shows while the agent works on it, under the Default style. */
export type AgentDisplay = 'blur' | 'hold' | 'reveal'

/** A chat's override on `Chat.agent`. Undefined fields inherit. */
export interface ChatAgent {
  enabled?: boolean
  display?: AgentDisplay
}

/** Global config with a chat's override on top. Display defaults to blur. */
export function resolveChatAgent(global: AgentConfig, chat: ChatAgent | undefined): { enabled: boolean; display: AgentDisplay } {
  return { enabled: chat?.enabled ?? global.enabled, display: chat?.display ?? 'blur' }
}

const rule = (over: Partial<Rule> & Pick<Rule, 'id' | 'label' | 'find' | 'action'>): Rule => ({
  enabled: true,
  match: 'literal',
  caseSensitive: false,
  note: '',
  ...over,
})

const regex = (over: Partial<Rule> & Pick<Rule, 'id' | 'label' | 'find' | 'action'>): Rule => rule({ match: 'regex', ...over })

/** Start of a sentence inside a paragraph: flags are matched against the whole paragraph. */
const sentenceStart = '(?<=^|\\n|[.!?]["*]?\\s+|["*])'
/** The rest of a cut clause: up to ", and", the sentence end, or a closing quote. */
const clauseRest = '[^.!?\\n"]*?(?=,\\s+and\\s|[.!?\\n"]|$)'
/** Words ending in -ing that aren't a participle clause. */
const ingNouns = '(?:nothing|something|anything|everything|morning|evening|during|thing|things|king|ring|spring|string|ceiling|building|feeling|wedding|clothing)'
/** Words that start or end a two-word tail that isn't a noun + adjective: ", he said", ", last night", ", and more". */
const tailStop = 'I|you|he|she|it|we|they|him|her|them|me|us|said|says|asked|replied|whispered|and|or|but|so|then|too|very|really|right|now|last|next|this|that|each|every|all|in|on|at|to|for|of|from|by|with|again|anyway|though|please|thanks|sir|ma\'am'
const physical ='(?:hung|hang(?:s|ing)?|sat|sits?|sitting|settled|settles?|settling|stretched|stretch(?:es|ing)?|tasted|tastes?|tasting)'

/**
 * The Default flow, seeded as the store default.
 * Swaps run in panel order, so the paired em dash rule has to come before the single ones.
 * The persisted settings keep the user's edits after first load.
 */
export const defaultAgentConfig: AgentConfig = {
  enabled: false,
  connectionId: null,
  maxTries: 3,
  rules: [
    regex({ id: 'default-curly-double', label: 'Curly double quotes', find: '[\u201C\u201D]', action: 'swap', replacement: '"' }),
    regex({ id: 'default-curly-single', label: 'Curly single quotes', find: '[\u2018\u2019]', action: 'swap', replacement: "'" }),
    regex({ id: 'default-dash-pair', label: 'Paired em dashes to commas', find: '\\s*\u2014\\s*([^\u2014\\n]+?)\\s*\u2014\\s*', action: 'swap', replacement: ', $1, ' }),
    regex({ id: 'default-dash-stop', label: 'Em dash before a capital', find: '\\s*\u2014\\s*(?=[A-Z])', caseSensitive: true, action: 'swap', replacement: '. ' }),
    regex({ id: 'default-dash-end', label: 'Em dash before a quote or line end', find: '\\s*\u2014(?=["\'*\\n]|$)', action: 'swap', replacement: '.' }),
    regex({ id: 'default-dash-single', label: 'Other em dashes to commas', find: '\\s*\u2014\\s*', action: 'swap', replacement: ', ' }),
    // ponytail: manner is guessed from the noun's shape (-ness, -ity...) plus a few stock nouns. A real list waits for misses.
    regex({ id: 'default-with-manner', label: 'With + manner phrase', find: ',?\\s*\\bwith (?:a |an )?(?:[a-z]+ ){1,2}(?:[a-z]+(?:ness|ity|tion|sion|ance|ence)|hand|ease|care|grace)\\b,?', action: 'swap', replacement: '' }),
    regex({ id: 'default-sending-making', label: ', sending / , making', find: `,\\s*(?:sending|making)\\b${clauseRest}`, action: 'swap', replacement: '' }),
    regex({ id: 'default-epiphany', label: 'For the first time in days', find: `,?\\s*(?:and\\s+)?for the first time in \\w+${clauseRest}`, action: 'swap', replacement: '' }),
    regex({ id: 'default-exactly-wanted', label: 'That was exactly what he wanted', find: `,?\\s*(?:and\\s+)?that was exactly what \\w+ (?:wanted|needed)${clauseRest}`, action: 'swap', replacement: '' }),
    regex({ id: 'default-back-when', label: 'Back when', find: `,?\\s+back when\\b${clauseRest}`, action: 'swap', replacement: '' }),
    regex({ id: 'default-without-looking', label: 'Without looking', find: '\\s+without looking\\b[^.,!?\\n"]*', action: 'swap', replacement: '' }),
    // ponytail: "a noun, then an -ing word" also catches ", his wedding ring". Tighten when a real miss shows up.
    regex({ id: 'default-noun-ing-tail', label: ', its lights flaring', find: `,\\s*(?:its|his|her|their|the)\\s+(?:[\\w-]+\\s+){1,3}[a-z]+ing\\b${clauseRest}`, caseSensitive: true, action: 'swap', replacement: '' }),
    // ponytail: no POS tags in regex, so "two words then the sentence end" is the whole test, minus a stoplist
    // for tails like ", he said." or ", last night.". Pattern mode drops punctuation and can't see the comma.
    regex({ id: 'default-noun-adj-tail', label: ', knuckles pale', find: `,\\s*(?:(?:its|his|her|their|the|my|your)\\s+)?(?!(?:${tailStop})\\b)[a-z-]+\\s+(?!(?:${tailStop})\\b)[a-z-]+(?=[.!?]|["*]|\\n|$)`, caseSensitive: true, action: 'swap', replacement: '' }),
    regex({ id: 'default-ing-clause', label: ', watching...', find: `,\\s+(?!${ingNouns}\\b)[a-z]+ing\\b${clauseRest}`, caseSensitive: true, action: 'swap', replacement: '' }),
    regex({ id: 'default-unwanted', label: 'A tea he didn\'t want', find: '(?<=\\b(?:a|an|the|his|her|their|my|your) (?:[\\w-]+ ){0,2}[\\w-]+) (?:he|she|they|I|we|you) (?:didn\'t|did not|doesn\'t|does not|don\'t|do not|wouldn\'t|would not|would never) \\w+(?=[.,!?])', action: 'swap', replacement: '' }),
    regex({ id: 'default-tone', label: 'In a measured tone', find: '\\s+in an? (?:[a-z-]+ )?(?:tone|voice)\\b', action: 'swap', replacement: '' }),
    regex({ id: 'default-once-twice', label: 'Once, twice', find: '\\bonce, twice\\b', action: 'swap', replacement: 'twice' }),
    regex({ id: 'default-not-lead', label: 'Not X, Y', find: `${sentenceStart}Not\\b[^,.!?\\n]*,[^.!?\\n]*`, caseSensitive: true, action: 'delete' }),
    regex({ id: 'default-not-but', label: 'Not X but Y', find: '\\bnot\\s+(?:just\\s+|only\\s+|merely\\s+)?[^,.!?\\n]{1,40}?,?\\s+but\\b', action: 'delete' }),
    regex({ id: 'default-x-not-y', label: 'X, not Y', find: '\\w+, not (?:a |an |the )?\\w+[.!?]', action: 'delete' }),
    regex({ id: 'default-less-more', label: 'Less X, more Y', find: '\\bless \\w+(?: \\w+)?, more \\w+', action: 'delete' }),
    regex({ id: 'default-did-pair', label: 'She didn\'t X. She Y.', find: '\\b(I|he|she|they|we|you|it)\\s+(?:did not|didn\'t|did)\\b[^.!?\\n]*[.!?]["*]?\\s+\\1\\b', action: 'delete' }),
    // ponytail: "short" is a fixed four words, not relative to the paragraph. Relative needs code in runAgent.
    regex({ id: 'default-short-triple', label: 'Three short sentences', find: `${sentenceStart}(?:[^\\s.!?]+(?: [^\\s.!?]+){0,3}[.!?]["*]? +){2}[^\\s.!?]+(?: [^\\s.!?]+){0,3}[.!?]`, action: 'rewrite', note: 'Three short sentences in a row. Combine them into fewer, longer sentences.' }),
    regex({ id: 'default-words-physical', label: 'Words/silence doing physical things', find: `\\b(?:words?|silence|question|name)\\s+${physical}\\b`, action: 'delete' }),
    regex({ id: 'default-let-words', label: 'Letting the words settle', find: '\\blet(?:s|ting)?\\s+(?:the\\s+|her\\s+|his\\s+|their\\s+|my\\s+)?(?:words?|silence|question|name)\\s+(?:hang|sit|settle|stretch)\\b', action: 'delete' }),
    regex({ id: 'default-taste', label: 'Taste outside food', find: `${sentenceStart}(?![^.!?\\n]*\\b(?:eat|eats|ate|eating|food|drink|drinks|drank|drinking|sip|sipped|bite|chew|chewed|swallow|swallowed|meal|dinner|lunch|breakfast|wine|tea|coffee|soup|bread)\\b)[^.!?\\n]*\\btast(?:e|es|ed|ing)\\b`, action: 'delete' }),
    regex({ id: 'default-staccato', label: 'One-word sentences', find: `${sentenceStart}\\w+\\.["*]?\\s+\\w+\\.`, action: 'delete' }),
    regex({ id: 'default-pooled', label: 'Shade pooled', find: '\\bpool(?:ed|ing)\\b', action: 'delete' }),
    // ponytail: regex can't tell a verbless fragment list from an action list, so both go to rewrite.
    regex({ id: 'default-fragment-list', label: 'Three-item fragment list', find: `${sentenceStart}[^,.!?\\n]{1,40}, [^,.!?\\n]{1,40}, (?:and )?[^,.!?\\n]{1,60}[.!?]`, action: 'rewrite', note: 'A list of three fragments. Write it as one plain sentence with a verb, or keep only the detail that matters.' }),
    regex({ id: 'default-not-fragment', label: 'Not hungry.', find: `${sentenceStart}Not(?: \\w+){1,2}[.!?]`, caseSensitive: true, action: 'rewrite', wholeParagraph: true, note: 'A "Not X." fragment correcting the sentence before it. Say the thing once, plainly.' }),
    // ponytail: past-tense verbs guessed from -ed, so "watched" hits and "took" doesn't. Add irregulars when a miss shows up.
    regex({ id: 'default-verb-triple', label: 'Dragged him, ordered, watched', find: ',\\s+[a-z]+ed\\b[^,.!?\\n]{0,40},\\s+(?:and\\s+)?[a-z]+ed\\b[^,.!?\\n]{0,40}[.!?]', caseSensitive: true, action: 'rewrite', wholeParagraph: true, note: 'A string of actions tacked on with commas. Keep the one that matters.' }),
    regex({ id: 'default-adjective-lead', label: 'Slow, unhurried, ...', find: `${sentenceStart}[A-Z][a-z]+, [a-z-]+,`, caseSensitive: true, action: 'rewrite', note: 'Stacked adjectives as a fragment. Fold the description into a sentence with a verb.' }),
    regex({ id: 'default-adjective-pile', label: 'Was quiet, half-empty', find: '\\b(?:was|were|is|are|looked|felt|seemed) [a-z-]+, [a-z-]+[,.]', caseSensitive: true, action: 'rewrite', note: 'Stacked adjectives. Keep one, or show it through something happening.' }),
    regex({ id: 'default-made', label: 'The X made Y', find: '\\b(?:the|her|his|their|my|your) \\w+ made (?:her|him|them|me|my|his|their|your)\\b', action: 'delete' }),
  ],
  lexicon: [],
  lint: defaultLintConfig,
  style: 'stylized',
}
