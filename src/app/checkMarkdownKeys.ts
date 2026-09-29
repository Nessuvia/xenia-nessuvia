import assert from 'node:assert'
import { markdownMarker, wrapSelection } from './markdownKeys.ts'

const k = (key: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods,
})
assert.equal(markdownMarker(k('b', { ctrlKey: true })), '**')
assert.equal(markdownMarker(k('B', { ctrlKey: true })), '**')
assert.equal(markdownMarker(k('b')), null)
assert.equal(markdownMarker(k('x', { ctrlKey: true })), null)
assert.equal(markdownMarker(k('X', { ctrlKey: true, shiftKey: true })), '~~')
assert.equal(markdownMarker(k('b', { ctrlKey: true, shiftKey: true })), null)
assert.deepEqual(wrapSelection('say hi now', 4, 6, '**'), { text: 'say **hi** now', start: 6, end: 8 })
assert.deepEqual(wrapSelection('ab', 1, 1, '`'), { text: 'a``b', start: 2, end: 2 })
