// Run: node --experimental-strip-types src/core/prompt/checkOutline.ts
import assert from 'node:assert'
import {
  buildChapterOutlineMessages,
  buildStoryOutlineMessages,
  parseChapterOutlineReply,
  parseStoryOutlineReply,
  type ChapterOutlineRequest,
  type StoryOutlineRequest,
} from './outline.ts'

const story = (over: Partial<StoryOutlineRequest> = {}): StoryOutlineRequest => ({
  premise: 'A locksmith inherits a door.',
  chapters: 5,
  targetWords: 0,
  themes: '',
  genre: '',
  tone: '',
  setting: '',
  ending: '',
  cast: [],
  ...over,
})

const chapter = (over: Partial<ChapterOutlineRequest> = {}): ChapterOutlineRequest => ({
  chapterNumber: 2,
  title: 'The Inn',
  summary: 'She takes a room and hears the story.',
  beats: 0,
  targetWords: 0,
  notes: '',
  premise: '',
  themes: '',
  ending: '',
  previousSummary: '',
  previousProse: '',
  ...over,
})

// --- parseStoryOutlineReply: the documented shape ----------------------------
assert.deepStrictEqual(
  parseStoryOutlineReply('{"chapters":[{"title":"The Arrival","summary":"She lands.","weight":"long"}]}'),
  [{ title: 'The Arrival', summary: 'She lands.', weight: 'long' }],
)
// No weight is a normal chapter, not a dropped one.
assert.deepStrictEqual(parseStoryOutlineReply('{"chapters":[{"title":"A","summary":"b"}]}'), [
  { title: 'A', summary: 'b', weight: 'normal' },
])
// A fenced object, and one wrapped in a sentence, both parse: models do this constantly.
assert.strictEqual(
  parseStoryOutlineReply('```json\n{"chapters":[{"title":"A","summary":"s"}]}\n```')[0].title,
  'A',
)
assert.strictEqual(
  parseStoryOutlineReply('Here you go:\n{"chapters":[{"title":"A"}]}\nHope that helps!')[0].title,
  'A',
)

// Story outlines carry no beats: a model that sends them anyway is ignored, not obeyed.
const withBeats = parseStoryOutlineReply(
  '{"chapters":[{"title":"A","summary":"s","beats":["x","y"]}]}',
)
assert.deepStrictEqual(withBeats, [{ title: 'A', summary: 's', weight: 'normal' }])

// --- untrusted input: coerced, not taken as written --------------------------
assert.deepStrictEqual(
  parseStoryOutlineReply(
    '{"chapters":[' +
      '{"title":"Two\\n  lines","summary":42,"weight":"MAJOR"},' +
      'null,' +
      '["not an object"],' +
      '{"title":"","summary":""},' +
      '{"title":"Last","weight":9}' +
      ']}',
  ),
  [
    // Newlines fold: a title is one line. An unrecognised weight falls back rather than throwing.
    { title: 'Two lines', summary: '42', weight: 'major' },
    { title: 'Last', summary: '', weight: 'normal' },
  ],
)

// --- rejections ---------------------------------------------------------------
const bad = (input: string, parse: (s: string) => unknown) => {
  try {
    parse(input)
  } catch (err) {
    return (err as Error).message
  }
  throw new Error(`${input} should not parse`)
}
assert.match(bad('Sorry, I cannot help with that.', parseStoryOutlineReply), /no JSON object/)
assert.match(bad('{"chapters":[{"title":"A"', parseStoryOutlineReply), /never closed it/)
assert.match(bad('{"chapters":[}', parseStoryOutlineReply), /did not parse/)
assert.match(bad('{"outline":[]}', parseStoryOutlineReply), /no chapters array/)
assert.match(bad('{"chapters":[]}', parseStoryOutlineReply), /no chapters\./)
// Every entry unusable is the same as none: nothing is written, the existing chapters survive.
assert.match(bad('{"chapters":[null,{"title":""}]}', parseStoryOutlineReply), /no chapters\./)
assert.match(bad('{"beats":[]}', parseChapterOutlineReply), /no beats\./)
assert.match(bad('{"chapters":[]}', parseChapterOutlineReply), /no beats array/)

// --- caps ----------------------------------------------------------------------
const manyChapters = JSON.stringify({
  chapters: Array.from({ length: 200 }, () => ({ title: 'x', summary: 'y' })),
})
assert.strictEqual(parseStoryOutlineReply(manyChapters).length, 60)
const manyBeats = JSON.stringify({ beats: Array.from({ length: 100 }, () => ({ content: 'b' })) })
assert.strictEqual(parseChapterOutlineReply(manyBeats).length, 40)

// --- parseChapterOutlineReply --------------------------------------------------
// The documented fields are content/length, the same shape Bulk Add takes.
assert.deepStrictEqual(
  parseChapterOutlineReply('{"beats":[{"content":"She lands.","length":"brief"},{"content":"The inn"}]}'),
  [
    { beat: 'She lands.', weight: 'brief' },
    { beat: 'The inn', weight: 'normal' },
  ],
)
// The older beat/weight names are taken too: a model that reuses them still lands its beats.
assert.deepStrictEqual(parseChapterOutlineReply('{"beats":[{"beat":"a","weight":"major"}]}'), [
  { beat: 'a', weight: 'major' },
])
// A bare array of strings is accepted: the lines are the beats, all at the default weight.
assert.deepStrictEqual(parseChapterOutlineReply('{"beats":["a","","  ","b"]}'), [
  { beat: 'a', weight: 'normal' },
  { beat: 'b', weight: 'normal' },
])
// An entry with no content is nothing to write, however well-formed the rest of it is.
assert.deepStrictEqual(parseChapterOutlineReply('{"beats":[{"length":"major"},{"content":"a"}]}'), [
  { beat: 'a', weight: 'normal' },
])

