// Run: node --experimental-strip-types src/core/sillytavern/checkSillyTavern.ts
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import type { PromptBlock } from '../storage/types.ts'
import { parseSillyTavern } from './importSillyTavern.ts'
import { sniffShape } from './stShapes.ts'
import { paramsFromPreset } from './stSamplers.ts'
import { blocksFromStoryString } from './stStoryString.ts'

const fixture = (name: string) => readFileSync(`src/assets/testAssets/${name}`, 'utf8')
const sources = (blocks: PromptBlock[]) => blocks.map((b) => b.source)
const valueOf = (params: { key: string; value: unknown }[], key: string) =>
  params.find((p) => p.key === key)?.value

// --- the Gemma settings bundle -------------------------------------------
{
  const out = parseSillyTavern(fixture('Gemma_NoThink.json'))
  assert.strictEqual(out.shape, 'bundle')
  assert.strictEqual(out.label, 'Gemma4')

  const connection = out.connection!
  assert.ok(connection, 'the bundle made no connection')
  assert.strictEqual(connection.type, 'text')
  assert.strictEqual(connection.contextLimit, 56064)

  const template = connection.template!
  assert.strictEqual(template.userPrefix, '<|turn>user\n')
  assert.strictEqual(template.modelPrefix, '<|turn>model\n')
  assert.strictEqual(template.systemSuffix, '<turn|>\n')
  // The BOS is split off story_string_prefix, which is '<bos>' + the system sequence.
  assert.strictEqual(template.firstPrefix, '<bos>')
  assert.deepStrictEqual(template.stopSequences, ['<turn|>'])

  const params = connection.params!
  assert.strictEqual(valueOf(params, 'temperature'), 1)
  assert.strictEqual(valueOf(params, 'min_p'), 0.02)
  assert.strictEqual(valueOf(params, 'max_tokens'), 2000)
  // ST's -1 means "off" for top_k, and 0 is how the endpoints we target spell that.
  assert.strictEqual(valueOf(params, 'top_k'), 0)
  assert.deepStrictEqual(valueOf(params, 'stop'), ['<turn|>'])
  // max_length is a budget field, not a request param.
  assert.strictEqual(valueOf(params, 'max_length'), undefined)
  // DRY is off in this preset, so its numbers say nothing and stay out.
  assert.strictEqual(valueOf(params, 'dry_base'), undefined)
  assert.strictEqual(valueOf(params, 'dry_multiplier'), undefined)
  // Neither does the bias list, which ST keeps in its own shape.
  assert.strictEqual(valueOf(params, 'logit_bias'), undefined)
  // Set by hand in this preset, so they come over as new library rows.
  assert.strictEqual(valueOf(params, 'temperature_last'), true)
  assert.ok(
    out.newDefs.some((d) => d.key === 'temperature_last'),
    'temperature_last got no def',
  )
  assert.ok(
    out.newDefs.some((d) => d.key === 'dry_sequence_breakers') === false,
    'a gated-off DRY key made a def',
  )
  assert.ok(params.length < 25, `too many params carried over: ${params.length}`)

  const stack = out.stack!
  assert.ok(stack, 'the bundle made no stack')
  assert.strictEqual(stack.kind, 'chat')
  // The sysprompt leads, then story_string's slots in template order, then chat history.
  assert.deepStrictEqual(sources(stack.active).filter((s) => s !== 'text'), [
    'characterDescription',
    'worldInfo',
    'worldInfoAfter',
    'personaDescription',
    'characterExampleDialogue',
    'characterScenario',
    'chatHistory',
  ])
  assert.ok(stack.active[0].content.includes('### Core Principles:'), 'no system prompt block')
  // {{#if}} machinery and {{! comments }} are gone; the literal text between slots is not.
  const literal = stack.active.map((b) => b.content).join('\n')
  assert.ok(!literal.includes('{{#if'), 'an #if survived')
  assert.ok(!literal.includes('{{!'), 'a comment survived')
  assert.ok(literal.includes('### Universe Overview'), 'literal text was dropped')
  assert.ok(literal.includes('{{user}}'), '{{user}} should stay, we substitute it')

  // The bundle has an instruct template, so the think markers go on it and the global tag rules
  // are left alone.
  const reasoning = out.connection!.template!.reasoning!
  assert.strictEqual(reasoning.prefix, '<|channel>thought')
  assert.strictEqual(reasoning.suffix, '<channel|>')
  assert.strictEqual(reasoning.sendBack, false, 'past thinking would be sent back by default')
  assert.strictEqual(out.tagRule, undefined, 'a global tag rule was made as well')
}

// --- the Frankenstein chat-completion preset ------------------------------
{
  const out = parseSillyTavern(fixture('Micro-FF5.json'))
  assert.strictEqual(out.shape, 'chatPreset')
  // Prompts and no samplers: nothing to put on a connection.
  assert.strictEqual(out.connection, undefined)
  assert.deepStrictEqual(out.newDefs, [])

  const blocks = out.stack!.active
  assert.ok(blocks.length > 30, `expected the whole prompt list, got ${blocks.length}`)
  // Markers become bound blocks, in the order the preset puts them.
  assert.deepStrictEqual(sources(blocks).filter((s) => s !== 'text'), [
    'worldInfo',
    'personaDescription',
    'characterDescription',
    'characterPersonality',
    'characterScenario',
    'worldInfoAfter',
    'characterExampleDialogue',
    'chatHistory',
    'characterPostHistory',
  ])
  // The main prompt is first and on; the "=Pick one POV=" entries are off and still in place.
  assert.ok(blocks[0].label.includes('Main Prompt'), `unexpected first block: ${blocks[0].label}`)
  assert.strictEqual(blocks[0].disabled, undefined)
  const pov = blocks.find((b) => b.label.includes('1st person POV'))!
  assert.strictEqual(pov.disabled, true)
  assert.strictEqual(pov.toggleable, true)
  // Roles survive: the Ice Breaker prompt is an assistant turn.
  assert.ok(
    blocks.some((b) => b.role === 'assistant'),
    'the assistant-role prompt lost its role',
  )
  // The depth-injected prompt is in place, with a note saying so.
  const bolt = blocks.find((b) => b.label.includes('BOLT'))!
  assert.strictEqual(bolt.role, 'user')
  assert.ok(bolt.content.length > 100)
  assert.ok(
    out.notes.some((n) => n.includes('Injected at a depth')),
    'no note about the depth prompt',
  )
  // The card's post-history block keeps the preset's jailbreak wording as its fallback text.
  const post = blocks.find((b) => b.source === 'characterPostHistory')!
  assert.ok(post.content.trim().length > 0, 'the jailbreak text was dropped')
  assert.strictEqual(out.stack!.miscPrompts?.continue, '[Continue your last message without repeating its original content.]')
}

