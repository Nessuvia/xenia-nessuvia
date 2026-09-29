// Run: node --experimental-strip-types src/core/sillytavern/checkStMacros.ts
import assert from 'node:assert'
import type { PromptBlock } from '../storage/types.ts'
import { convertComments, convertVariables, findMacros } from './stMacros.ts'
import { resolveTemplate, variableValues } from '../prompt/template.ts'

// Leading notes become info; a later one becomes a Jinja comment; {{trim}} goes.
assert.deepStrictEqual(convertComments('{{// what this does}}{{trim}}\n\nBody.\n{{// aside}}\nMore.'), {
  content: 'Body.\n{# aside #}\nMore.',
  info: 'what this does',
})
assert.deepStrictEqual(convertComments('{{//Keep toggled off}}'), { content: '', info: 'Keep toggled off' })
assert.strictEqual(convertComments('a {{// has #} in it}} b').content, 'a {{// has #} in it}} b')

// Balanced: a value holding {{user}} and a nested getvar is one macro.
assert.strictEqual(findMacros('{{setvar::t::<b>{{user}}</b> {{getvar::x::None}}}} tail', 'setvar::')[0].body, 't::<b>{{user}}</b> {{getvar::x::None}}')

let n = 0
const block = (label: string, content: string, disabled = false): PromptBlock => ({
  id: `b${++n}`, label, source: 'text', role: 'system', content, ...(disabled ? { disabled } : {}),
})
const { blocks, variables, notes } = convertVariables([
  block('Main', '{{setvar::tpl::}}{{setvar::cot::}}Rules.'),
  block('🎲 Dice Sim', 'Dice rules.\n{{setvar::tpl::<dice/>}}\n{{setvar::cot::- roll it}}'),
  block('Bonds', '{{setvar::tpl::<bonds/>}}Bond rules.', true),
  block('Template', 'Start\n  {{getvar::tpl}}\nSteps: {{getvar::cot}} done. {{getvar::nobody}}'),
  { id: 'h', label: 'Chat History', source: 'chatHistory', role: 'system', content: '' },
])
// Every text block is a checkbox named by its `when`; the bound block passes through.
assert.deepStrictEqual(variables.map((v) => [v.id, v.value]), [['main', true], ['diceSim', true], ['bonds', false], ['template', true]])
assert.deepStrictEqual(blocks.map((b) => b.when), ['main', 'diceSim', 'bonds', 'template', undefined])
assert.ok(blocks.every((b) => !b.disabled), 'off in ST is the checkbox, not the maker switch')
assert.strictEqual(blocks[0].content, 'Rules.', 'empty setvars are resets and go')
assert.strictEqual(blocks[1].content, 'Dice rules.')
assert.ok(notes.some((x) => x.includes('{{getvar::nobody}}')))

const render = (values: Record<string, boolean>) =>
  resolveTemplate(blocks[3].content, {}, variableValues(variables.map((v) => ({ ...v, value: values[v.id] ?? true } as typeof v))))
assert.strictEqual(render({ diceSim: true, bonds: false }), 'Start\n  <dice/>\nSteps: - roll it done. {{getvar::nobody}}')
assert.strictEqual(render({ diceSim: true, bonds: true }), 'Start\n  <bonds/>\nSteps: - roll it done. {{getvar::nobody}}', 'the later setter wins, as in ST')
assert.strictEqual(render({ diceSim: false, bonds: false }), 'Start\nSteps:  done. {{getvar::nobody}}')
