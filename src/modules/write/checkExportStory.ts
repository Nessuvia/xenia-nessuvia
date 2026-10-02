// Run: node --experimental-strip-types src/modules/write/checkExportStory.ts
import assert from 'node:assert'
import type { Story } from '../../core/storage/types.ts'
import { resolvePalette } from '../../core/palette/palette.ts'
import { buildHtml, buildTxt, escapeHtml, proseHtml } from './exportStory.ts'

const story = (text: string): Story => ({
  id: 1,
  ownerId: 'local',
  title: 'My <b>Story</b>',
  cover: '',
  cast: [],
  text,
  premise: '',
  ending: '',
  beats: [],
  note: '',
  createdAt: 0,
  updatedAt: 0,
})

const doc = '# First\n\nabc *soft*\n\n\n"def"\n# Second\nghi'

// TXT: numbered headings, inline markers gone, quote marks kept.
assert.equal(buildTxt(story(doc)), 'My <b>Story</b>\n\n1 - First\n\nabc soft\n\n\n"def"\n2 - Second\nghi\n')

// Escaping: prose and title alike are model output opened in a browser.
assert.equal(escapeHtml('<script>"&"</script>'), '&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;')
assert.equal(proseHtml('a <b> c'), 'a &lt;b&gt; c')

// Markers become real elements; backtick contents stay literal.
assert.equal(proseHtml('**loud**'), '<strong>loud</strong>')
assert.equal(proseHtml('*soft*'), '<em>soft</em>')
assert.equal(proseHtml('***both***'), '<strong><em>both</em></strong>')
assert.equal(proseHtml('"said"'), '<q>said</q>')
assert.equal(proseHtml('`**raw**`'), '<code>**raw**</code>')
// An unmatched marker stays text rather than swallowing the rest.
assert.equal(proseHtml('half *open'), 'half *open')

const html = buildHtml(story(doc), resolvePalette())
assert.ok(html.startsWith('<!doctype html>'))
assert.ok(html.includes('<title>My &lt;b&gt;Story&lt;/b&gt;</title>'))
assert.ok(!html.includes('<b>Story</b>'))
// A heading with no blank line before or after it still splits the paragraph.
assert.ok(html.includes('<p><q>def</q></p>\n<h2 id="ch2">2 - Second</h2>\n<p>ghi</p>'))
assert.ok(html.includes('<nav><a href="#ch1" title="First">1</a><a href="#ch2" title="Second">2</a></nav>'))
// Blank runs are dropped, not emitted as empty paragraphs.
assert.equal(html.match(/<p>/g)?.length, 3)

console.log('checkExportStory ok')
