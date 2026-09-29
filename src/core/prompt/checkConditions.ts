// Run: node --experimental-strip-types src/core/prompt/checkConditions.ts
import assert from 'node:assert'
import type { PromptBlock } from '../storage/types.ts'
import { applyConditions, conditionHolds, conditionProblem } from './template.ts'

const flags = { dndsim: true, cot: 'MAX', words: 120, narrator: false }
assert.ok(conditionHolds(undefined, flags))
assert.ok(conditionHolds('  ', flags))
assert.ok(conditionHolds('dndSim', flags), 'names fold to lowercase')
assert.ok(conditionHolds('cot = max', flags))
assert.ok(!conditionHolds('cot = BOLT', flags))
assert.ok(conditionHolds('words >= 100', flags))
assert.ok(conditionHolds('not narrator', flags))
assert.ok(!conditionHolds('unknown', flags))
assert.ok(!conditionHolds('cot = ', flags), 'malformed is false')

const b = (id: string, when?: string, children?: PromptBlock[]): PromptBlock => ({
  id, label: id, source: 'text', role: 'system', content: id, ...(when ? { when } : {}), ...(children ? { children } : {}),
})
const out = applyConditions([b('a', 'dndSim'), b('b', 'cot = BOLT', [b('c')]), b('d', undefined, [b('e', 'narrator')])], flags)
assert.deepStrictEqual(out.map((x) => !!x.disabled), [false, true, false])
assert.strictEqual(out[1].children![0].disabled, undefined, 'a failed parent carries its children out; they stay untouched')
assert.strictEqual(out[2].children![0].disabled, true, 'nested conditions apply')

const vars = [{ id: 'dndSim', label: 'd', kind: 'checkbox' as const, value: true }, { id: 'words', label: 'w', kind: 'sliderRange' as const, min: 0, max: 9, step: 1, value: [1, 2] as [number, number] }]
assert.strictEqual(conditionProblem('dndSim', vars), '')
assert.strictEqual(conditionProblem('words_start > 1', vars), '')
assert.strictEqual(conditionProblem('narrator', vars), '')
assert.ok(conditionProblem('dndsimm', vars).includes('dndsimm'))
assert.ok(conditionProblem('= x', vars).startsWith('Not a condition'))
