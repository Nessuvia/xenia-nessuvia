import assert from 'node:assert'
import { pickVoices, readAloudScript, splitChunks, type VoiceLike } from './readAloud.ts'

// splitChunks: offsets rather than strings. The browser turns them into Ranges.
{
  const text = 'She looked up. The sky held nothing at all. Then it did.'
  const chunks = splitChunks(text, 200)
  assert.deepStrictEqual(chunks, [{ start: 0, end: text.length }], 'short text stays one chunk')

  const parts = splitChunks(text, 20).map((c) => text.slice(c.start, c.end))
  assert.deepStrictEqual(parts, ['She looked up.', 'The sky held', 'nothing at all.', 'Then it did.'])
  for (const p of parts) assert.ok(p.length <= 20, `chunk over max: ${p}`)
}

// Every chunk carries content, none is whitespace, and offsets never go backwards.
{
  const text = '\n\n  Hop.   \n\n  Skip. Jump.\n'
  const chunks = splitChunks(text, 10)
  let at = 0
  for (const c of chunks) {
    assert.ok(c.start >= at, 'offsets move forward')
    assert.ok(c.end > c.start, 'chunk is non-empty')
    assert.ok(text.slice(c.start, c.end).trim(), 'chunk is not whitespace')
    at = c.end
  }
  assert.deepStrictEqual(
    chunks.map((c) => text.slice(c.start, c.end).trim()),
    ['Hop.', 'Skip.', 'Jump.'],
  )
  assert.deepStrictEqual(splitChunks('   \n ', 10), [], 'whitespace only yields nothing')
}

// A closing quote belongs to the sentence that ends, not the one that starts.
{
  const text = '"Get down!" he said. She did not move.'
  const parts = splitChunks(text, 24).map((c) => text.slice(c.start, c.end).trim())
  assert.deepStrictEqual(parts, ['"Get down!" he said.', 'She did not move.'])
}

// A word longer than max still gets emitted, cut rather than dropped.
{
  const text = 'aaaaaaaaaaaaaaaaaaaaaaaa'
  const parts = splitChunks(text, 10).map((c) => text.slice(c.start, c.end))
  assert.deepStrictEqual(parts, ['aaaaaaaaaa', 'aaaaaaaaaa', 'aaaa'])
  assert.strictEqual(parts.join(''), text, 'nothing lost')
}

const voice = (name: string, lang: string, localService: boolean): VoiceLike => ({ name, lang, localService })

// Natural first, then any other online voice, then local. Dialogue takes the next distinct name.
{
  const got = pickVoices(
    [
      voice('Microsoft David - English (United States)', 'en-US', true),
      voice('Microsoft Guy Online (Natural) - English (United States)', 'en-US', false),
      voice('Microsoft Aria Online (Natural) - English (United States)', 'en-US', false),
    ],
    'en-US',
  )
  assert.strictEqual(got.narrator, 'Microsoft Guy Online (Natural) - English (United States)')
  assert.strictEqual(got.dialogue, 'Microsoft Aria Online (Natural) - English (United States)')
}

// Offline: only local voices, and they still get two distinct picks.
{
  const got = pickVoices(
    [voice('Microsoft David', 'en-US', true), voice('Microsoft Zira', 'en-US', true)],
    'en-US',
  )
  assert.strictEqual(got.narrator, 'Microsoft David')
  assert.strictEqual(got.dialogue, 'Microsoft Zira')
}

// One voice: both roles get it, and speak() shifts dialogue pitch instead.
{
  const got = pickVoices([voice('Microsoft David', 'en-US', true)], 'en')
  assert.strictEqual(got.narrator, 'Microsoft David')
  assert.strictEqual(got.dialogue, 'Microsoft David')
}

// No voice matches the language: fall back to the whole list rather than returning nothing.
{
  const got = pickVoices([voice('Kyoko', 'ja-JP', true)], 'en-US')
  assert.strictEqual(got.narrator, 'Kyoko')
}

assert.deepStrictEqual(pickVoices([], 'en'), { narrator: '', dialogue: '' }, 'empty list is not a crash')

// The exported page carries the same two functions, not a second copy of the logic.
{
  const script = readAloudScript('nav, .readAloud')
  assert.ok(script.includes('function splitChunks'), 'splitChunks is injected')
  assert.ok(script.includes('function pickVoices'), 'pickVoices is injected')
  assert.ok(script.includes('"nav, .readAloud"'), 'skip selector is embedded as a string')
  assert.ok(!script.includes('</script'), 'nothing that would close the host script tag')
}

console.log('readAloud checks passed')
