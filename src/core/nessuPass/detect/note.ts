/**
 * One thing Second Pass found wrong. Both producers emit this shape, so the prompt builder renders
 * from a single list: the Grammar Hammer's `flag` rules, and the repetition check.
 *
 * `span` indexes the *cleaned* text, the string the model will actually be shown, not what the
 * model originally wrote. That is what makes a targeted edit possible: the instruction can quote
 * the exact slice and ask for a replacement for it, rather than asking for a rewrite of everything.
 */
export interface Note {
  /** Who found it: 'hammer:<rule label>', or 'repetition'. */
  source: string
  span?: { start: number; end: number }
  slice?: string
  /** What is wrong, in a sentence the model reads. */
  message: string
  /** A concrete replacement, where the producer knows one. Absent means the model decides. */
  fix?: string
}
