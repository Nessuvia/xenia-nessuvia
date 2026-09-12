import { RiDeleteBinLine } from '@remixicon/react'
import { newLexiconEntry, type LexiconEntry } from '../../core/quality/lexicon'
import type { QualityWeights } from '../../core/quality/score'
import type { ScoreStage } from '../../core/secondSweep/pipeline'
import './settings.css'

/** The weight rows, in the order they read best rather than alphabetically. */
const WEIGHTS: Array<[keyof QualityWeights, string]> = [
  ['slop', 'Worn phrasing'],
  ['census', 'Reused in this chat'],
  ['selfRepeat', 'Repeats itself'],
  ['flags', 'Hammer flags'],
  ['variety', 'Sentence variety'],
]

/**
 * The controls for what happens to a candidate after it comes back: the weights, the invariants,
 * the accept threshold and the slop lexicon.
 *
 * Its own component rather than more rows in the stage editor: it is the longest part of
 * the panel and none of it touches the stage's ratio band above it.
 *
 * The lexicon belongs to the pipeline rather than the stage: the banned list a rewrite stage sends
 * and the list this scores against have to be the same list. Otherwise the rewrite is marked down
 * for obeying its own instructions.
 */
export default function QualitySection({
  config,
  patchConfig,
  lexicon,
  patchLexicon,
}: {
  config: ScoreStage['config']
  patchConfig: (over: Partial<ScoreStage['config']>) => void
  lexicon: LexiconEntry[]
  patchLexicon: (next: LexiconEntry[]) => void
}) {
  const quality = config.quality
  const invariants = quality.invariants

  const setQuality = (over: Partial<typeof quality>) => patchConfig({ quality: { ...quality, ...over } })
  const setInvariant = (over: Partial<typeof invariants>) =>
    setQuality({ invariants: { ...invariants, ...over } })
  const setWeight = (key: keyof QualityWeights, value: number) =>
    setQuality({ weights: { ...quality.weights, [key]: value } })

  // The list is the pipeline's own, all of it. Nothing ships a slop list: there is no bundled
  // half to overlay, and every row is the user's to edit or delete.
  const entries = lexicon
  const setEntry = (id: string, over: Partial<LexiconEntry>) =>
    patchLexicon(lexicon.map((e) => (e.id === id ? { ...e, ...over } : e)))
  const removeEntry = (id: string) => patchLexicon(lexicon.filter((e) => e.id !== id))

  return (
    <>
      <span className="passSectionTitle">Quality checks</span>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={quality.enabled}
          onChange={(e) => setQuality({ enabled: e.target.checked })}
        />
        Compare the candidate against the text it replaces
      </label>
      <p className="hint">
        The reply and the rewrite are scored paragraph by paragraph. A paragraph keeps its original
        text unless the rewrite scores better. Off means the rewrite is stored as it comes back.
      </p>
      <div className="passNumbers">
        <label className="passNumber">
          Margin to replace
          <input
            className="passNumberInput"
            type="number"
            min={0}
            step={0.1}
            value={quality.minImprovement}
            onChange={(e) => setQuality({ minImprovement: Number(e.target.value) })}
          />
        </label>
      </div>
      <p className="hint">How much better a paragraph has to score. 0 keeps the original on a tie.</p>

      <span className="passSectionTitle">Rejections</span>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={invariants.newProperNouns}
          onChange={(e) => setInvariant({ newProperNouns: e.target.checked })}
        />
        Reject new names
      </label>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={invariants.dialogue}
          onChange={(e) => setInvariant({ dialogue: e.target.checked })}
        />
        Reject invented or dropped dialogue
      </label>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={invariants.lengthBand}
          onChange={(e) => setInvariant({ lengthBand: e.target.checked })}
        />
        Reject a paragraph outside the length band
      </label>
      <label className="checkboxRow">
        <input
          type="checkbox"
          checked={invariants.paragraphCount}
          onChange={(e) => setInvariant({ paragraphCount: e.target.checked })}
        />
        Reject changed paragraph breaks
      </label>
      <p className="hint">
        Off by default. A rewrite that merges two paragraphs is often the better read.
      </p>
      <div className="passNumbers">
        <label className="passNumber">
          Paragraph shortest
          <input
            className="passNumberInput"
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={invariants.minRatio}
            onChange={(e) => setInvariant({ minRatio: Number(e.target.value) })}
          />
        </label>
        <label className="passNumber">
          Paragraph longest
          <input
            className="passNumberInput"
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={invariants.maxRatio}
            onChange={(e) => setInvariant({ maxRatio: Number(e.target.value) })}
          />
        </label>
      </div>

      <span className="passSectionTitle">Weights</span>
      <div className="passNumbers">
        {WEIGHTS.map(([key, label]) => (
          <label className="passNumber" key={key}>
            {label}
            <input
              className="passNumberInput"
              type="number"
              min={0}
              max={10}
              step={0.1}
              value={quality.weights[key]}
              onChange={(e) => setWeight(key, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <p className="hint">
        0 turns a signal off. Sentence variety counts for the rewrite; everything else counts
        against it.
      </p>

      <span className="passSectionTitle">Worn phrases</span>
      <p className="hint">
        Phrases this pipeline scores against. Weight is how much a hit counts against a paragraph.
      </p>
      <ul className="ruleCards">
        {entries.map((entry) => (
          <li className="card ruleCard" key={entry.id}>
            <div className="passRow">
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(e) => setEntry(entry.id, { enabled: e.target.checked })}
                />
                On
              </label>
              <input
                className="passRowLabelInput"
                value={entry.phrase}
                placeholder="Phrase"
                onChange={(e) => setEntry(entry.id, { phrase: e.target.value })}
              />
              <label className="passNumber">
                Weight
                <input
                  className="passNumberInput"
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={entry.weight}
                  onChange={(e) => setEntry(entry.id, { weight: Number(e.target.value) })}
                />
              </label>
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={entry.regex}
                  onChange={(e) => setEntry(entry.id, { regex: e.target.checked })}
                />
                Regex
              </label>
              <button type="button" title="Delete phrase" onClick={() => removeEntry(entry.id)}>
                <RiDeleteBinLine size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="grammarActions">
        <button
          type="button"
          onClick={() => patchLexicon([...lexicon, newLexiconEntry()])}
        >
          Add phrase
        </button>
        <button
          type="button"
          disabled={lexicon.length === 0}
          onClick={() => patchLexicon([])}
        >
          Remove all
        </button>
      </div>
    </>
  )
}
