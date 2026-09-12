// SillyTavern's authoring comments, removed before a prompt leaves the browser.
//
// An imported preset is full of notes the author left for themselves:
//   {{// this negates positivity bias without making NPCs annoying}}{{trim}}
// Nothing in this codebase reads them, and left alone they'd be sent to the model as instructions.
// {{trim}} is the ST macro that swallowed the whitespace the comment left behind. It has no meaning
// here either, and goes with it.
//
// Only ever applied to authored prompt text: card fields, prompt blocks, presets. Chat history is
// transcript, and a {{//}} someone typed into a message is theirs.

/** `{{// anything }}`, possibly spanning lines, the same shape ST matches. */
const comment = /\{\{\/\/[\s\S]*?\}\}/g

/** ST's whitespace macro. Meaningless here whether a comment came with it or not. */
const trim = /\{\{trim\}\}/gi

/** A comment sitting at the start of its own line, with any trailing {{trim}} and the newline. */
const wholeLine = /^[ \t]*\{\{\/\/[\s\S]*?\}\}(?:[ \t]*\{\{trim\}\})*[ \t]*\r?\n/gm

/**
 * Strips ST comments and {{trim}} markers. A comment that had a line to itself takes the line with
 * it: removing it doesn't leave a blank gap in the middle of a prompt. One sharing a line with
 * real text leaves that text where it is.
 */
export function stripComments(text: string): string {
  if (!text || !text.includes('{{')) return text
  return text.replace(wholeLine, '').replace(comment, '').replace(trim, '')
}
