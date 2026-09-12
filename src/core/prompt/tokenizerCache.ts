/**
 * Downloaded tokenizer vocabularies.
 *
 * This is the fourth thing that talks outward, alongside sync/syncClient.ts,
 * multiplayer/centrifugoChannel.ts and the two Settings probes. It fetches two public JSON files from
 * jsDelivr and nothing else: no key, no header, no user text, and only when the user presses the
 * button in the connection editor. A vocab is a static asset. It never reaches the model
 * endpoint or the relay, and nothing about the request identifies the browser beyond the URL.
 *
 * Storage is the Cache API rather than Dexie on purpose. A vocab is redownloadable and up to 17 MB;
 * in Dexie it would ride along in every S3 sync push and every exported backup. This also keeps
 * core/storage the only importer of Dexie.
 */
import { tokenizerDef, vocabUrls, type ResolvedTokenizerId } from './tokenizers.ts'

const cacheName = 'nessuTavern.tokenizers'

/** Cache keys are opaque to the Cache API; the pinned URL is already unique per version. */
function keys(id: ResolvedTokenizerId) {
  const def = tokenizerDef(id)
  return def.kind === 'hf' ? vocabUrls(def) : null
}

function open() {
  // No Cache API in a check script or an old browser: everything below reports "not cached".
  return typeof caches === 'undefined' ? null : caches.open(cacheName)
}

export async function hasVocab(id: ResolvedTokenizerId): Promise<boolean> {
  const urls = keys(id)
  const cache = open()
  if (!urls || !cache) return false
  const store = await cache
  return Boolean((await store.match(urls.json)) && (await store.match(urls.config)))
}

/** Both files, or null if either is missing. Never fetches, that is fetchVocab's job. */
export async function readVocab(id: ResolvedTokenizerId) {
  const urls = keys(id)
  const cache = open()
  if (!urls || !cache) return null
  const store = await cache
  const [json, config] = await Promise.all([store.match(urls.json), store.match(urls.config)])
  if (!json || !config) return null
  return { tokenizerJSON: await json.json(), tokenizerConfig: await config.json() }
}

/** Downloads and stores both files. Throws on a bad response so the button can report it. */
export async function fetchVocab(id: ResolvedTokenizerId): Promise<void> {
  const urls = keys(id)
  const cache = open()
  if (!urls || !cache) throw new Error('This browser cannot store tokenizers.')
  const store = await cache
  // addAll is atomic enough for this: it rejects without writing if either file fails. A
  // half-downloaded vocab never looks cached.
  await store.addAll([urls.json, urls.config])
}

export async function removeVocab(id: ResolvedTokenizerId): Promise<void> {
  const urls = keys(id)
  const cache = open()
  if (!urls || !cache) return
  const store = await cache
  await Promise.all([store.delete(urls.json), store.delete(urls.config)])
}
