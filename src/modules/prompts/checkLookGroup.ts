import assert from 'node:assert/strict'
import { groupIds, groupPick, groupWrite } from './lookGroup.ts'

const ids = groupIds(' a, b ,,c')
assert.deepEqual(ids, ['a', 'b', 'c'])
assert.equal(groupPick(ids, { a: false, b: true, c: true }), 'b')
assert.equal(groupPick(ids, { a: false }), '')
assert.deepEqual(groupWrite(ids, 'c'), { a: false, b: false, c: true })
assert.deepEqual(groupWrite(ids, ''), { a: false, b: false, c: false })
