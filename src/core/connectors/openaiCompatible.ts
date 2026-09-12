import type { ChatMessage, StreamChunk } from './connectorInterface'
import { parseSse } from './connectorInterface'
import type { Connection } from '../stores/settingsStore'
import { useSettings } from '../stores/settingsStore'
import { sendDummyMessage } from './dummy'
import { isSentinel, sendSentinelMessage } from './sentinel'
import { buildRequestBody, requestHeaders, completionUrl } from './buildRequestBody'
import { paramDefList } from '../stores/paramDefsStore'
import { describeFetchError } from './fetchError'

/** Streams a reply from any OpenAI-compatible endpoint, chat or text completion. */
export async function* sendMessage(
  messages: ChatMessage[],
  connection: Connection,
  signal?: AbortSignal,
  /** Extra body fields for this one request; see buildRequestBody. */
  extra?: Record<string, unknown>,
): AsyncGenerator<StreamChunk> {
  // Checked here rather than at each call site. Nothing can accidentally bypass debug mode.
  if (useSettings.getState().debugMode) {
    yield* sendDummyMessage(messages, signal)
    return
  }

  // Same reason, one level up: the sentinel host does not exist. The request must not be made.
  if (isSentinel(connection.endpointUrl)) {
    yield* sendSentinelMessage(signal)
    return
  }

  const url = completionUrl(connection.endpointUrl, connection.type)
  const body = JSON.stringify(buildRequestBody(messages, connection, paramDefList(), extra))
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers: requestHeaders(connection), body, signal })
  } catch (err) {
    // An abort is the user's own doing and must keep its name: callers that check for it
    // still can. Everything else gets the reachable/CORS reading.
    if (signal?.aborted) throw err
    throw new Error(describeFetchError(err, url))
  }

  if (!res.ok || !res.body) {
    // The status rides along on the error: the palette request reads it to tell "this endpoint
    // refused the request I sent" from "the network fell over", and downgrades on the first.
    throw Object.assign(new Error(`${url} responded ${res.status}: ${await res.text()}`), {
      status: res.status,
    })
  }

  yield* parseSse(res.body)
}
