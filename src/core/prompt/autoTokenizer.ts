import type { ResolvedTokenizerId } from './tokenizers.ts'

/**
 * Guesses a model's tokenizer family from its id. Names are the only signal an OpenAI-compatible
 * endpoint gives: there is no field for this. It is a guess. The picker exists for when the
 * guess is wrong.
 *
 * Order matters: the more specific pattern has to be tested before the family it belongs to
 * (`llama-3` before `llama`, `codestral` before `mistral`).
 */
const rules: [RegExp, ResolvedTokenizerId][] = [
  // Route names carry a vendor prefix (`openrouter/anthropic/claude-3.5-sonnet`). Match anywhere.
  [/gpt-?[45]|gpt-?oss|\bo[1-4]\b|chatgpt/, 'o200k_base'],
  [/gpt-?3\.5|text-davinci|gpt-?3\b/, 'cl100k_base'],
  [/claude/, 'claude'],
  // The lookahead is load-bearing: without it `codellama-34b` looks like "llama-3".
  [/llama-?3(?!\d)/, 'llama3'],
  [/llama-?2(?!\d)|codellama|vicuna|wizardlm/, 'llama2'],
  [/qwen-?3(?!\d)|qwq/, 'qwen3'],
  [/qwen/, 'qwen2_5'],
  [/mistral|mixtral|magistral|codestral|ministral|nemo|pixtral/, 'mistral_nemo'],
  [/gemma|gemini/, 'gemma2'],
  [/deepseek/, 'deepseek_v3'],
  [/command-?r|cohere|aya/, 'command_r_plus'],
  [/\byi-|yi-?1\.5/, 'yi'],
]

export function autoTokenizerFor(model: string): ResolvedTokenizerId {
  const name = model.toLowerCase()
  for (const [pattern, id] of rules) if (pattern.test(name)) return id
  // An unrecognised model gets the bundled table rather than a multi-megabyte download it never
  // asked for. safetyMarginPct covers the drift, same as before this existed.
  return 'o200k_base'
}
