// node --experimental-strip-types src/core/prompt/checkPrefill.ts
import assert from 'node:assert'
import { defaultTemplate } from '../params/paramDef.ts'
import type { InstructTemplate } from '../params/paramDef.ts'
import {
  continueFields,
  forgetRefusedPrefill,
  markRefusedPrefill,
  prefillOf,
  rejectsPrefill,
  skipsPrefill,
} from './prefill.ts'
import { expandedPrefill, flattenPrompt } from './flattenPrompt.ts'

const withPrefill = (extra: Partial<InstructTemplate> = {}): InstructTemplate => ({
  ...defaultTemplate(),
  prefill: '<reasoning>\nDraft 1:',
  ...extra,
})

// --- the toggle ----------------------------------------------------------
assert.equal(prefillOf(withPrefill()), '<reasoning>\nDraft 1:')
// Unset counts as on: a template written before the toggle keeps sending its prefill.
assert.equal(prefillOf(withPrefill({ prefillEnabled: true })), '<reasoning>\nDraft 1:')
assert.equal(prefillOf(withPrefill({ prefillEnabled: false })), '')
assert.equal(prefillOf(defaultTemplate()), '')
assert.equal(prefillOf(undefined), '')

// --- text completions: the prefill is the tail of the prompt -------------
const history = [{ role: 'user' as const, content: 'Hi.' }]
const prompt = flattenPrompt(history, withPrefill())
assert.ok(prompt.endsWith('<reasoning>\nDraft 1:'), prompt)
assert.ok(!flattenPrompt(history, withPrefill({ prefillEnabled: false })).endsWith('Draft 1:'))

// --- macros expand once, the same way in both copies ---------------------
const named = [
  { role: 'user' as const, content: 'Hi.', name: 'Dom' },
  { role: 'assistant' as const, content: 'Hello.', name: 'Mara' },
]
const macro = withPrefill({ prefill: '{{char}} thinks:' })
assert.equal(expandedPrefill(named, macro), 'Mara thinks:')
assert.ok(flattenPrompt(named, macro).endsWith('Mara thinks:'))
// Turned off, the braces go through untouched and the two copies still match.
const raw = withPrefill({ prefill: '{{char}} thinks:', expandMacros: false })
assert.equal(expandedPrefill(named, raw), '{{char}} thinks:')
assert.ok(flattenPrompt(named, raw).endsWith('{{char}} thinks:'))

// --- chat completions: the continue fields -------------------------------
assert.deepEqual(continueFields(withPrefill()), {})
assert.deepEqual(continueFields(withPrefill({ prefillContinue: true })), {
  continue_final_message: true,
  add_generation_prompt: false,
})

// --- a backend refusing the trailing assistant turn ----------------------
assert.ok(rejectsPrefill('last message must not be an assistant message'))
assert.ok(rejectsPrefill('Unrecognized request argument: continue_final_message'))
assert.ok(rejectsPrefill("Trailing assistant turn is not allowed for this model"))
// A plain failure isn't the prefill's fault and must not turn it off.
assert.ok(!rejectsPrefill('rate limit exceeded'))
assert.ok(!rejectsPrefill('context length 8192 exceeded by 40 tokens'))

forgetRefusedPrefill()
assert.ok(!skipsPrefill('https://api.example.com/v1'))
markRefusedPrefill('https://api.example.com/v1', 'nope')
assert.ok(skipsPrefill('https://api.example.com/v1'))
// Remembered per endpoint: another connection is unaffected.
assert.ok(!skipsPrefill('http://localhost:8080/v1'))
forgetRefusedPrefill()
assert.ok(!skipsPrefill('https://api.example.com/v1'))

console.log('checkPrefill: ok')
