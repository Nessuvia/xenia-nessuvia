/**
 * What a pipeline run needs beyond the reply text itself. Every field is optional: a call site that
 * cannot supply history just gets a thinner census, never an error.
 *
 * Its own file so the detectors and their check scripts can import it without pulling in the
 * connector and the whole send path behind it.
 */
export interface PassContext {
  /** Whose text this is. Grammar Hammer rules are scoped by it. */
  role?: 'user' | 'assistant'
  /** Recent text from this conversation, oldest first. `quality/census.ts` counts the phrases this
   *  chat has worn out from it; the detectors themselves never read it. */
  history?: string[]
}
