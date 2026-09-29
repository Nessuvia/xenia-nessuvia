// Authoring comments, removed before a prompt leaves the browser. Two syntaxes: Jinja's `{# #}`,
// the native one, and SillyTavern's `{{// }}`, kept so imported presets and cards still work. A
// `{# #}` comment can hold `{{tokens}}` and `}}`. An ST one ends at the first `}}`, as it does in ST.
//
// An imported preset is full of notes the author left for themselves:
//   {{// this negates positivity bias without making NPCs annoying}}{{trim}}
// Nothing in this codebase reads them, and left alone they'd be sent to the model as instructions.
// {{trim}} is the ST macro that swallowed the whitespace the comment left behind. It has no meaning
// here either, and goes with it.
//
// Only ever applied to authored prompt text: card fields, prompt blocks, presets. Chat history is
// transcript, and a comment someone typed into a message is theirs.

// Bodies stop at the first closer. A lazy `[\s\S]*?` would let the whole-line patterns run past it
// to a later closer that happens to end a line, eating the real text in between.
const stBody = String.raw`\{\{\/\/(?:(?!\}\})[\s\S])*\}\}`
const jinjaBody = String.raw`\{#(?:(?!#\})[\s\S])*#\}`

/** `{{// anything }}`, possibly spanning lines, the same shape ST matches. */
const comment = new RegExp(stBody, 'g')

/** `{# anything #}`, possibly spanning lines. */
const jinja = new RegExp(jinjaBody, 'g')

/** ST's whitespace macro. Meaningless here whether a comment came with it or not. */
const trim = /\{\{trim\}\}/gi

/** Comments with a line to themselves, with any trailing {{trim}} and the newline. */
const wholeLine = new RegExp(String.raw`^[ \t]*${stBody}(?:[ \t]*(?:${stBody}|\{\{trim\}\}))*[ \t]*\r?\n`, 'gim')
const wholeLineJinja = new RegExp(String.raw`^[ \t]*${jinjaBody}(?:[ \t]*${jinjaBody})*[ \t]*\r?\n`, 'gm')

/**
 * Strips `{# #}` and ST comments, and {{trim}} markers. A comment that had a line to itself takes
 * the line with it: removing it doesn't leave a blank gap in the middle of a prompt. One sharing a
 * line with real text leaves that text where it is.
 */
export function stripComments(text: string): string {
  if (!text || !text.includes('{')) return text
  if (text.includes('{#')) text = text.replace(wholeLineJinja, '').replace(jinja, '')
  if (!text.includes('{{')) return text
  return text.replace(wholeLine, '').replace(comment, '').replace(trim, '')
}
