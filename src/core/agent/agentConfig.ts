// Extension-ful imports on purpose: check scripts import this under `node --experimental-strip-types`.
import type { Rule } from './rules.ts'

/**
 * The global agent config. Lives in `settingsStore`.
 * What the pass does lives in a post-processing stack, so it can be exported and shared.
 * What stays here is what must not travel: the master switch, the style, and the connection, which
 * holds an API key.
 */
export interface AgentConfig {
  /** Runs on every assistant reply when on. The manual message action runs either way. */
  enabled: boolean
  /** null uses the chat's connection. */
  connectionId: string | null
  /** The stack a chat with no stack of its own runs. null falls back to `defaultPostStackConfig`. */
  defaultStackId: number | null
  /** The decisions connection the sensors ask. null means sensors don't run. Sits here rather than
   *  on the stack because it resolves to a connection holding an API key, which must not travel. */
  sensorConnectionId?: string | null
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
  /** Sensors in this chat. Undefined follows the stack's own switch. False turns them off here
   *  without editing a stack that other chats share. */
  sensors?: boolean
}

/** Global config with a chat's override on top. Display defaults to blur. */
export function resolveChatAgent(global: AgentConfig, chat: ChatAgent | undefined): { enabled: boolean; display: AgentDisplay; sensors: boolean } {
  return { enabled: chat?.enabled ?? global.enabled, display: chat?.display ?? 'blur', sensors: chat?.sensors ?? true }
}

type RuleSeed = Partial<Rule> & Pick<Rule, 'id' | 'label' | 'find' | 'action'>

const regex = (over: RuleSeed): Rule => ({
  enabled: true,
  match: 'regex',
  caseSensitive: false,
  note: '',
  ...over,
})

/** A Word types rule written by hand: no sample, so it opens as a pattern field rather than the builder. */
const pattern = (over: RuleSeed): Rule => regex({ match: 'pattern', ...over })

/** Start of a sentence inside a paragraph: flags are matched against the whole paragraph. */
const sentenceStart = '(?<=^|\\n|[.!?]["*]?\\s+|["*])'
/** The rest of a cut clause: up to ", and", the sentence end, or a closing quote. */
const clauseRest = '[^.!?\\n"]*?(?=,\\s+and\\s|[.!?\\n"]|$)'
/** Words ending in -ing that aren't a participle clause. */
const ingNouns = '(?:nothing|something|anything|everything|morning|evening|during|thing|things|king|ring|spring|string|ceiling|building|feeling|wedding|clothing)'
/** Outside quoted speech: an even number of straight quotes from here to the paragraph end. Flags match
 *  per paragraph and curly quotes are swapped to straight first, so the count holds. */
const narration = '(?=(?:[^"\\n]*"[^"\\n]*")*[^"\\n]*$)'
/** Words that turn a trailing -ing clause into new action rather than a tacked-on tail. */
const ingKeep = '(?![^.!?\\n"]*\\b(?:when|as|while|until|before|after)\\b)'
/** Speech openers a stacked-adjective rule mistakes for adjectives: "Yeah, well," or "No, no,". */
const interjections = '(?:Well|Yeah|Yes|No|Oh|Ah|So|Okay|Right|Fine|Hey|Look|Sure|Uh|Um|Uhm|Tsk|Both)'

export const defaultAgentConfig: AgentConfig = {
  enabled: false,
  connectionId: null,
  defaultStackId: null,
  sensorConnectionId: null,
  style: 'stylized',
}

/**
 * The rules the Default stack starts with. A function, not a constant: every stack owns its own
 * rule objects and edits them in place.
 * Swaps run in list order, so the paired em dash rule has to come before the single ones.
 *
 * Word types (pattern) where the DSL says the same thing; regex elsewhere, each with a note on what
 * the DSL lacks. The DSL has no either/or, no optional literal word, no word endings (-ing, -ed), no
 * lookaround, no sentence-start or sentence-end anchor, and never crosses a sentence.
 * `checkDefaultRules.ts` holds each converted rule to the regex it replaced.
 */
