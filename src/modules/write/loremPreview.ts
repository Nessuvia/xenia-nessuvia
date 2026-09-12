// Placeholder prose for the Preview Word Count toggle: shows an Author how long a beat's target
// actually is. Display only: it is never stored on a Block and never sent to the model.
//
// Its own file, extension-ful imports and all, so checkLoremPreview.ts can run it under
// `node --experimental-strip-types`.

const pool =
  `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut
   labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris
   nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse
   cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui
   officia deserunt mollit anim id est laborum`.split(/\s+/)

const pick = () => pool[Math.floor(Math.random() * pool.length)]

const cap = (w: string) => `${w[0].toUpperCase()}${w.slice(1)}`

/** `count` words as sentences of 6–14 words, each capitalised and full-stopped. */
function sentences(count: number): string {
  const out: string[] = []
  for (let i = 0; i < count; ) {
    const len = Math.min(6 + Math.floor(Math.random() * 9), count - i)
    const s = Array.from({ length: len }, pick)
    s[0] = cap(s[0])
    out.push(`${s.join(' ')}.`)
    i += len
  }
  return out.join(' ')
}

/**
 * `words` words of placeholder prose split into paragraphs, exactly that many words in total.
 *
 * Roughly one paragraph in four is a single short sentence, the rest run 50–140 words, which is
 * what makes the block read like a reply rather than a wall. The whole point is judging length by
 * eye. The last paragraph takes whatever is left. The count stays exact and the number under the
 * beat's target field matches what is on screen.
 */
export function loremParagraphs(words: number): string {
  if (words <= 0) return ''
  const paras: string[] = []
  for (let left = words; left > 0; ) {
    const short = Math.random() < 0.25
    const want = short ? 8 + Math.floor(Math.random() * 8) : 50 + Math.floor(Math.random() * 91)
    // A stub tail looks like a mistake; fold anything under 20 words into this paragraph instead.
    const take = left - want < 20 ? left : want
    paras.push(sentences(take))
    left -= take
  }
  return paras.join('\n\n')
}
