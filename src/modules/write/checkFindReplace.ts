// Run: node --experimental-strip-types src/modules/write/checkFindReplace.ts
import assert from 'node:assert'
import type { ReplaceRule } from '../../core/stores/settingsStore.ts'
import { findAll, ruleMatches } from './findReplace.ts'

assert.deepStrictEqual(findAll('<reader> met <Reader>.', '<reader>', true), [0])
assert.deepStrictEqual(findAll('<reader> met <Reader>.', '<reader>', false), [0, 13])
// Never overlapping: "aaa" holds one "aa", not two.
assert.deepStrictEqual(findAll('aaa', 'aa', true), [0])
// Literal, not a pattern.
assert.deepStrictEqual(findAll('a.b a*b', '*', true), [5])
assert.deepStrictEqual(findAll('text', '', true), [])

// Rule matches: literal and regex with captures, overlaps skipped, prompt-only and disabled ignored.
{
  const rule = (over: Partial<ReplaceRule>): ReplaceRule => ({
    id: 'r',
    find: '',
    replace: '',
    regex: false,
    flags: 'g',
    target: 'both',
    enabled: true,
    ...over,
  })
  const text = '<reader> and <reader>, Mr Smith.'
  assert.deepStrictEqual(
    ruleMatches(text, [
      rule({ find: '<reader>', replace: 'Dom' }),
      rule({ find: '(Mr) (\\w+)', replace: '$2, $1', regex: true }),
      rule({ find: 'reader', replace: 'X' }),
      rule({ find: 'and', replace: '&', applies: 'prompt' }),
      rule({ find: 'Smith', replace: 'Z', enabled: false }),
      rule({ find: '(', regex: true }),
    ]),
    [
      { from: 0, to: 8, insert: 'Dom' },
      { from: 13, to: 21, insert: 'Dom' },
      { from: 23, to: 31, insert: 'Smith, Mr' },
    ],
  )
}

console.log('checkFindReplace ok')
