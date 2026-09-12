// Extension-ful imports on purpose: checkLexicon.ts runs this under `node --experimental-strip-types`.
import type { LexiconEntry } from './lexicon.ts'

/**
 * The slop list that ships with the build.
 *
 * A `.ts` data file rather than JSON, unlike `nessuPass/bundled/pipelines.json`, for one reason:
 * the check scripts import this under `node --experimental-strip-types`, and a JSON import needs an
 * import attribute that Vite and node spell differently enough to be a nuisance. Nothing here is
 * code. Editing the list is editing this array and nothing else.
 *
 * Ids are stable strings, not UUIDs, because the user's settings store an overlay keyed by id: a
 * phrase the user disabled must stay disabled when the list is updated.
 *
 * Weights say how loud a tell is, not how wrong it is. A phrase every model reaches for on the
 * first sentence of every reply earns a 3. Something merely tired earns a 1.
 */
export const bundledLexicon: LexiconEntry[] = [
  // The body-as-weather register. The single largest family in generated roleplay prose.
  entry('shiver-spine', 'a shiver (ran|run|running|runs) down .{0,12}spine', 3, true),
  entry('breath-hitched', 'breath (hitched|catches|caught) in .{0,12}throat', 3, true),
  entry('heart-hammered', '(heart|pulse) (hammered|hammering|pounded|pounding) (against|in) .{0,12}(chest|ribs)', 3, true),
  entry('electricity', 'a (jolt|spark|current) of (electricity|something)', 2, true),
  entry('warmth-pooled', '(warmth|heat) (pooled|pooling|coiled|coiling) in .{0,12}(belly|stomach|core)', 3, true),
  entry('stomach-knot', 'stomach (twisted|knotted|churned|dropped)', 2, true),

  // Eyes doing work the scene should be doing.
  entry('unreadable', 'something unreadable', 3),
  entry('eyes-darkened', 'eyes (darkened|darkening)', 2, true),
  entry('met-and-held', '(gaze|eyes) met and held', 3, true),
  entry('searching-his', '(searching|studying) (his|her|their) (face|eyes|expression)', 2, true),
  entry('glint', 'a (glint|flicker|spark) of (mischief|amusement|something)', 2, true),

  // Voice and speech tags that describe nothing.
  entry('voice-barely', 'voice barely (above|more than) a whisper', 3, true),
  entry('breathed-out', 'he breathed|she breathed|they breathed', 1, true),
  entry('trailed-off', 'voice (trailed|trailing) off', 1, true),
  entry('dangerously-low', 'voice (dropped|drops|dropping) (to|into) (a|an) .{0,16}(whisper|growl|murmur)', 2, true),

  // The stock beats that stand in for a reaction.
  entry('sharp-inhale', '(sharp|sudden) (intake|inhale) of breath', 2, true),
  entry('swallowed-hard', 'swallowed hard', 2),
  entry('exhale-not-know', 'let out a breath .{0,20}did(n.t| not) know', 3, true),
  entry('ghost-of-a-smile', 'a? ?ghost of a (smile|smirk|grin)', 3, true),
  entry('lips-quirked', 'lips (quirked|twitched|curved) (up|into)', 2, true),
  entry('tucked-hair', 'tucked a (strand|lock) of hair', 2, true),
  entry('raised-eyebrow', 'a single (raised|arched) (eyebrow|brow)', 1, true),

  // Scene furniture and pacing filler.
  entry('air-thick', 'the air (was|hung|grew|felt) (thick|heavy|charged) with', 3, true),
  entry('silence-stretched', 'the silence (stretched|hung|settled)', 2, true),
  entry('time-seemed', 'time (seemed to|appeared to)? ?(slow|stop|still)', 2, true),
  entry('moment-hung', 'the moment (hung|stretched|hung between)', 2, true),
  entry('electric-tension', '(tension|air) (crackled|crackling)', 2, true),

  // Narrator editorialising, the tell that the model is summarising its own scene.
  entry('little-did', 'little did (he|she|they|you|i) know', 3, true),
  entry('and-yet', 'and yet, ', 1),
  entry('not-x-but-y', '(was|it was) not .{2,24} but ', 2, true),
  entry('mixture-of', 'a (mixture|mix) of .{2,20} and ', 2, true),
  entry('somewhere-between', 'somewhere between .{2,20} and ', 2, true),
  entry('as-if-on-cue', 'as if on cue', 2),
  entry('unspoken', 'the unspoken (question|words|thing)', 2, true),
  entry('hung-in-the-air', 'hung in the air between', 2),

  // Assistant register leaking into prose. These are the ones that make a reply read as a chatbot.
  entry('delve', 'delve', 3),
  entry('tapestry', 'tapestry', 3),
  entry('testament', 'a testament to', 3),
  entry('navigate-fig', 'navigate the (complexities|landscape|nuances)', 3, true),
  entry('it-is-worth', "it('s| is) worth noting", 2, true),
  entry('i-cannot-and-will', 'i cannot and will not', 3),
  entry('remember-that', 'remember, (this|that) ', 1),
  entry('in-conclusion', 'in conclusion', 3),

  // Closing moves that end a reply on a bow instead of on the scene.
  entry('little-by-little', 'little by little', 1),
  entry('for-now-at-least', 'for now, at least', 2),
  entry('whatever-came-next', 'whatever (came|comes) next', 2, true),
  entry('the-rest-could-wait', 'the rest could wait', 2),
  entry('one-thing-was-certain', 'one thing was (certain|clear)', 3, true),
]

function entry(id: string, phrase: string, weight: number, regex = false): LexiconEntry {
  return { id, phrase, regex, enabled: true, weight }
}
