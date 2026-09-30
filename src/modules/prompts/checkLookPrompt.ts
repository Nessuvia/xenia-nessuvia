import assert from 'node:assert/strict'
import { parseLookReply } from './lookPrompt.ts'

assert.deepEqual(parseLookReply('Here:\n```json\n{"html":"<div data-var=\\"a\\"></div>","css":"","hideUnplaced":true}\n```'), {
  html: '<div data-var="a"></div>',
  css: '',
  hideUnplaced: true,
})
// hideUnplaced only when literally true; css defaults to empty.
assert.deepEqual(parseLookReply('{"html":"<p></p>","hideUnplaced":"yes"}'), { html: '<p></p>', css: '' })
assert.throws(() => parseLookReply('{"css":"x"}'), /no html/)
assert.throws(() => parseLookReply('no json'), /no JSON/)
