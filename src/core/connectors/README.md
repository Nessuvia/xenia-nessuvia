# Connectors

Model calls. The send path goes store → connector, never `fetch` from a component.

- `openaiCompatible.ts`: streaming requests.
- `buildRequestBody.ts`: the request body and `completionUrl`.
- `listModels.ts`: the model list and `modelsUrl`.
- `dummy.ts`: a local generator for debugging. No request is sent.
- `snapshot.ts`: what a request looked like, for the prompt inspector.

## The sentinel

`xenia.nessuvia.com` as a connection URL is answered in the browser with a canned line
(`sentinel.ts`, `sentinelReplies.ts`). That host never resolves. Every outward call site checks
`isSentinel` first, including the ones outside this folder.

## Outward calls outside this folder

A few files talk to the network on purpose and say why in their header: the Dropbox client
(`core/sync/dropboxClient.ts`), the relay client (`core/multiplayer/centrifugoChannel.ts`), the
tokenizer download (`core/prompt/tokenizerCache.ts`), and the Settings connection probes
(`ConnectionEditor.tsx`, `readContextLimit.ts`), which build their requests from this folder's
`completionUrl`/`modelsUrl`/`buildRequestBody`. A new one needs the same kind of header comment.
