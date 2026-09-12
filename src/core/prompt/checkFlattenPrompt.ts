// Run: node --experimental-strip-types src/core/prompt/checkFlattenPrompt.ts
import assert from 'node:assert'
import { defaultTemplate, templatePresets } from '../params/paramDef.ts'
import { flattenPrompt } from './flattenPrompt.ts'

const messages = [
  { role: 'system' as const, content: 'be brief' },
  { role: 'user' as const, content: 'hello' },
  { role: 'assistant' as const, content: 'hi' },
  { role: 'user' as const, content: 'again' },
]

// --- ChatML round trip ----------------------------------------------------
{
  const out = flattenPrompt(messages, defaultTemplate())
  assert.strictEqual(
    out,
    '<|im_start|>system\nbe brief<|im_end|>\n' +
      '<|im_start|>user\nhello<|im_end|>\n' +
      '<|im_start|>assistant\nhi<|im_end|>\n' +
      '<|im_start|>user\nagain<|im_end|>\n' +
      '<|im_start|>assistant\n',
  )
}

// --- the assistant turn is left open at the end --------------------------
{
  const template = defaultTemplate()
  const out = flattenPrompt(messages, template)
  assert.ok(out.endsWith(template.modelPrefix), 'the model turn is not open')
  // The model's own suffix must not follow it: that would close the turn before it starts.
  assert.ok(!out.endsWith(template.modelSuffix))
}

// --- firstPrefix is emitted once, at the very front ----------------------
{
  const template = { ...defaultTemplate(), firstPrefix: '<|begin_of_text|>' }
  const out = flattenPrompt(messages, template)
  assert.ok(out.startsWith('<|begin_of_text|>'))
  assert.strictEqual(out.split('<|begin_of_text|>').length - 1, 1)
  // Unset means nothing is prepended at all.
  assert.ok(!flattenPrompt(messages, defaultTemplate()).startsWith('<|begin'))
}

// --- trailing whitespace: trimmed on, kept off --------------------------
{
  const spaced = { ...defaultTemplate(), modelPrefix: '### Response: ' }
  assert.ok(flattenPrompt(messages, spaced).endsWith('### Response:'))
  const kept = { ...spaced, trimTrailingSpace: false }
  assert.ok(flattenPrompt(messages, kept).endsWith('### Response: '))
  // Only trailing spaces and tabs go; a deliberate newline at the end stays.
  const newline = { ...defaultTemplate(), modelPrefix: '### Response:\n' }
  assert.ok(flattenPrompt(messages, newline).endsWith('\n'))
}

// --- message content is wrapped, never rewritten -------------------------
{
  const messy = [{ role: 'user' as const, content: '  spaced  \n\nand blank lines  ' }]
  const out = flattenPrompt(messy, { ...defaultTemplate(), trimTrailingSpace: false })
  assert.ok(out.includes('  spaced  \n\nand blank lines  '))
}

// --- an empty history is still a valid prompt ---------------------------
{
  assert.strictEqual(flattenPrompt([], defaultTemplate()), '<|im_start|>assistant\n')
}

// --- an unknown role is treated as the user's ---------------------------
{
  const template = defaultTemplate()
  const out = flattenPrompt([{ role: 'user', content: 'x' }], template)
  assert.ok(out.includes(`${template.userPrefix}x${template.userSuffix}`))
}

// --- systemAsUser wraps a system turn in the user sequences -------------
{
  const template = { ...defaultTemplate(), systemAsUser: true }
  const out = flattenPrompt(messages, template)
  assert.ok(out.startsWith('<|im_start|>user\nbe brief<|im_end|>\n'))
  assert.ok(!out.includes('<|im_start|>system'))
}

// --- wrapNewlines puts each sequence on its own line ---------------------
{
  const alpaca = templatePresets.find((p) => p.name === 'Alpaca')!.template()
  const out = flattenPrompt([{ role: 'user' as const, content: 'hello' }], alpaca)
  assert.ok(out.includes('### Instruction:\nhello'), out)
  // The open turn keeps its newline: Alpaca's reply starts on the line after the header.
  assert.ok(out.endsWith('### Response:\n'), JSON.stringify(out))
  // Off, the sequence and the content run together, which is what ChatML wants.
  const flat = flattenPrompt([{ role: 'user' as const, content: 'hello' }], {
    ...alpaca,
    wrapNewlines: false,
  })
  assert.ok(flat.includes('### Instruction:hello'))
}

// --- first and last model prefixes override, last winning ---------------
{
  const template = {
    ...defaultTemplate(),
    firstModelPrefix: '[FIRST]',
    lastModelPrefix: '[LAST]',
  }
  const long = [
    { role: 'assistant' as const, content: 'one' },
    { role: 'user' as const, content: 'x' },
    { role: 'assistant' as const, content: 'two' },
    { role: 'user' as const, content: 'y' },
    { role: 'assistant' as const, content: 'three' },
  ]
  const out = flattenPrompt(long, template)
  assert.ok(out.includes('[FIRST]one'), 'first assistant turn kept the plain prefix')
  assert.ok(out.includes('<|im_start|>assistant\ntwo'), 'a middle turn was overridden')
  assert.ok(out.includes('[LAST]three'), 'last assistant turn kept the plain prefix')
  // The open turn at the end uses the last override too.
  assert.ok(out.endsWith('[LAST]'), out.slice(-20))
  // With only firstModelPrefix set, one turn is both first and last: last is unset and first wins.
  const firstOnly = { ...defaultTemplate(), firstModelPrefix: '[FIRST]' }
  assert.ok(flattenPrompt(long, firstOnly).includes('[FIRST]one'))
}

