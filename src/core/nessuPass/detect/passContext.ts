/**
 * What Second Pass needs beyond the reply text itself. Every field is optional: a call site that
 * cannot supply history just produces fewer notes, never an error.
 *
 * Split out of `runSecondPass.ts` so the repetition check and its check script can import it
 * without pulling in the connector and the whole send path behind it.
 */
export interface PassContext {
  /** Whose text this is. Grammar Hammer rules are scoped by it. */
  role?: 'user' | 'assistant'
  /** Recent text from this conversation, oldest first. The repetition check reads it, and trims to
   *  its own lookback setting, so a caller passing more than it needs costs nothing. */
  history?: string[]
}
