// Run: node --experimental-strip-types src/modules/chat/checkRenderText.ts
import assert from 'node:assert'
import { Fragment } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { renderText } from './renderText.ts'

const el = (n: ReactNode) => n as ReactElement<{ children?: ReactNode; className?: string }>
const tags = (nodes: ReactNode[]) =>
  nodes.filter((n) => typeof n === 'object' && n !== null).map((n) => el(n).type)

// *a* -> one em, **a** -> one strong (not nested ems)
const italic = renderText('*a*')
assert.deepStrictEqual(tags(italic), ['em'])
assert.strictEqual(el(italic[0]).props.children, 'a')

const bold = renderText('**a**')
assert.deepStrictEqual(tags(bold), ['strong'])
assert.strictEqual(el(bold[0]).props.children, 'a')

// underscore forms
assert.deepStrictEqual(tags(renderText('_a_')), ['em'])
assert.deepStrictEqual(tags(renderText('__a__')), ['strong'])

// *** and ___ nest bold+italic: <strong><em>a</em></strong>
const boldItalic = renderText('***a***')
assert.deepStrictEqual(tags(boldItalic), ['strong'])
const bikids = [el(boldItalic[0]).props.children].flat() as ReactNode[]
assert.deepStrictEqual(tags(bikids), ['em'])
assert.strictEqual(el(bikids[0]).props.children, 'a')
assert.deepStrictEqual(tags(renderText('___a___')), ['strong'])

// surrounding text is kept, in order
const mixed = renderText('say *hi* now')
assert.deepStrictEqual(mixed[0], 'say ')
assert.deepStrictEqual(tags(mixed), ['em'])
assert.deepStrictEqual(mixed[2], ' now')

// unmatched marker is literal
assert.deepStrictEqual(renderText('2 * 3 = 6'), ['2 * 3 = 6'])
assert.deepStrictEqual(renderText('*dangling'), ['*dangling'])

// untrusted input stays literal text: no element is created for it
const script = '<script>alert(1)</script>'
const rendered = renderText(script)
assert.deepStrictEqual(rendered, [script])
assert.deepStrictEqual(tags(rendered), [])

// newlines survive into the text nodes
assert.deepStrictEqual(renderText('a\n\nb'), ['a\n\nb'])
const overLines = renderText('a\n*b*\nc')
assert.deepStrictEqual(overLines[0], 'a\n')
assert.deepStrictEqual(overLines[2], '\nc')

// quoted speech becomes a span, and nests with emphasis
const spoken = renderText('he said "hi *there*" then left')
assert.deepStrictEqual(tags(spoken), ['span'])
assert.strictEqual(spoken[0], 'he said ')
assert.strictEqual(el(spoken[1]).props.className, 'spokenText')
assert.deepStrictEqual(tags(el(spoken[1]).props.children as ReactNode[]), ['em'])
assert.strictEqual(el(renderText('*a*')[0]).props.className, 'emphasisText')
// a lone quote stays literal
assert.deepStrictEqual(renderText('5" of rain'), ['5" of rain'])

// the quote marks stay visible around the content, and a trailing nested em keeps its element
// (regression: string-concatenating children stringified the em to "[object Object]")
const trailing = renderText('"ask first, *mrryh~!*"')
const quoteKids = el(trailing[0]).props.children as ReactNode[]
assert.strictEqual(quoteKids[0], '"')
assert.strictEqual(quoteKids[quoteKids.length - 1], '"')
assert.deepStrictEqual(tags(quoteKids), ['em'])
assert.ok(!JSON.stringify(quoteKids).includes('[object Object]'))

// --- color precedence ---
// Rank is top-first. The outermost quote span always outranks the text baseline: it paints its
// own color either way. The interesting element is the *emphasis* nested inside it. With quotes
// above emphasis the inner em defers (style.color: 'inherit') to the winning quote; flip the order
// and the inner em wins and paints its own color. The winner never carries an inherit style.
const style = (n: ReactNode | undefined) => (n && el(n).props.style) as { color?: string } | undefined
const nestedEm = (span: ReactNode) =>
  (el(span).props.children as ReactNode[]).find((n) => typeof n === 'object' && n !== null)

const quotesTop = renderText('"hi *there*"', { order: ['quotes', 'bold', 'emphasis'] })
assert.strictEqual(el(quotesTop[0]).props.className, 'spokenText')
assert.strictEqual(style(quotesTop[0])?.color, undefined) // quote wins vs text baseline
assert.strictEqual(style(nestedEm(quotesTop[0]))?.color, 'inherit') // emphasis defers to the quote

const emphasisTop = renderText('"hi *there*"', { order: ['emphasis', 'bold', 'quotes'] })
assert.strictEqual(style(nestedEm(emphasisTop[0]))?.color, undefined) // emphasis outranks the quote

// --- tag rules ---
// createElement collapses a lone child: text runs come back either bare or as an array.
const kids = (n: ReactNode): ReactNode[] => {
  const c = el(n).props.children
  return Array.isArray(c) ? c : [c]
}

const think = [{ id: '1', open: '<think>', close: '</think>', mode: 'collapse' as const }]
const hide = [{ id: '1', open: '<think>', close: '</think>', mode: 'hide' as const }]

