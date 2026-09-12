// node --experimental-strip-types src/core/prompt/checkAutoTokenizer.ts
import assert from 'node:assert'
import { autoTokenizerFor } from './autoTokenizer.ts'
import { tokenizerDefs, tokenizerFor, vocabUrls, tokenizerDef } from './tokenizers.ts'

const cases: [string, string][] = [
  ['gpt-4o-mini', 'o200k_base'],
  ['gpt-5', 'o200k_base'],
  ['gpt-3.5-turbo', 'cl100k_base'],
  ['gpt-4-turbo', 'o200k_base'],
  ['anthropic/claude-sonnet-4.5', 'claude'],
  ['meta-llama/Llama-3.3-70B-Instruct', 'llama3'],
  ['llama-2-13b-chat', 'llama2'],
  ['codellama-34b', 'llama2'],
  ['Qwen/Qwen3-32B', 'qwen3'],
  ['qwen2.5-72b-instruct', 'qwen2_5'],
  ['mistralai/Mixtral-8x7B', 'mistral_nemo'],
  ['Mistral-Nemo-Instruct-2407', 'mistral_nemo'],
  ['google/gemma-2-27b-it', 'gemma2'],
  ['deepseek-chat', 'deepseek_v3'],
  ['command-r-plus', 'command_r_plus'],
  ['01-ai/Yi-1.5-34B', 'yi'],
  // Nothing recognisable falls back to the bundled table rather than a download.
  ['some-finetune-v3', 'o200k_base'],
  ['', 'o200k_base'],
]

for (const [model, expected] of cases) {
  assert.equal(autoTokenizerFor(model), expected, `${model} → ${autoTokenizerFor(model)}`)
}

// Specific before general: llama-3 must not be swallowed by the llama-2 rule, and a vendor-prefixed
// route name must resolve on the model half.
assert.equal(autoTokenizerFor('LLAMA-3-8B'), 'llama3', 'case-insensitive')
assert.equal(autoTokenizerFor('openrouter/meta-llama/llama-3.1-8b'), 'llama3', 'prefixed route')

// An explicit pick wins over the guess; undefined and 'auto' both mean guess.
assert.equal(tokenizerFor({ model: 'gpt-4o', tokenizer: 'llama3' }), 'llama3')
assert.equal(tokenizerFor({ model: 'gpt-4o', tokenizer: 'auto' }), 'o200k_base')
assert.equal(tokenizerFor({ model: 'claude-3-opus' }), 'claude', 'undefined means auto')

// Every id the guesser can return has to exist in the registry, or loadTokenizer builds nothing.
for (const [, expected] of cases) {
  assert.ok(
    tokenizerDefs.some((d) => d.id === expected),
    `${expected} is not in the registry`,
  )
}

// Ids are unique, and every hf row carries what vocabUrls needs.
assert.equal(new Set(tokenizerDefs.map((d) => d.id)).size, tokenizerDefs.length, 'duplicate id')
for (const def of tokenizerDefs.filter((d) => d.kind === 'hf')) {
  assert.ok(def.pkg && def.bytes, `${def.id} is missing pkg or bytes`)
  const { json, config } = vocabUrls(def)
  assert.ok(json.startsWith('https://cdn.jsdelivr.net/npm/@lenml/tokenizer-'), json)
  assert.ok(config.endsWith('/tokenizer_config.json'), config)
  // Pinned: a cached vocab can never drift against the URL it was stored under.
  assert.match(json, /@\d+\.\d+\.\d+\//, 'vocab url is not version-pinned')
}

// An unknown id resolves to something rather than throwing deep inside buildCounter.
assert.ok(tokenizerDef('nope' as never).id)

console.log('checkAutoTokenizer ok')
