import assert from 'node:assert'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReplaceRule, TagRule } from '../../core/stores/settingsStore'
import { renderText, type RenderOpts } from './renderText.ts'
import { cutSpan, replaceSpan } from './selectionEdit.ts'
import { replaceMapped, identity, storedSpan, type SourceMap } from './sourceMap.ts'

// What the DOM's textContent would be: markup rendered, tags dropped, entities undone.
function domText(input: string, opts: RenderOpts): string {
  const html = renderToStaticMarkup(createElement(Fragment, null, ...renderText(input, opts)))
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Render `content`, select the `n`th copy of `onScreen` in the rendered text, and return the stored
 * text that selection maps back to. Also asserts the map's runs line up with the real DOM text,
 * which everything else rests on.
 */
function pick(content: string, opts: RenderOpts, onScreen: string, n = 0): string | null {
  const map: SourceMap = { runs: [], mapped: identity('') }
  renderText(content, { ...opts, map })
  const dom = domText(content, opts)
  assert.equal(map.runs.reduce((sum, r) => sum + r.len, 0), dom.length, `run lengths vs DOM for ${JSON.stringify(content)}`)
  let cum = 0
  for (const run of map.runs) {
    if (run.at >= 0) assert.equal(dom.slice(cum, cum + run.len), map.mapped.text.slice(run.at, run.at + run.len))
    cum += run.len
  }
  let at = -1
  for (let k = 0; k <= n; k++) at = dom.indexOf(onScreen, at + 1)
  assert.ok(at >= 0, `${JSON.stringify(onScreen)} not on screen in ${JSON.stringify(dom)}`)
  const span = storedSpan(map, at, at + onScreen.length)
  return span && content.slice(span.start, span.end)
}

const tag = (open: string, close: string, mode: TagRule['mode'], label = ''): TagRule =>
  ({ open, close, mode, label }) as TagRule
const replace = (find: string, to: string, regex = false): ReplaceRule =>
  ({ enabled: true, find, replace: to, regex, flags: 'g', target: 'both' }) as ReplaceRule

// Plain text and dropped markers.
assert.equal(pick('the cat sat', {}, 'cat'), 'cat')
assert.equal(pick('the **cat** sat', {}, 'cat sat'), 'cat** sat')
assert.equal(pick('a *very* good dog', {}, 'very'), 'very')
assert.equal(pick('He said "hi there" softly', {}, '"hi'), '"hi')
assert.equal(pick('see `code` here', {}, 'code'), 'code')
assert.equal(pick('```js\nlet x\n```', {}, 'let x'), 'let x')

// Repeats: the one selected, not the first in the stored text.
assert.equal(pick('cat and **cat** and cat', {}, 'cat', 2), 'cat')

// Every tag mode. A hidden block holding the same words used to steal the edit.
const hidden = [tag('<think>', '</think>', 'hide')]
const content = '<think>the cat</think>\nthe cat sat'
const map: SourceMap = { runs: [], mapped: identity('') }
renderText(content, { tagRules: hidden, map })
const dom = domText(content, { tagRules: hidden })
const span = storedSpan(map, dom.indexOf('cat'), dom.indexOf('cat') + 3)!
assert.equal(span.start, content.lastIndexOf('cat'))
assert.equal(pick('<ooc>aside</ooc>\n\nthe *cat* sat', { tagRules: [tag('<ooc>', '</ooc>', 'collapse', 'OOC')] }, 'aside'), 'aside')
assert.equal(pick('<ooc>aside</ooc>\n\nthe *cat* sat', { tagRules: [tag('<ooc>', '</ooc>', 'collapse', 'OOC')] }, 'cat'), 'cat')
// A selection that's only a collapsed block's label has nothing stored behind it.
assert.equal(pick('<ooc>aside</ooc>', { tagRules: [tag('<ooc>', '</ooc>', 'collapse', 'OOC')] }, 'OOC'), null)
assert.equal(pick('a\n\n<u>\ninner *x*\n</u>\n\nb', { tagRules: [tag('<u>', '</u>', 'unwrap')] }, 'inner x'), 'inner *x')

// Find/replace: a replaced run maps to the whole match, the rest is untouched.
assert.equal(pick('the cat sat', { replaceRules: [replace('cat', 'feline')] }, 'feline'), 'cat')
assert.equal(pick('the cat sat', { replaceRules: [replace('cat', 'feline')] }, 'lin'), 'cat')
assert.equal(pick('the cat sat', { replaceRules: [replace('cat', 'feline')] }, 'sat'), 'sat')
assert.equal(pick('the cat sat', { replaceRules: [replace('the ', '')] }, 'cat'), 'cat')
assert.equal(pick('Ann met Bob', { replaceRules: [replace('(\\w+) met (\\w+)', '$2 met $1', true)] }, 'Bob'), 'Ann met Bob')

// <state> and everything at once.
const combo = '<think>plan</think>\n*She* smiles. "cat" <ooc>note</ooc>\nThe cat sat.\n<state>mood: ok</state>'
const all: RenderOpts = {
  stripState: true,
  tagRules: [tag('<think>', '</think>', 'hide'), tag('<ooc>', '</ooc>', 'collapse', 'Note')],
  replaceRules: [replace('smiles', 'grins')],
}
assert.equal(pick(combo, all, 'grins'), 'smiles')
assert.equal(pick(combo, all, 'cat', 1), 'cat')
assert.equal(pick(combo, all, 'The cat sat.'), 'The cat sat.')
assert.equal(pick(combo, all, 'note'), 'note')

// replaceMapped agrees with String.replace on the text it produces.
for (const [text, re, to] of [
  ['aaa', /a/g, 'bb'],
  ['x1y22', /\d+/g, '[$&]'],
  ['one two', /(\w+) (\w+)/, '$2 $1 $$'],
  ['abc', /(?<l>b)/g, '<$<l>>'],
  ['abc', /x*/g, '-'],
] as [string, RegExp, string][]) {
  assert.equal(replaceMapped(identity(text), re, to).text, text.replace(re, to))
}

// Cutting tidies exactly one doubled space.
assert.equal(cutSpan('the cat sat', { start: 4, end: 7 }), 'the sat')
assert.equal(cutSpan('the cat sat down', { start: 4, end: 11 }), 'the down')
// A cut running to the end of a line takes the space before it.
assert.equal(cutSpan('the cat', { start: 4, end: 7 }), 'the')
assert.equal(cutSpan('the cat\nnext', { start: 4, end: 7 }), 'the\nnext')
// No surrounding spaces, no tidying.
assert.equal(cutSpan('"cat"', { start: 1, end: 4 }), '""')

assert.equal(replaceSpan('the cat sat', { start: 4, end: 7 }, 'dog'), 'the dog sat')
assert.equal(replaceSpan('the cat sat', { start: 4, end: 7 }, ''), 'the  sat')

// Cutting a whole middle paragraph leaves one blank line, not two stacked.
const threeParas = 'One.\n\n*Two* here.\n\nThree.'
assert.equal(cutSpan(threeParas, { start: 6, end: 17 }), 'One.\n\nThree.')
// A cut inside one line still leaves its newlines alone.
assert.equal(cutSpan('One.\n\nTwo three.', { start: 6, end: 10 }), 'One.\n\nthree.')

console.log('checkSelectionEdit ok')