export function defaultRules(): Rule[] {
  return [
    // ponytail: regex, a character set. Word types have no either/or.
    regex({ id: 'default-curly-double', label: 'Curly double quotes', find: '[\u201C\u201D]', action: 'swap', replacement: '"' }),
    // ponytail: regex, a character set, and a curly apostrophe sits inside a word rather than as a mark.
    regex({ id: 'default-curly-single', label: 'Curly single quotes', find: '[\u2018\u2019]', action: 'swap', replacement: "'" }),
    // ponytail: regex, the group has to span everything between two dashes, whitespace included.
    regex({ id: 'default-dash-pair', label: 'Paired em dashes to commas', find: '\\s*\u2014\\s*([^\u2014\\n]+?)\\s*\u2014\\s*', action: 'swap', replacement: ', $1, ' }),
    // ponytail: regex, lookahead for a capital.
    regex({ id: 'default-dash-stop', label: 'Em dash before a capital', find: '\\s*\u2014\\s*(?=[A-Z])', caseSensitive: true, action: 'swap', replacement: '. ' }),
    // ponytail: regex, lookahead for a quote or the line end.
    regex({ id: 'default-dash-end', label: 'Em dash before a quote or line end', find: '\\s*\u2014(?=["\'*\\n]|$)', action: 'swap', replacement: '.' }),
    pattern({ id: 'default-dash-single', label: 'Other em dashes to commas', find: '\u2014', action: 'swap', replacement: ', ' }),
    // ponytail: regex. Manner is guessed from the noun's ending (-ness, -ity...), which Word types can't read. A real list waits for misses.
    // A possessive or "the" is an object, not a manner: "with his free hand", "with the nation".
    regex({ id: 'default-with-manner', label: 'With + manner phrase', find: ',?\\s*\\bwith (?!(?:his|her|their|my|your|its|the)\\b)(?:a |an )?(?:[a-z]+ ){1,2}(?:[a-z]+(?:ness|ity|tion|sion|ance|ence)|hand|ease|care|grace)\\b,?', action: 'swap', replacement: '' }),
    // ponytail: regex, either/or on the phrase, an optional "and", and the clause runs past commas up to ", and".
    // One rule for narrator commentary tacked onto a sentence: add the next phrase to the alternation.
    regex({ id: 'default-commentary-tail', label: 'For the first time in days / back when', find: `,?\\s*(?:and\\s+)?(?:for the first time in \\w+|that was exactly what \\w+ (?:wanted|needed)|back when\\b)${clauseRest}`, action: 'fold' }),
    pattern({ id: 'default-without-looking', label: 'Without looking', find: 'without looking [clause]*', action: 'fold' }),
    // ponytail: regex, either/or on the determiner and an -ing ending. "A noun, then an -ing word" also catches ", his wedding ring". Tighten when a real miss shows up.
    regex({ id: 'default-noun-ing-tail', label: ', its lights flaring', find: `,\\s*(?:its|his|her|their|the)\\s+(?:[\\w-]+\\s+){1,3}[a-z]+ing\\b${clauseRest}`, caseSensitive: true, action: 'fold' }),
    // ponytail: regex, an -ing ending with a stoplist. Only a tail that runs to the sentence end, and not one
    // carrying its own timing ("straightening up when he heard footsteps"), which is action rather than garnish.
    regex({ id: 'default-ing-clause', label: ', watching / , sending...', find: `,\\s+(?!${ingNouns}\\b)[a-z]+ing\\b${ingKeep}(?:(?!,\\s+and\\s)[^.!?\\n"])*(?=[.!?\\n"*]|$)`, caseSensitive: true, action: 'fold' }),
    // ponytail: regex, lookbehind for the noun phrase and either/or on the pronoun and the verb.
    regex({ id: 'default-unwanted', label: 'A tea he didn\'t want', find: '(?<=\\b(?:a|an|the|his|her|their|my|your) (?:[\\w-]+ ){0,2}[\\w-]+) (?:he|she|they|I|we|you) (?:didn\'t|did not|doesn\'t|does not|don\'t|do not|wouldn\'t|would not|would never) \\w+(?=[.,!?])', action: 'fold' }),
    // ponytail: regex, either/or (a, an and tone, voice).
    regex({ id: 'default-tone', label: 'In a measured tone', find: '\\s+in an? (?:[a-z-]+ )?(?:tone|voice)\\b', action: 'swap', replacement: '' }),
    pattern({ id: 'default-once-twice', label: 'Once, twice', find: 'once , twice', action: 'swap', replacement: 'twice' }),
    // ponytail: regex, either/or on the determiner. An appositive noun phrase restating the sentence
    // it hangs off: "pulsed, a reminder of what they were capable of". The em dash it usually arrives
    // with is already a comma by now, swapped by the dash rules above.
    regex({ id: 'default-appositive-tail', label: ', a reminder of what they were', find: ',\\s*(?:a|an|the)\\s+[a-z-]+\\s+(?:of|to|in|for|that)\\b[^.!?\\n]*(?=[.!?\\n]|$)', caseSensitive: true, action: 'fold' }),
    // ponytail: regex, and it has to be. Word types would read better, but `compromise` tags the
    // spatial prepositions as adjectives ("beneath", "against", "atop"), so `[adv] [prep]` misses
    // most of what this is for and catches only the handful it tags as prep. The list is explicit
    // instead. Decoration inside a sentence rather than tacked on the end: "pulsed steadily beneath
    // his shirt". The -ly stoplist covers words that end in -ly without being manner adverbs.
    regex({ id: 'default-adverb-setting', label: 'pulsed steadily beneath his shirt', find: '\\s+(?!(?:only|early|likely|ugly|family|holy|reply|supply|apply|rely|fly|ally)\\b)[a-z]+ly\\s+(?:beneath|underneath|under|behind|beside|above|below|across|against|along|among|around|atop|between|beyond|inside|into|near|onto|outside|over|past|through|throughout|towards|toward|upon|within|in|on|at)\\s+(?:his|her|their|its|my|your|the|an|a)\\b', action: 'fold' }),
    // ponytail: regex, either/or on the two shapes. An unnamed "something" standing in for the thing
    // itself. `default-something-chest` covers the body-part case; this is the other two.
    regex({ id: 'default-something-tail', label: 'Something deliberate in the way she moved', find: '\\bsomething\\s+(?:[a-z-]+\\s+in the way\\b|like\\s+(?:a |an |the )?[a-z-]+)', action: 'fold' }),
    // ponytail: regex, either/or on the word list. The adjective half of the "deliberately" tic: the
    // narrator labelling an action as chosen instead of showing it. Attributive only, so a lowercase
    // word has to follow: "a deliberate slowness" loses the word and "was deliberate." keeps it.
    // `repairAfterCut` fixes the article the cut leaves wrong ("a studied indifference").
    regex({ id: 'default-intent-adjective', label: 'A deliberate slowness', find: '\\b(?:deliberate|careful|measured|practiced|practised|studied|calculated|purposeful|conscious|slight)\\s+(?!(?:and|or|but|about|in|to|as|enough|with|for)\\b)(?=[a-z])', action: 'swap', replacement: '' }),
    // ponytail: regex, sentence-start anchor.
    regex({ id: 'default-not-lead', label: 'Not X, Y', find: `${sentenceStart}Not\\b[^,.!?\\n]*,[^.!?\\n]*`, caseSensitive: true, action: 'delete' }),
    // ponytail: regex, an optional just/only/merely and a length cap in characters.
    regex({ id: 'default-not-but', label: 'Not X but Y', find: '\\bnot\\s+(?:just\\s+|only\\s+|merely\\s+)?[^,.!?\\n]{1,40}?,?\\s+but\\b', action: 'delete' }),
    // ponytail: regex, sentence-end anchor and an optional article.
    regex({ id: 'default-x-not-y', label: 'X, not Y', find: '\\w+, not (?:a |an |the )?\\w+[.!?]', action: 'delete' }),
    pattern({ id: 'default-less-more', label: 'Less X, more Y', find: 'less [word]{1,2} , more [word]', action: 'delete' }),
    // ponytail: regex, a backreference, and the match crosses a sentence.
    regex({ id: 'default-did-pair', label: 'She didn\'t X. She Y.', find: '\\b(I|he|she|they|we|you|it)\\s+(?:did not|didn\'t|did)\\b[^.!?\\n]*[.!?]["*]?\\s+\\1\\b', action: 'delete' }),
    // ponytail: regex, sentence-start anchor. Not Word types: the tagger reads "tired" and "eyes" as verbs, so a
    // verbless pattern misses "Dark eyes, tired, a stranger." A pronoun opener is an action list ("He typed,
    // deleted, then typed again.") and is skipped, as is speech.
    regex({ id: 'default-fragment-list', label: 'Three-item fragment list', find: `${sentenceStart}${narration}(?!(?:I|he|she|they|we|you|it)\\b)[^,.!?\\n"]{1,40}, [^,.!?\\n"]{1,40}, (?:and )?[^,.!?\\n"]{1,60}[.!?]`, action: 'rewrite', note: 'A list of three fragments. Write it as one plain sentence with a verb, or keep only the detail that matters.' }),
    // ponytail: regex, sentence-start and sentence-end anchors.
    regex({ id: 'default-not-fragment', label: 'Not hungry.', find: `${sentenceStart}Not(?: \\w+){1,2}[.!?]`, caseSensitive: true, action: 'rewrite', wholeParagraph: true, note: 'A "Not X." fragment correcting the sentence before it. Say the thing once, plainly.' }),
    // ponytail: regex, sentence-start anchor, either/or, and a word count. The model reassuring itself: "A greeting.
    // Nothing that sounded like an opening." Short tails only, and the first word can't look like a verb or a
    // subject, so "Nothing happened.", "No one answered." and "Just then." stay. "Nothing that he said mattered."
    // still hits; add a verb check when that shows up.
    regex({ id: 'default-reassurance', label: 'Nothing dramatic. Just a greeting.', find: `${sentenceStart}${narration}(?:Nothing (?:that|to|but|more|less|else|like|about|from)\\b[^.!?\\n"]*|(?:Nothing|No|Just)(?! (?:one|body|then|now|as|in|[a-z]+ed|was|is|came|went|could|would|did|had|felt|seemed|mattered|moved|changed)\\b)(?: [\\w'-]+){1,3})[.!?]`, caseSensitive: true, action: 'rewrite', wholeParagraph: true, note: 'A reassuring denial or qualifier fragment ("Nothing dramatic.", "Just a greeting."). State what happens and drop the hedge.' }),
    // ponytail: regex, an -ed ending, so "watched" hits and "took" doesn't. Add irregulars when a miss shows up.
    regex({ id: 'default-verb-triple', label: 'Dragged him, ordered, watched', find: ',\\s+[a-z]+ed\\b[^,.!?\\n]{0,40},\\s+(?:and\\s+)?[a-z]+ed\\b[^,.!?\\n]{0,40}[.!?]', caseSensitive: true, action: 'rewrite', wholeParagraph: true, note: 'A string of actions tacked on with commas. Keep the one that matters.' }),
    // ponytail: regex, sentence-start anchor and a capital.
    regex({ id: 'default-adjective-lead', label: 'Slow, unhurried, ...', find: `${sentenceStart}(?!${interjections}\\b)[A-Z][a-z]+, [a-z-]+,`, caseSensitive: true, action: 'rewrite', note: 'Stacked adjectives as a fragment. Fold the description into a sentence with a verb.' }),
    // ponytail: regex, either/or on the verb.
    regex({ id: 'default-adjective-pile', label: 'Was quiet, half-empty', find: '\\b(?:was|were|is|are|looked|felt|seemed) [a-z-]+, [a-z-]+[,.]', caseSensitive: true, action: 'rewrite', note: 'Stacked adjectives. Keep one, or show it through something happening.' }),
    // ponytail: regex, either/or on the verb and the place. Something abstract left hanging in a space: "The word
    // asshole hung in the room like smoke". Catches what words-physical misses when a word sits between.
    regex({ id: 'default-hung-in-air', label: 'Hung in the room like smoke', find: '\\b(?:hung|hangs|hanging|lingered|lingers|lingering|hovered|hovers|hovering|settled|settles|settling)\\s+(?:in|over|between|across)\\s+(?:the (?:air|room|space|silence|kitchen|car|hall|hallway)|them|us)\\b', action: 'delete' }),
    // ponytail: regex, either/or on the verb. "Creep" for anything that isn't sneaking: a smile, heat, a note in a voice.
    regex({ id: 'default-creep', label: 'A smile crept up', find: '\\b(?:smile|grin|smirk|blush|flush|heat|warmth|color|colour|dread|panic|doubt|edge|note|hint|tension)\\s+(?:\\w+\\s+)?(?:crept|creeps?|creeping)\\b|\\b(?:crept|creeps?|creeping)\\s+(?:into|onto|across|over|up)\\s+(?:his|her|their|my|your)\\s+(?:face|voice|lips|mouth|cheeks|neck|tone|expression)\\b', action: 'rewrite', note: 'Creep used for something that isn\'t sneaking. Say plainly what appeared or changed.' }),
    // ponytail: regex, either/or on the pronoun and the verb.
    regex({ id: 'default-held-breath', label: 'A breath he didn\'t know he was holding', find: '\\bbreath (?:he|she|they|I|we|you) (?:hadn\'t|had not|didn\'t|did not) (?:know|known|realize|realized|notice|noticed)\\b', action: 'delete' }),
    // ponytail: regex, either/or on the organ and up to two words for the verb.
    regex({ id: 'default-something-chest', label: 'Something twisted in his chest', find: '\\bsomething\\s+(?:\\w+\\s+){1,2}in (?:his|her|their|my|your) (?:chest|gut|stomach)\\b', action: 'rewrite', note: 'An unnamed "something" moving inside the body. Name the feeling or show what the character does.' }),
    // ponytail: regex, either/or on the blow and the target.
    regex({ id: 'default-punch-gut', label: 'Like a punch to the gut', find: '\\blike a (?:punch|blow|kick|slap) (?:to|in) the (?:gut|stomach|throat|chest|face)\\b', action: 'rewrite', note: 'A stock simile. Say what the character did or felt instead.' }),
    // ponytail: regex, crosses sentences.
    regex({ id: 'default-no-words-just', label: 'No words. Just breath.', find: `${sentenceStart}No \\w+(?: \\w+)?\\.["*]?\\s+Just\\b[^.!?\\n]*[.!?]`, caseSensitive: true, action: 'delete' }),
  ]
}
