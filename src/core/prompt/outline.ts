// The two outline generators: Story (chapters and their summaries) and Chapter (the beats of one).
// Same plumbing, different scope. Pure: no store, no fetch. checkOutline.ts can run it.
//
// Extension-ful imports on purpose: the check scripts run this under
// `node --experimental-strip-types`.
import type { ChatMessage } from '../connectors/connectorInterface.ts'
import type { BeatWeight } from '../storage/types.ts'
import { firstJsonObject, repairJsonStrings } from '../palette/palettePrompt.ts'
import { asWeight } from './beatWeights.ts'
import { fillSlots, miscPrompt, type MiscPrompts } from './miscPrompts.ts'

/** Ceilings on what a reply may turn into, applied at the parse. A model that answers with two
 *  hundred chapters of forty beats each would otherwise become that many Dexie records. */
const maxChapters = 60
const maxBeats = 40

// ---------------------------------------------------------------------------- Story outline

/**
 * What the Story generation screen collected. `premise` is the only required field; everything
 * else is the advanced half of the screen and is left out of the prompt when empty.
 *
 * `targetWords: 0` is unset and leaves every Chapter target at 0.
 */
export interface StoryOutlineRequest {
  premise: string
  chapters: number
  targetWords: number
  themes: string
  genre: string
  tone: string
  setting: string
  ending: string
  /** The enabled cast as "Name: description" lines. The store resolves the cards. */
  cast: string[]
}

/** One chapter of a parsed Story outline. `weight` divides the work's word target across chapters
 *  the same way a beat's does across a chapter. */
export interface OutlineChapter {
  title: string
  summary: string
  weight: BeatWeight
}

export function buildStoryOutlineMessages(
  req: StoryOutlineRequest,
  prompts?: MiscPrompts,
): ChatMessage[] {
  const shapeParts = [
    req.genre.trim() && `Genre: ${req.genre.trim()}.`,
    req.tone.trim() && `Tone: ${req.tone.trim()}.`,
    req.setting.trim() && `Setting: ${req.setting.trim()}.`,
  ].filter(Boolean)

  const text = fillSlots(miscPrompt('storyOutline', prompts), {
    premise: req.premise.trim(),
    chapters: String(req.chapters),
    words: req.targetWords > 0 ? `The whole work runs about ${req.targetWords} words.\n` : '',
    themes: para(req.themes.trim() && `Themes to carry through it:\n\n${req.themes.trim()}`),
    shape: para(shapeParts.join(' ')),
    cast: para(req.cast.length ? `The cast:\n\n${req.cast.join('\n')}` : ''),
    ending: para(req.ending.trim() && `It ends here:\n\n${req.ending.trim()}`),
  })
  return outlineTurns(text)
}

/**
 * The reply, as chapters. Model output: nothing is trusted. The object is cut out rather than
 * parsed whole, every field is coerced, and an entry that holds no title and no summary is dropped
 * rather than becoming an empty Chapter.
 *
 * Throws with a readable message when there is nothing usable. The screen shows it, and the store
 * only touches the existing chapters after this has returned.
 */
export function parseStoryOutlineReply(text: string): OutlineChapter[] {
  const raw = outlineObject(text)
  const rows = (raw as { chapters?: unknown })?.chapters
  if (!Array.isArray(rows)) throw new Error('The reply held no chapters array.')

  const out: OutlineChapter[] = []
  for (const row of rows.slice(0, maxChapters)) {
    const r = record(row)
    if (!r) continue
    const title = str(r.title)
    const summary = str(r.summary)
    if (!title && !summary) continue
    out.push({ title, summary, weight: asWeight(r.weight) })
  }

  if (out.length === 0) throw new Error('The reply held no chapters.')
  return out
}

// -------------------------------------------------------------------------- Chapter outline

/** What the Chapter generation dialog collected, plus what the store resolved off the Story.
 *  `beats: 0` lets the model pick; `targetWords: 0` is unset. */
export interface ChapterOutlineRequest {
  chapterNumber: number
  title: string
  summary: string
  beats: number
  targetWords: number
  /** Free-form author notes: the as-much-or-as-little-as-you-want field. */
  notes: string
  premise: string
  themes: string
  ending: string
  /** The previous chapter's summary, and its prose when it has any. Both may be ''. */
  previousSummary: string
  previousProse: string
}

/** One beat of a parsed Chapter outline. The field names follow the Bulk Add format: a reply
 *  can be pasted into that box and an outline can be pasted out of one. */
export interface OutlineBeat {
  beat: string
  weight: BeatWeight
}

export function buildChapterOutlineMessages(
  req: ChapterOutlineRequest,
  prompts?: MiscPrompts,
): ChatMessage[] {
  const chapter = [
    `Chapter ${req.chapterNumber}${req.title.trim() ? `: ${req.title.trim()}` : ''}`,
    req.summary.trim(),
  ]
    .filter(Boolean)
    .join('\n\n')

  const storyParts = [
    req.premise.trim() && `The story: ${req.premise.trim()}`,
    req.themes.trim() && `Themes: ${req.themes.trim()}`,
    req.ending.trim() && `Where it all ends: ${req.ending.trim()}`,
  ].filter(Boolean)

  // The prose wins when there is any: what was actually written says more than the recap of it.
  const previous = req.previousProse.trim()
    ? `What the previous chapter ended on:\n\n${tailOf(req.previousProse.trim())}`
    : req.previousSummary.trim()
      ? `What the previous chapter covered:\n\n${req.previousSummary.trim()}`
      : ''

  const text = fillSlots(miscPrompt('chapterOutline', prompts), {
    chapter,
    count: req.beats > 0 ? `Give the chapter exactly ${req.beats} beats.\n` : '',
    words: req.targetWords > 0 ? `The chapter runs about ${req.targetWords} words.\n` : '',
    notes: para(req.notes.trim() && `What the author wants from it:\n\n${req.notes.trim()}`),
    story: para(storyParts.join('\n')),
    previous: para(previous),
  })
  return outlineTurns(text)
}

