import { buildRequestBody, redact } from './buildRequestBody'
import type { ChatMessage } from './connectorInterface'
import type { Connection } from '../stores/settingsStore'
import { paramDefList } from '../stores/paramDefsStore'

/** Past this, a snapshot costs too much storage space. The inspector shows this marker. */
const maxSnapshotBytes = 256 * 1024

/** Stored in place of an oversized snapshot: lets the inspector tell the two cases apart. */
export const snapshotTooLarge = 'too-large'

/** The redacted request, as stored on the message. */
export function snapshotOf(messages: ChatMessage[], connection: Connection): string {
  const json = JSON.stringify(redact(buildRequestBody(messages, connection, paramDefList()), connection))
  return json.length > maxSnapshotBytes ? snapshotTooLarge : json
}
