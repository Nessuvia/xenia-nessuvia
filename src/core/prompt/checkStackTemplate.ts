// Run: node --experimental-strip-types src/core/prompt/checkStackTemplate.ts
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import {
  stackParts,
  stackVariables,
  templateBody,
  templateProblems,
  templateVariables,
  usesSlot,
  withValue,
} from './stackTemplate.ts'
import { variableValues } from './template.ts'

// --- declarations ----------------------------------------------------------
{
  const { variables, problems } = templateVariables(
    [
      '{% var length slider 10 400 10 = 110 label="Length" %}',
      '{% var span range 0 100 5 = 10 40 %}',
      '{% var mood dropdown calm|angry = angry info="How they feel" %}',
      '{% var dnd checkbox = true %}',
      '{% var goal text = "find the key" %}',
      '{% var hit dice = 2d6 %}',
      '{% var banned list = "ozone| breath hitching" sep="; " %}',
      '{% var lines list sep="\\n" %}',
      '{# {% var ghost checkbox %} #}',
    ].join('\n'),
  )
  assert.deepStrictEqual(problems, [])
  assert.deepStrictEqual(variables, [
    { id: 'length', label: 'Length', kind: 'sliderSingle', min: 10, max: 400, step: 10, value: 110 },
    { id: 'span', label: 'span', kind: 'sliderRange', min: 0, max: 100, step: 5, value: [10, 40] },
    { id: 'mood', label: 'mood', info: 'How they feel', kind: 'dropdown', options: ['calm', 'angry'], value: 'angry' },
    { id: 'dnd', label: 'dnd', kind: 'checkbox', value: true },
    { id: 'goal', label: 'goal', kind: 'text', value: 'find the key' },
    { id: 'hit', label: 'hit', kind: 'dice', value: '2d6' },
    { id: 'banned', label: 'banned', kind: 'list', sep: '; ', value: 'ozone\nbreath hitching' },
    { id: 'lines', label: 'lines', kind: 'list', sep: '\n', value: '' },
  ])
  assert.deepStrictEqual(variableValues(variables.slice(6)), { banned: 'ozone; breath hitching', lines: '' })
}

// A `%` inside an attribute doesn't end the tag, and the declaration leaves the body.
{
  const tpl = '{% var lean checkbox = true info="34% smaller" %}\nText.'
  assert.strictEqual(templateVariables(tpl).variables[0]?.info, '34% smaller')
  assert.strictEqual(templateBody(tpl), 'Text.')
}

// Bad declarations are reported by line; a duplicate keeps the first.
{
  const { variables, problems } = templateVariables(
    '{% var a slider = x %}\n{% var b nope %}\n{% var c checkbox %}\n{% var C checkbox %}\n{% var d dropdown x|y = z %}',
  )
  assert.deepStrictEqual(variables.map((v) => v.id), ['c'])
  assert.deepStrictEqual(problems.map((p) => p.line), [1, 2, 4, 5])
}

// --- values ----------------------------------------------------------------
{
  const stack = { template: '{% var n slider 0 10 = 3 %}\n{% var m dropdown a|b %}', values: { n: 7, m: 'gone' } }
  // A stored value that no longer fits its declaration falls back to the default.
  assert.deepStrictEqual(stackVariables(stack).map((v) => v.value), [7, 'a'])
  const full = { ownerId: 'local', name: 's', ...stack }
  const next = withValue(full, { ...stackVariables(stack)[1], value: 'b' } as never)
  assert.deepStrictEqual(next.values, { n: 7, m: 'b' })
}

// --- parts -----------------------------------------------------------------
{
  const body = templateBody(
    [
      '{% var x checkbox %}',
      'System text.',
      '{# a note #}',
      '{{ history }}',
      '{% depth 2 %}',
      'Note.',
      '{% enddepth %}',
      '{% message user %}',
      'Go.',
      '{% endmessage %}',
      'Back to system.',
    ].join('\n'),
  )
  assert.deepStrictEqual(stackParts(body), [
    { kind: 'text', role: 'system', depth: undefined, text: 'System text.' },
    { kind: 'history' },
    { kind: 'text', role: 'system', depth: 2, text: 'Note.' },
    { kind: 'text', role: 'user', depth: undefined, text: 'Go.' },
    { kind: 'text', role: 'system', depth: undefined, text: 'Back to system.' },
  ])
  // Forgiving at send time: a stray closer is dropped, an unclosed opener runs to the end.
  assert.deepStrictEqual(stackParts('a{% endmessage %}{% message assistant %}b'), [
    { kind: 'text', role: 'system', depth: undefined, text: 'a' },
    { kind: 'text', role: 'assistant', depth: undefined, text: 'b' },
  ])
}

// --- problems --------------------------------------------------------------
{
  assert.deepStrictEqual(templateProblems('{{ history }}', 'chat'), [])
  assert.deepStrictEqual(templateProblems('{{history}}', 'chat'), [], 'spaces are optional')
  const msgs = (t: string, kind: 'chat' | 'story' = 'chat') => templateProblems(t, kind).map((p) => p.message)
  assert.ok(msgs('text')[0].includes('{{ history }}'))
  assert.ok(msgs('{{ history }}\n{{ history }}')[0].startsWith('Only one'))
  assert.ok(msgs('{% message user %}{{ history }}{% endmessage %}')[0].includes("can't sit inside"))
  assert.ok(msgs('{{ history }}\n{% message bot %}x{% endmessage %}')[0].includes('user, assistant or system'))
  assert.ok(msgs('{{ history }}\n{% depth 2 %}x')[0].includes('never closed'))
  assert.ok(msgs('{{ history }}\n{% enddepth %}')[0].includes('nothing to close'))
  assert.ok(msgs('{{ history }}\n{% depth 1 %}{% message user %}x{% enddepth %}{% endmessage %}').length > 0, 'crossed tags')
  assert.deepStrictEqual(msgs('{{ storyContext }}', 'story'), [])
  assert.ok(msgs('{{ storyContext }}\n{{ history }}', 'story')[0].includes('no chat history'))
  assert.ok(msgs('prose', 'story')[0].includes('storyContext'))
  // A commented-out tag is not a tag.
  assert.deepStrictEqual(templateProblems('{{ history }}\n{# {% depth 2 %} #}', 'chat'), [])
}

// --- slots -----------------------------------------------------------------
assert.ok(usesSlot('x {{ worldInfoAfter }}', 'worldInfoAfter'))
assert.ok(usesSlot('{% systemPrompt %}fallback{% endsystemPrompt %}', 'systemPrompt'))
assert.ok(!usesSlot('{# {{ worldInfoAfter }} #}', 'worldInfoAfter'))

// --- the bundled stacks parse clean ----------------------------------------
for (const file of ['xeniaChatStack.json', 'defaultStoryStack.json']) {
  const stack = JSON.parse(readFileSync(`src/modules/prompts/${file}`, 'utf8'))
  assert.deepStrictEqual(templateProblems(stack.template, stack.kind), [], file)
}

console.log('ok')
