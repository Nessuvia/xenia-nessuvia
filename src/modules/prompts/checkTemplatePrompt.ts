import assert from 'node:assert/strict'
import { buildTemplateMessages, parseTemplateReply } from './templatePrompt.ts'
import { xeniaPrompt } from '../../core/prompt/xeniaPrompts.ts'

assert.deepEqual(parseTemplateReply('Just talk.'), { text: 'Just talk.' })
// The last block wins; the prose keeps everything else.
assert.deepEqual(parseTemplateReply('Try this:\n```template\nold\n```\nor:\n```template\n{% if a %}x{% endif %}\n```\nDone.'), {
  text: 'Try this:\n```template\nold\n```\nor:\n\nDone.',
  template: '{% if a %}x{% endif %}',
})
// Other fences are left alone.
assert.deepEqual(parseTemplateReply('```js\nx\n```'), { text: '```js\nx\n```' })

const messages = buildTemplateMessages('sys', [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }], 'combine?', 'T')
assert.equal(messages.length, 4)
assert.equal(messages[3].content, '<template_under_review>\nT\n</template_under_review>\n\ncombine?')

assert.equal(xeniaPrompt('stackAsk', { stackAsk: 'mine' }), 'mine')
assert.ok(xeniaPrompt('stackAsk', { stackAsk: '  ' }).startsWith('You help'))
