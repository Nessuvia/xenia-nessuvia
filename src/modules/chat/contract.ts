const negations: [string, string][] = [
  ['will not', "won't"], ['cannot', "can't"], ['can not', "can't"], ['shall not', "shan't"],
  ['do not', "don't"], ['does not', "doesn't"], ['did not', "didn't"],
  ['is not', "isn't"], ['are not', "aren't"], ['was not', "wasn't"], ['were not', "weren't"],
  ['have not', "haven't"], ['has not', "hasn't"], ['had not', "hadn't"],
  ['would not', "wouldn't"], ['should not', "shouldn't"], ['could not', "couldn't"],
  ['must not', "mustn't"], ['need not', "needn't"],
]

const pronouns = '(I|you|he|she|it|we|they|that|there|here|what|who)'
const helpers: [string, string][] = [['am', "'m"], ['are', "'re"], ['is', "'s"], ['will', "'ll"], ['would', "'d"]]

/** Keep the first letter's case: "Don't" becomes "Don't". */
function matchCase(original: string, out: string): string {
  return original[0] === original[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out
}

/**
 * Contract a message: "shouldn't" to "shouldn't", "I am" to "I'm".
 * A pronoun + helper before punctuation stays whole: "Yes, I am." can't become "Yes, I'm."
 * Pairs that don't go together ("I are", "he am") are left alone.
 */
export function contract(text: string): string {
  let out = text
  for (const [long, short] of negations) {
    out = out.replace(new RegExp(`\\b${long.replace(' ', '\\s+')}\\b`, 'gi'), (m) => matchCase(m, short))
  }
  for (const [helper, suffix] of helpers) {
    out = out.replace(new RegExp(`\\b${pronouns}\\s+${helper}\\b(?![\\s]*[.,!?;:"*]|\\s*$)`, 'gi'), (m, who: string) => {
      const w = who.toLowerCase()
      if (helper === 'am' && w !== 'i') return m
      if (helper === 'are' && !['you', 'we', 'they', 'what', 'who'].includes(w)) return m
      if (helper === 'is' && ['i', 'you', 'we', 'they'].includes(w)) return m
      return who + suffix
    })
  }
  return out
}
