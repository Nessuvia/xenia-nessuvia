// Draws the letters each paragraph and sentence must start with.
//
//   node acrostic.mjs 11        11 paragraphs, one sentence each
//   node acrostic.mjs 3,1,2     3 paragraphs of 3, 1 and 2 sentences
//   node acrostic.mjs --check   self-check
//
// Letters are ordered by English frequency and weighted 1/rank, so z turns up
// about a twentieth as often as t. Zipf on rank, not real letter
// frequencies. Swap in a weight table if the draws feel off.
const letters = 'etaoinshrdlcumwfgypbvkjxqz'
const weights = letters.split('').map((_, i) => 1 / (i + 1))
const total = weights.reduce((a, b) => a + b, 0)

const pick = () => {
  let r = Math.random() * total
  for (let i = 0; i < letters.length; i++) {
    r -= weights[i]
    if (r <= 0) return letters[i]
  }
  return letters[0]
}

// "3,1,2" -> [3,1,2]; "11" -> eleven paragraphs of one sentence.
export const parseShape = (arg) => {
  const parts = String(arg).split(',').map(Number)
  if (parts.some((n) => !Number.isInteger(n) || n < 1)) throw new Error(`bad shape: ${arg}`)
  return parts.length === 1 ? Array(parts[0]).fill(1) : parts
}

export const draw = (shape) => shape.map((n) => Array.from({ length: n }, pick))

if (process.argv[2] === '--check') {
  const { default: assert } = await import('node:assert')
  assert.deepEqual(parseShape('3'), [1, 1, 1])
  assert.deepEqual(parseShape('3,1,2'), [3, 1, 2])
  assert.throws(() => parseShape('0'))
  assert.throws(() => parseShape('2,x'))
  const rows = draw([3, 1, 2])
  assert.deepEqual(
    rows.map((r) => r.length),
    [3, 1, 2],
  )
  assert.ok(rows.flat().every((c) => letters.includes(c)))
  console.log('ok')
} else if (process.argv[2]) {
  draw(parseShape(process.argv[2])).forEach((row, i) =>
    console.log(`paragraph ${i + 1}: ${row.join(' ')}`),
  )
} else {
  console.log('usage: node acrostic.mjs <paragraphs | sentences,per,paragraph>')
}
