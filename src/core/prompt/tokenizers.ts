// Extensioned imports: reachable from checkAutoTokenizer.ts under node --strip-types.
import { autoTokenizerFor } from './autoTokenizer.ts'

/**
 * The tokenizer library, as data. A family is a row here rather than code. Adding one is a line.
 *
 * Two kinds:
 * - `tiktoken`: a BPE table from `gpt-tokenizer`, already a dependency. Code-split, no download.
 * - `hf`: a `tokenizer.json` that has to be fetched before it can count. See tokenizerCache.ts.
 */
export type TokenizerId =
  | 'auto'
  | 'o200k_base'
  | 'cl100k_base'
  | 'llama2'
  | 'llama3'
  | 'mistral_nemo'
  | 'qwen2_5'
  | 'qwen3'
  | 'gemma2'
  | 'deepseek_v3'
  | 'command_r_plus'
  | 'yi'
  | 'claude'

/** Everything `countTokens` can actually run. `auto` resolves to one of these. */
export type ResolvedTokenizerId = Exclude<TokenizerId, 'auto'>

export interface TokenizerDef {
  id: ResolvedTokenizerId
  label: string
  kind: 'tiktoken' | 'hf'
  /** hf only: the npm package under @lenml holding the vocab. */
  pkg?: string
  /** hf only: uncompressed tokenizer.json size, shown next to the download button. */
  bytes?: number
}

/** Pinned: a version in the URL is immutable. A cached vocab never goes stale against it. */
export const vocabVersion = '3.7.2'

export const tokenizerDefs: TokenizerDef[] = [
  { id: 'o200k_base', label: 'GPT-4o / GPT-5 (o200k)', kind: 'tiktoken' },
  { id: 'cl100k_base', label: 'GPT-3.5 / GPT-4 (cl100k)', kind: 'tiktoken' },
  { id: 'llama3', label: 'Llama 3', kind: 'hf', pkg: 'llama3', bytes: 9084490 },
  { id: 'llama2', label: 'Llama 2', kind: 'hf', pkg: 'llama2', bytes: 1795303 },
  { id: 'mistral_nemo', label: 'Mistral / Nemo', kind: 'hf', pkg: 'mistral_nemo', bytes: 9264445 },
  { id: 'qwen3', label: 'Qwen 3', kind: 'hf', pkg: 'qwen3', bytes: 11422654 },
  { id: 'qwen2_5', label: 'Qwen 2.5', kind: 'hf', pkg: 'qwen2_5', bytes: 7031645 },
  { id: 'gemma2', label: 'Gemma', kind: 'hf', pkg: 'gemma2', bytes: 17525357 },
  { id: 'deepseek_v3', label: 'DeepSeek', kind: 'hf', pkg: 'deepseek_v3', bytes: 7847652 },
  { id: 'command_r_plus', label: 'Command R+', kind: 'hf', pkg: 'command_r_plus', bytes: 16543645 },
  { id: 'yi', label: 'Yi', kind: 'hf', pkg: 'yi', bytes: 3560486 },
  { id: 'claude', label: 'Claude', kind: 'hf', pkg: 'claude', bytes: 1774213 },
]

/** What `countTokens` falls back to: bundled, and the one every connection used before this. */
export const defaultTokenizer: ResolvedTokenizerId = 'o200k_base'

export function tokenizerDef(id: ResolvedTokenizerId): TokenizerDef {
  return tokenizerDefs.find((t) => t.id === id) ?? tokenizerDefs[0]
}

/** The one place `auto` is unwrapped: no caller repeats the branch. */
export function tokenizerFor(connection: {
  tokenizer?: TokenizerId
  model: string
}): ResolvedTokenizerId {
  const id = connection.tokenizer ?? 'auto'
  return id === 'auto' ? autoTokenizerFor(connection.model) : id
}

export function vocabUrls(def: TokenizerDef) {
  const base = `https://cdn.jsdelivr.net/npm/@lenml/tokenizer-${def.pkg}@${vocabVersion}/models`
  return { json: `${base}/tokenizer.json`, config: `${base}/tokenizer_config.json` }
}
