import { exampleRegex, exampleWords, parseExampleRegex, type SlotSize, type Slots } from '../../core/agent/example'
import type { Rule } from '../../core/agent/rules'

const sizeLabels: [SlotSize, string][] = [
  ['one', 'One word'],
  ['few', 'Up to 4 words'],
  ['clause', 'Up to punctuation'],
]

/** A "Words" rule: click words in the example to let them vary, and the regex it runs as. */
export default function ExampleEditor({ rule, onChange }: { rule: Rule; onChange: (over: Partial<Rule>) => void }) {
  const slots = rule.slots ?? {}
  const words = exampleWords(rule.find)
  const unlinked = rule.regexOverride !== undefined

  const toggle = (i: number) => {
    const next: Slots = { ...slots }
    if (next[i]) delete next[i]
    else next[i] = next[i - 1] ?? next[i + 1] ?? 'few'
    onChange({ slots: next })
  }

  // One size per run of clicked words, set on every word in the run.
  const setSize = (start: number, size: SlotSize) => {
    const next: Slots = { ...slots }
    for (let i = start; next[i]; i++) next[i] = size
    onChange({ slots: next })
  }

  return (
    <>
      <div className="ruleField">
        <span>{unlinked ? 'Example (regex edited by hand)' : 'Click words that change'}</span>
        <div className={`ruleExampleWords${unlinked ? ' ruleExampleUnlinked' : ''}`}>
          {words.map((word, i) => (
            <span key={i} className="ruleExampleWordWrap">
              <button
                type="button"
                className={`ruleExampleWord${slots[i] ? ' ruleExampleSlot' : ''}`}
                aria-pressed={!!slots[i]}
                disabled={unlinked}
                onClick={() => toggle(i)}
              >
                {word}
              </button>
              {slots[i] && !slots[i - 1] && (
                <select
                  className="ruleExampleSize"
                  value={slots[i]}
                  disabled={unlinked}
                  onChange={(e) => setSize(i, e.target.value as SlotSize)}
                >
                  {sizeLabels.map(([size, label]) => (
                    <option key={size} value={size}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
            </span>
          ))}
        </div>
        {unlinked && (
          <button type="button" className="ruleExampleRebuild" onClick={() => onChange({ regexOverride: undefined })}>
            Rebuild regex from example
          </button>
        )}
      </div>

      <label className="ruleField">
        <span>Regex</span>
        <input
          className="patternInput"
          value={rule.regexOverride ?? exampleRegex(rule.find, slots)}
          onChange={(e) => {
            const parsed = parseExampleRegex(e.target.value, { find: rule.find, slots })
            onChange(parsed ? { ...parsed, regexOverride: undefined } : { regexOverride: e.target.value })
          }}
        />
      </label>
    </>
  )
}
