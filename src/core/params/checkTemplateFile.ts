// Run: node --experimental-strip-types src/core/params/checkTemplateFile.ts
import assert from 'node:assert'
import { defaultTemplate, templatePresets } from './paramDef.ts'
import { templateFromJson, templateToJson } from './templateFile.ts'

// --- every preset survives a round trip ----------------------------------
{
  for (const preset of templatePresets) {
    const before = preset.template()
    const after = templateFromJson(templateToJson(preset.name, before))
    assert.strictEqual(after.name, preset.name)
    assert.deepStrictEqual(after.template, before, `${preset.name} changed in the round trip`)
  }
}

// --- the optional fields round trip too ----------------------------------
{
  const rich = {
    ...defaultTemplate(),
    firstModelPrefix: '[FIRST]',
    lastModelPrefix: '[LAST]',
    prefill: 'Certainly, ',
    systemAsUser: true,
    wrapNewlines: true,
    expandMacros: false,
    sequencesAsStops: true,
    names: 'group' as const,
    reasoning: { prefix: '<think>', suffix: '</think>', autoParse: true, sendBack: true, maxSendBack: 2 },
  }
  assert.deepStrictEqual(templateFromJson(templateToJson('Rich', rich)).template, rich)
}

// --- nothing secret is in the shape --------------------------------------
{
  const json = templateToJson('Any', defaultTemplate())
  for (const secret of ['apiKey', 'endpointUrl', 'accessKeyId', 'secretAccessKey']) {
    assert.ok(!json.includes(secret), `${secret} reached a template file`)
  }
}

// --- bad input is refused with something a user can read -----------------
{
  assert.throws(() => templateFromJson('not json'), /not JSON/)
  assert.throws(() => templateFromJson('[]'), /not a template/)
  assert.throws(() => templateFromJson('{"kind":"somethingElse"}'), /SillyTavern/)
  assert.throws(() => templateFromJson('{"kind":"xeniaInstructTemplate"}'), /no template/)
}

// --- a half-written file falls back to ChatML rather than to undefined ---
{
  const sparse = '{"kind":"xeniaInstructTemplate","template":{"userPrefix":"USER: "}}'
  const { name, template } = templateFromJson(sparse)
  assert.strictEqual(template.userPrefix, 'USER: ')
  assert.strictEqual(template.modelPrefix, defaultTemplate().modelPrefix)
  assert.deepStrictEqual(template.stopSequences, [])
  assert.strictEqual(template.trimTrailingSpace, true)
  assert.strictEqual(name, 'Imported template')
  for (const value of Object.values(template)) assert.notStrictEqual(value, undefined)
}

// --- a non-string sequence is dropped, not stringified -------------------
{
  const junk = '{"kind":"xeniaInstructTemplate","template":{"userPrefix":42,"stopSequences":["a",7]}}'
  const { template } = templateFromJson(junk)
  assert.strictEqual(template.userPrefix, defaultTemplate().userPrefix)
  assert.deepStrictEqual(template.stopSequences, ['a'])
}

console.log('ok')