// collapse wraps the inner text in <details>, and surrounding text survives in order
const collapsed = renderText('before<think>secret</think>after', { tagRules: think })
assert.deepStrictEqual(tags(collapsed), [Fragment, 'details', Fragment])
const details = el(collapsed[1]).props.children as ReactNode[]
assert.strictEqual(el(details[0]).type, 'summary')
assert.strictEqual(el(details[0]).props.children, '<think>')
assert.strictEqual(details[1], 'secret')

// hide drops the block but keeps the rest
const hidden = renderText('before<think>secret</think>after', { tagRules: hide })
assert.deepStrictEqual(tags(hidden), [Fragment, Fragment])
assert.deepStrictEqual(kids(hidden[0]), ['before'])
assert.deepStrictEqual(kids(hidden[1]), ['after'])

// an unclosed opener is literal text; nothing after it gets swallowed
const unclosed = renderText('a<think>b', { tagRules: hide })
assert.deepStrictEqual(tags(unclosed), [Fragment])
assert.deepStrictEqual(kids(unclosed[0]), ['a<think>b'])

// bracket-style delimiters work the same way
const bracket = [{ id: '1', open: '[h]', close: '[/h]', mode: 'hide' as const }]
assert.deepStrictEqual(tags(renderText('x[h]y[/h]z', { tagRules: bracket })), [Fragment, Fragment])

// two blocks in one message
const twice = renderText('<think>a</think>mid<think>b</think>', { tagRules: hide })
assert.deepStrictEqual(kids(twice[0]), ['mid'])

// newlines directly touching blocks are trimmed: back-to-back blocks don't stack blank space
const spaced = renderText('<think>a</think>\n\n<think>b</think>\n\ntail', { tagRules: think })
assert.deepStrictEqual(tags(spaced), ['details', 'details', Fragment])
assert.deepStrictEqual(kids(spaced[2]), ['tail'])

// an empty or half-filled rule is ignored, leaving the text alone
assert.deepStrictEqual(renderText('plain', { tagRules: [{ id: '1', open: '<a>', close: '', mode: 'hide' }] }), [
  'plain',
])
assert.deepStrictEqual(renderText('plain', { tagRules: [] }), ['plain'])

// the source string is never mutated by rendering
const source = 'keep **this** exactly *as* typed\nwith\nnewlines'
const before = String(source)
renderText(source)
assert.strictEqual(source, before)

// --- replace rules ---
const rule = (p: Partial<import('../../core/stores/settingsStore').ReplaceRule>) => ({
  id: '1',
  find: '',
  replace: '',
  regex: false,
  flags: 'g',
  target: 'both' as const,
  enabled: true,
  ...p,
})

// literal replace runs before the inline parser: the result is plain text
assert.deepStrictEqual(
  renderText('hello world', { replaceRules: [rule({ find: 'world', replace: 'there' })] }),
  ['hello there'],
)

// literal `find` is escaped: `.` matches only a literal dot
assert.deepStrictEqual(
  renderText('a.b axb', { replaceRules: [rule({ find: 'a.b', replace: 'X' })] }),
  ['X axb'],
)

// regex with a $1 capture ref
assert.deepStrictEqual(
  renderText('2026-08-14', {
    replaceRules: [rule({ regex: true, find: '(\\d{4})-(\\d{2})-(\\d{2})', replace: '$3/$2/$1' })],
  }),
  ['14/08/2026'],
)

// target gates by role: an assistant-only rule leaves a user message untouched
assert.deepStrictEqual(
  renderText('hi', { replaceRules: [rule({ find: 'hi', replace: 'yo', target: 'assistant' })], role: 'user' }),
  ['hi'],
)
assert.deepStrictEqual(
  renderText('hi', { replaceRules: [rule({ find: 'hi', replace: 'yo', target: 'assistant' })], role: 'assistant' }),
  ['yo'],
)

// disabled rule does nothing
assert.deepStrictEqual(
  renderText('hi', { replaceRules: [rule({ find: 'hi', replace: 'yo', enabled: false })] }),
  ['hi'],
)

// invalid regex is skipped, and a later valid rule still applies
assert.deepStrictEqual(
  renderText('hi', {
    replaceRules: [rule({ regex: true, find: '(' }), rule({ find: 'hi', replace: 'yo' })],
  }),
  ['yo'],
)

// replacement feeds the inline parser: inserting **bold** yields a strong element
const injected = renderText('name', { replaceRules: [rule({ find: 'name', replace: '**Nessu**' })] })
assert.deepStrictEqual(tags(injected), ['strong'])



// `code`: one <code>, content literal (the * stays an asterisk rather than becoming <em>)
const inlineCode = renderText('a `x*y*z` b')
assert.deepStrictEqual(tags(inlineCode), ['code'])
assert.deepStrictEqual((inlineCode[1] as any).props.children, 'x*y*z')

// fenced block: <pre><code>, language line dropped, hugging newlines trimmed
const fenced = renderText('see:\n```js\nlet a = 1\n```\ndone')
assert.deepStrictEqual(tags(fenced), ['pre'])
assert.deepStrictEqual((fenced[1] as any).props.children.props.children, 'let a = 1')

// a fence is matched before the single backtick: ``` doesn't parse as an empty code span
assert.deepStrictEqual(tags(renderText('```\na\n```')), ['pre'])

// unmatched backtick stays literal
assert.deepStrictEqual(renderText('a ` b'), ['a ` b'])

console.log('ok')
