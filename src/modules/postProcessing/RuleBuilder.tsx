import { useMemo, useState } from 'react'
import { builderPatch, chipParts, chipRefs, chipsRegex, nextChip, sampleTokens, type Chip, type ChipCount } from '../../core/agent/builder'
import { POS_TAGS } from '../../core/hammer/pattern'
import { isPunct, type PosTag } from '../../core/hammer/tagger'
import type { Rule } from '../../core/agent/rules'

const chipClass: Record<Chip['state'], string> = {
  exact: 'postRuleChip postRuleChipExact',
  type: 'postRuleChip postRuleChipType',
  any: 'postRuleChip postRuleChipAny',
  ignored: 'postRuleChip postRuleChipIgnored',
}

/** A built rule's sample, its chips, and the pattern they write. */
export default function RuleBuilder({ rule, onChange }: { rule: Rule; onChange: (over: Partial<Rule>) => void }) {
  const [confirming, setConfirming] = useState(false)
  const sample = rule.sample ?? ''
  const tokens = useMemo(() => sampleTokens(sample), [sample])
  const chips = tokens.map((t, i) => rule.chips?.[i] ?? { state: isPunct(t) ? 'ignored' : 'exact' } as Chip)
  const refs = chipRefs(chipParts(tokens, chips))
  const setChip = (i: number, chip: Chip) => onChange(builderPatch(sample, chips.map((c, k) => (k === i ? chip : c))))

  return (
    <>
      <label className="ruleField">
        <span>Sample</span>
        <input
          className="patternInput"
          value={sample}
          placeholder="She didn't smile, and he left."
          onChange={(e) => onChange(builderPatch(e.target.value))}
        />
      </label>
      <p className="hint">Changing the sample resets the word choices.</p>

      {tokens.length > 0 && (
        <div className="ruleField">
          <span>Words</span>
          <p className="hint">Click a word to switch between exact, word type and any word. Click a mark to require it.</p>
          <div className="postRuleChips">
            {tokens.map((token, i) => {
              const chip = chips[i]
              const word = !isPunct(token)
              return (
                <span key={i} className="postRuleChipWrap">
                  <button type="button" className={chipClass[chip.state]} onClick={() => setChip(i, nextChip(token, chip))}>
                    {chip.state === 'any' ? 'any' : token.text}
                  </button>
                  {word && chip.state === 'type' && (
                    <select
                      className="postRuleChipSelect"
                      value={chip.tag}
                      aria-label="Word type"
                      onChange={(e) => setChip(i, { ...chip, tag: e.target.value as PosTag })}
                    >
                      {POS_TAGS.map((tag) => (
                        <option key={tag} value={tag}>{tag}</option>
                      ))}
                    </select>
                  )}
                  {word && chip.state !== 'exact' && (
                    <select
                      className="postRuleChipSelect"
                      value={chip.count ?? 'one'}
                      aria-label="How many words"
                      onChange={(e) => setChip(i, { ...chip, count: e.target.value as ChipCount })}
                    >
                      <option value="one">1</option>
                      <option value="few">1-4</option>
                      <option value="clause">to punctuation</option>
                    </select>
                  )}
                  {refs[i] !== null && <span className="postRuleChipRef">${refs[i]}</span>}
                </span>
              )
            })}
          </div>
        </div>
      )}

      <div className="ruleField">
        <span>Pattern</span>
        <code className="postRulePattern">{rule.find}</code>
        <div className="ruleActionRow">
          {/* Second click converts. Leaving the button cancels. */}
          <button
            type="button"
            className={confirming ? 'danger' : undefined}
            onBlur={() => setConfirming(false)}
            onClick={() =>
              confirming
                ? onChange({ match: 'regex', find: chipsRegex(tokens, chips), sample: undefined, chips: undefined })
                : setConfirming(true)
            }
          >
            {confirming ? 'Convert to regex?' : 'Edit as regex'}
          </button>
        </div>
        {confirming && (
          <p className="hint danger">
            This replaces sample and word choices with a plain regular expression string. Are you sure?
          </p>
        )}
      </div>
    </>
  )
}
