// Which find/replace rules the Convert modal offers as tags. Run: node --experimental-strip-types
import assert from 'node:assert/strict'
import { tagFromRule } from './textRules.ts'
import type { ReplaceRule } from '../stores/settingsStore.ts'

const rule = (find: string, replace: string, extra: Partial<ReplaceRule> = {}): ReplaceRule => ({
  id: 'r', find, replace, regex: true, flags: 'g', target: 'both', enabled: true, ...extra,
})
const mode = (r: ReplaceRule) => tagFromRule(r, [])?.tag.mode ?? null

assert.equal(mode(rule(String.raw`<think>[\s\S]*?<\/think>`, '')), 'hide')
assert.equal(mode(rule(String.raw`<think>[\s\S]*?</think>\s*`, '')), 'hide')
assert.equal(mode(rule(String.raw`<ooc>([\s\S]*?)<\/ooc>`, '$1')), 'unwrap')
assert.equal(mode(rule('<ooc>(.*?)</ooc>', '$1', { flags: 'gs' })), 'unwrap')
const collapse = tagFromRule(rule(String.raw`<note>([\s\S]*?)<\/note>`, '<details><summary><b>Notes</b></summary>$1</details>', { target: 'assistant' }), [])
assert.deepEqual(collapse?.tag, { open: '<note>', close: '</note>', mode: 'collapse', label: 'Notes', target: 'assistant' })

// Near-misses stay find/replace.
assert.equal(mode(rule('<ooc>(.*?)</ooc>', '$1')), null, '. without s stops at a newline')
assert.equal(mode(rule(String.raw`<think>[\s\S]*<\/think>`, '')), null, 'greedy body')
assert.equal(mode(rule(String.raw`<a>[\s\S]*?<\/b>`, '')), null, 'mismatched names')
assert.equal(mode(rule(String.raw`^<think>[\s\S]*?<\/think>`, '')), null, 'anchor')
assert.equal(mode(rule(String.raw`<think>[\s\S]*?<\/think>|<x>`, '')), null, 'alternation')
assert.equal(mode(rule(String.raw`<ooc>[\s\S]*?<\/ooc>`, '$1')), null, '$1 with no capture')
assert.equal(mode(rule(String.raw`<ooc>([\s\S]*?)<\/ooc>`, '[$1]')), null, 'replacement adds text')
assert.equal(mode(rule(String.raw`<think>[\s\S]*?<\/think>`, '', { enabled: false })), null, 'off')
assert.equal(mode(rule(String.raw`<think>[\s\S]*?<\/think>`, '', { applies: 'both' })), null, 'touches the prompt')
assert.equal(mode(rule('<think></think>', '', { regex: false })), null, 'literal')

// An existing tag with the same markers covers the rule.
assert.equal(tagFromRule(rule(String.raw`<think>[\s\S]*?<\/think>`, ''), [{ id: 't', open: '<think>', close: '</think>', mode: 'collapse' }])?.covered, true)