// --- sniffing each standalone shape ---------------------------------------
{
  assert.strictEqual(sniffShape({ input_sequence: '<|user|>' }), 'instruct')
  assert.strictEqual(sniffShape({ story_string: '{{description}}' }), 'context')
  assert.strictEqual(sniffShape({ name: 'Roleplay', content: 'be brief' }), 'sysprompt')
  assert.strictEqual(sniffShape({ temp: 0.8, rep_pen: 1.1 }), 'textgenPreset')
  assert.strictEqual(sniffShape({ prompts: [] }), 'chatPreset')
  assert.strictEqual(sniffShape({ instruct: {} }), 'bundle')
  assert.throws(() => sniffShape({ hello: 'world' }), /not a SillyTavern preset/)
  assert.throws(() => parseSillyTavern('not json'), /not JSON/)
  // A shape we can read but with nothing usable in it.
  assert.throws(() => parseSillyTavern('{"story_string": ""}'), /nothing in that file/)
}

// --- a standalone context template ----------------------------------------
{
  const out = parseSillyTavern('{"name":"Mine","story_string":"{{system}}\\n{{description}}"}')
  assert.strictEqual(out.shape, 'context')
  assert.strictEqual(out.connection, undefined)
  assert.deepStrictEqual(sources(out.stack!.active), ['characterDescription', 'chatHistory'])
  assert.strictEqual(out.stack!.name, 'Mine')
}

// --- story_string details --------------------------------------------------
{
  // A template naming a slot twice: our stack holds one of each, so the second is dropped.
  const twice = blocksFromStoryString('{{description}} and again {{description}}')
  assert.deepStrictEqual(sources(twice.blocks), ['characterDescription', 'text'])
  assert.strictEqual(twice.blocks[1].content, 'and again')
  // An unknown token is left in the text and reported.
  const odd = blocksFromStoryString('hi {{mystery}}')
  assert.deepStrictEqual(odd.unknownTokens, ['mystery'])
  assert.strictEqual(odd.blocks[0].content, 'hi {{mystery}}')
}

// --- sampler gates ---------------------------------------------------------
{
  const on = paramsFromPreset({ dry_multiplier: 0.8, dry_base: 1.75, dry_allowed_length: 2 })
  assert.strictEqual(valueOf(on.params, 'dry_multiplier'), 0.8)
  assert.strictEqual(valueOf(on.params, 'dry_base'), 1.75)
  const dyna = paramsFromPreset({ dynatemp: true, min_temp: 0.4, max_temp: 1.2 })
  assert.strictEqual(valueOf(dyna.params, 'max_temp'), 1.2)
  // min_temp at its off value contributes nothing even with dynatemp on.
  assert.strictEqual(valueOf(dyna.params, 'min_temp'), undefined)
  const off = paramsFromPreset({ dynatemp: false, min_temp: 0.4, max_temp: 1.2 })
  assert.strictEqual(valueOf(off.params, 'max_temp'), undefined)
}

// --- the instruct keys that used to be dropped ---------------------------
{
  const instruct = {
    name: 'Synthetic',
    input_sequence: '### Instruction:',
    output_sequence: '### Response:',
    system_sequence: '',
    stop_sequence: '### Instruction:',
    first_output_sequence: '### First:',
    last_output_sequence: '### Last:',
    system_same_as_user: true,
    wrap: true,
    macro: false,
    names_behavior: 'always',
    sequences_as_stop_strings: true,
  }
  const template = parseSillyTavern(JSON.stringify(instruct)).connection!.template!
  assert.strictEqual(template.firstModelPrefix, '### First:')
  assert.strictEqual(template.lastModelPrefix, '### Last:')
  assert.strictEqual(template.systemAsUser, true)
  assert.strictEqual(template.wrapNewlines, true)
  assert.strictEqual(template.expandMacros, false)
  assert.strictEqual(template.sequencesAsStops, true)
  assert.strictEqual(template.names, 'always')

  // macro absent counts as on, so the field stays unset rather than reading false.
  const { macro: _macro, ...noMacro } = instruct
  const onByDefault = parseSillyTavern(JSON.stringify(noMacro)).connection!.template!
  assert.strictEqual(onByDefault.expandMacros, undefined)

  // ST's names_behavior values map onto our three.
  const behaviour = (value: string) =>
    parseSillyTavern(JSON.stringify({ ...instruct, names_behavior: value })).connection!.template!
      .names
  assert.strictEqual(behaviour('none'), 'never')
  assert.strictEqual(behaviour('never'), 'never')
  // 'force' labels a turn conditionally, which is closest to our group behaviour.
  assert.strictEqual(behaviour('force'), 'group')
}

console.log('checkSillyTavern: ok')