/** The reply, as beats. Same distrust as the Story parse. A bare array of strings is accepted too:
 *  a model that ignores the object shape and answers with the lines still gets its beats used. */
export function parseChapterOutlineReply(text: string): OutlineBeat[] {
  const raw = outlineObject(text)
  const rows = (raw as { beats?: unknown })?.beats
  if (!Array.isArray(rows)) throw new Error('The reply held no beats array.')

  const out: OutlineBeat[] = []
  for (const row of rows.slice(0, maxBeats)) {
    if (typeof row === 'string') {
      const beat = str(row)
      if (beat) out.push({ beat, weight: asWeight(undefined) })
      continue
    }
    const r = record(row)
    if (!r) continue
    // `beat` is taken alongside `content`: a model that answers with the field named in the
    // instruction and one that reuses the older name both get their beats used.
    const beat = str(r.content) || str(r.beat)
    if (!beat) continue
    out.push({ beat, weight: asWeight(r.length ?? r.weight) })
  }

  if (out.length === 0) throw new Error('The reply held no beats.')
  return out
}

// ------------------------------------------------------------------------- Chapter summary

/** What the summary request carries. `prose` is already trimmed to fit by the caller, which is the
 *  only place that knows the connection's budget. `unwritten` is the beats with no prose yet: it
 *  lets the recap say a chapter is unfinished rather than end mid-air. */
export interface ChapterSummaryRequest {
  chapterNumber: number
  title: string
  prose: string
  unwritten: string[]
}

export function buildChapterSummaryMessages(
  req: ChapterSummaryRequest,
  prompts?: MiscPrompts,
): ChatMessage[] {
  const text = fillSlots(miscPrompt('chapterSummary', prompts), {
    chapter: `Chapter ${req.chapterNumber}${req.title.trim() ? `: ${req.title.trim()}` : ''}`,
    prose: req.prose.trim(),
    beats: para(
      req.unwritten.length
        ? `Still unwritten, planned as:\n\n${req.unwritten.join('\n')}`
        : '',
    ),
  })
  return [
    { role: 'system', content: text },
    { role: 'user', content: 'Write the summary.' },
  ]
}

// -------------------------------------------------------------------------------- internals

/** One system turn. There is no history and no stack here: the whole request is the instruction,
 *  and an endpoint that wants a user turn to answer at all gets a bare one. */
function outlineTurns(text: string): ChatMessage[] {
  return [
    { role: 'system', content: text },
    { role: 'user', content: 'Write the outline.' },
  ]
}

/** The reply's JSON object, or a readable throw. Shared so both parses fail the same way. */
function outlineObject(text: string): unknown {
  const json = firstJsonObject(text)
  if (!json) {
    throw new Error(
      text.includes('{')
        ? 'The reply started a JSON object but never closed it. It was probably cut off.'
        : 'The reply had no JSON object in it.',
    )
  }
  try {
    return JSON.parse(json)
  } catch (err) {
    // A beat is prose: the usual failure is a quote or a newline the model did not escape.
    // Second pass rather than first: a reply that was already valid must never go through a repair.
    try {
      return JSON.parse(repairJsonStrings(json))
    } catch {
      throw new Error(
        `The reply's JSON did not parse: ${(err as Error).message}\n\n${aroundFailure(json, (err as Error).message)}`,
      )
    }
  }
}

/**
 * The text either side of the position a parse failed at. A column number on its own says nothing
 * about which beat broke, and the reply is gone by the time the dialog shows the error.
 *
 * The position is read out of the engine's own message, which is not a stable format: V8 says
 * "at position 337", SpiderMonkey says "column 338". Neither matching means the whole object is
 * shown instead, which is still more use than a number.
 */
function aroundFailure(json: string, message: string, span = 120): string {
  const hit = /position (\d+)/.exec(message) ?? /column (\d+)/.exec(message)
  if (!hit) return json.length <= span * 2 ? json : `${json.slice(0, span * 2)}…`
  const at = Number(hit[1])
  const from = Math.max(0, at - span)
  const to = Math.min(json.length, at + span)
  return `${from > 0 ? '…' : ''}${json.slice(from, to)}${to < json.length ? '…' : ''}`
}

/** A row as a plain object, or undefined for anything that is not one (an array, null, a string). */
function record(row: unknown): Record<string, unknown> | undefined {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  return row as Record<string, unknown>
}

/** A field as a single-line string. A number or a boolean is written out rather than dropped;
 *  anything else (an object, an array, null) is not text and becomes nothing. */
function str(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s*\n\s*/g, ' ').trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** An optional paragraph: blank when there is nothing, and otherwise separated from what precedes
 *  it. Keeps the templates free of conditional whitespace. */
function para(text: string): string {
  return text ? `\n${text}\n` : ''
}

/** The end of a long stretch of prose. The previous chapter can be thousands of words. Only its
 *  landing matters for planning the next one, and the outline request carries the tail. */
function tailOf(prose: string, chars = 1500): string {
  if (prose.length <= chars) return prose
  const cut = prose.slice(prose.length - chars)
  const at = cut.indexOf('\n')
  return `...${at === -1 ? cut : cut.slice(at + 1)}`
}