// --- buildStoryOutlineMessages: the slots are filled, none left standing -----
const full = buildStoryOutlineMessages(
  story({
    targetWords: 60000,
    themes: 'Growth, and what it costs.',
    genre: 'Fantasy',
    tone: 'Warm',
    setting: 'A canal city',
    ending: 'She closes the door herself.',
    cast: ['Ines: a locksmith.', 'Bru: her apprentice.'],
  }),
)
assert.strictEqual(full.length, 2)
assert.strictEqual(full[0].role, 'system')
assert.doesNotMatch(full[0].content, /\{\{/)
assert.match(full[0].content, /array of 5 objects/)
assert.match(full[0].content, /about 60000 words/)
assert.match(full[0].content, /A locksmith inherits a door\./)
assert.match(full[0].content, /Growth, and what it costs\./)
assert.match(full[0].content, /Genre: Fantasy\. Tone: Warm\. Setting: A canal city\./)
assert.match(full[0].content, /Bru: her apprentice\./)
assert.match(full[0].content, /She closes the door herself\./)

// Premise alone: every optional slot is empty and nothing dangles where it was.
const bare = buildStoryOutlineMessages(story())
assert.doesNotMatch(bare[0].content, /\{\{/)
assert.doesNotMatch(bare[0].content, /words/)
assert.doesNotMatch(bare[0].content, /Themes/)
assert.doesNotMatch(bare[0].content, /The cast/)
assert.doesNotMatch(bare[0].content, /\n\n\n/)

// --- buildChapterOutlineMessages ------------------------------------------------
const chapterFull = buildChapterOutlineMessages(
  chapter({
    beats: 6,
    targetWords: 3200,
    notes: 'They argue about the map.',
    premise: 'A locksmith inherits a door.',
    previousSummary: 'She landed.',
  }),
)
assert.doesNotMatch(chapterFull[0].content, /\{\{/)
assert.match(chapterFull[0].content, /Chapter 2: The Inn/)
assert.match(chapterFull[0].content, /exactly 6 beats/)
assert.match(chapterFull[0].content, /about 3200 words/)
assert.match(chapterFull[0].content, /They argue about the map\./)
assert.match(chapterFull[0].content, /previous chapter covered/)

// Prose wins over the summary when the previous chapter has been written.
const withProse = buildChapterOutlineMessages(
  chapter({ previousSummary: 'She landed.', previousProse: 'The boat touched the quay.' }),
)
assert.match(withProse[0].content, /previous chapter ended on/)
assert.doesNotMatch(withProse[0].content, /She landed\./)

// Long prose is cut to its tail: one written chapter cannot swamp the request.
const long = 'word '.repeat(2000)
const cut = buildChapterOutlineMessages(chapter({ previousProse: long }))
assert.ok(cut[0].content.length < 3000, `tail not cut: ${cut[0].content.length}`)
assert.match(cut[0].content, /\.\.\./)

// Title and summary alone: the optional halves leave nothing behind.
const chapterBare = buildChapterOutlineMessages(chapter())
assert.doesNotMatch(chapterBare[0].content, /\{\{/)
assert.doesNotMatch(chapterBare[0].content, /previous chapter/)
assert.doesNotMatch(chapterBare[0].content, /exactly/)

// A stack override replaces the wording and still gets its slots filled.
assert.strictEqual(
  buildStoryOutlineMessages(story({ premise: 'p', chapters: 2 }), {
    storyOutline: 'Write {{chapters}} chapters about: {{premise}}',
  })[0].content,
  'Write 2 chapters about: p',
)
assert.strictEqual(
  buildChapterOutlineMessages(chapter({ title: 'T', summary: '' }), {
    chapterOutline: 'Beats for {{chapter}}',
  })[0].content,
  'Beats for Chapter 2: T',
)

// --- prose in a beat: the quotes and newlines models forget to escape ------
{
  // An unescaped quote mid-string. This is the reply shape that used to fail the parse outright.
  const beats = parseChapterOutlineReply(
    '{"beats":[{"content":"She says "no" and leaves","length":"brief"}]}',
  )
  assert.deepStrictEqual(beats, [{ beat: 'She says "no" and leaves', weight: 'brief' }])

  // A raw newline inside a string, which is never legal JSON.
  assert.strictEqual(
    parseChapterOutlineReply('{"beats":[{"content":"Two\nlines","length":"normal"}]}')[0].beat,
    'Two lines', // str() folds the newline out; the point is that it parsed at all.
  )

  // A quote that really does end the string is still an end, whatever follows the comma.
  assert.deepStrictEqual(
    parseChapterOutlineReply('{"beats":[{"content":"one"},{"content":"two"}]}').map((b) => b.beat),
    ['one', 'two'],
  )

  // A reply that is valid to begin with is not touched: the repair is a second pass only.
  assert.strictEqual(
    parseChapterOutlineReply('{"beats":[{"content":"She says \\"no\\"","length":"long"}]}')[0].beat,
    'She says "no"',
  )

  // Still unusable after the repair, and the message carries the text it choked on.
  assert.throws(
    () => parseChapterOutlineReply('{"beats":[{"content":,}]}'),
    (err: Error) => err.message.includes('did not parse') && err.message.includes('"beats"'),
  )
}

console.log('checkOutline ok')