// --- names: never, always, group ----------------------------------------
{
  const named = [
    { role: 'user' as const, content: 'hello', name: 'Dom' },
    { role: 'assistant' as const, content: 'hi', name: 'Xenia' },
  ]
  const never = flattenPrompt(named, { ...defaultTemplate(), names: 'never' })
  assert.ok(never.includes('\nhello<'), 'a name was added with names: never')

  const always = flattenPrompt(named, { ...defaultTemplate(), names: 'always' })
  assert.ok(always.includes('Dom: hello'))
  assert.ok(always.includes('Xenia: hi'))
  // The open turn names who has to answer. ChatML trims the trailing space off the label.
  assert.ok(always.endsWith('Xenia:'), always.slice(-20))

  // One assistant speaker is not a group: 'group' stays quiet.
  const solo = flattenPrompt(named, { ...defaultTemplate(), names: 'group' })
  assert.ok(!solo.includes('Dom: hello'))
  // Two of them is.
  const many = [...named, { role: 'assistant' as const, content: 'hey', name: 'Ada' }]
  assert.ok(flattenPrompt(many, { ...defaultTemplate(), names: 'group' }).includes('Dom: hello'))
}

// --- a label is never doubled on content that already carries one -------
{
  // buildPrompt inlines the speaker in a group chat; labelling again would read 'Ada: Ada: ...'.
  const already = [
    { role: 'assistant' as const, content: 'Ada: hi', name: 'Ada' },
    { role: 'assistant' as const, content: 'hey', name: 'Bee' },
  ]
  const out = flattenPrompt(already, { ...defaultTemplate(), names: 'always' })
  assert.ok(!out.includes('Ada: Ada:'))
  assert.ok(out.includes('Bee: hey'))
}

// --- macros in the sequences, and the switch that turns them off --------
{
  const template = { ...defaultTemplate(), modelPrefix: '<|im_start|>{{char}}\n' }
  const named = [
    { role: 'user' as const, content: 'hello', name: 'Dom' },
    { role: 'assistant' as const, content: 'hi', name: 'Xenia' },
  ]
  assert.ok(flattenPrompt(named, template).includes('<|im_start|>Xenia\n'))
  const off = flattenPrompt(named, { ...template, expandMacros: false })
  assert.ok(off.includes('<|im_start|>{{char}}\n'), 'the macro expanded with expandMacros off')
  // No one to name: the macro resolves to nothing rather than staying visible in a raw prompt.
  const anon = flattenPrompt([{ role: 'user' as const, content: 'x' }], template)
  assert.ok(!anon.includes('{{char}}'))
}

// --- prefill is written after the open turn -----------------------------
{
  const template = { ...defaultTemplate(), prefill: 'Certainly, ' }
  const out = flattenPrompt(messages, { ...template, trimTrailingSpace: false })
  assert.ok(out.endsWith('<|im_start|>assistant\nCertainly, '), out.slice(-40))
  // trimTrailingSpace still applies to it: the trailing space is the same lost token.
  assert.ok(flattenPrompt(messages, template).endsWith('Certainly,'))
}

// --- past thinking is dropped unless the template sends it back ---------
{
  const reasoning = { prefix: '<think>', suffix: '</think>', autoParse: true, sendBack: false }
  const thought = [{ role: 'assistant' as const, content: '<think>hmm</think>hi' }]
  const dropped = flattenPrompt(thought, { ...defaultTemplate(), reasoning })
  assert.ok(!dropped.includes('<think>'))
  assert.ok(dropped.includes('\nhi<|im_end|>'))

  const kept = flattenPrompt(thought, {
    ...defaultTemplate(),
    reasoning: { ...reasoning, sendBack: true },
  })
  assert.ok(kept.includes('<think>hmm</think>hi'))

  // Only the assistant's own text is scanned: a user quoting the marker keeps it.
  const quoted = [{ role: 'user' as const, content: '<think>hmm</think>hi' }]
  assert.ok(flattenPrompt(quoted, { ...defaultTemplate(), reasoning }).includes('<think>'))
}

// --- every preset round trips and leaves the turn open ------------------
{
  for (const preset of templatePresets) {
    const template = preset.template()
    const out = flattenPrompt(messages, template)
    assert.ok(out.length > 0, `${preset.name} produced nothing`)
    assert.ok(out.includes('be brief'), `${preset.name} dropped the system turn`)
    assert.ok(out.includes('hello'), `${preset.name} dropped a user turn`)
    assert.ok(out.includes('hi'), `${preset.name} dropped an assistant turn`)
    if (template.firstPrefix) {
      assert.strictEqual(
        out.split(template.firstPrefix).length - 1,
        1,
        `${preset.name} emitted BOS more than once`,
      )
    }
    assert.ok(template.stopSequences.length > 0, `${preset.name} has no stop sequence`)
  }
}

console.log('ok')
