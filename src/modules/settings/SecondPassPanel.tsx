import { useState } from 'react'
import { useSecondPass, useSettings } from '../../core/stores/settingsStore'
import { standingNotes } from '../../core/secondPass/textRules'
import { bundledRules } from '../../core/secondPass/bundledRules'
import { downloadRules, parseRuleFile } from '../../core/secondPass/ruleJson'
import ConnectionPicker from '../../app/ConnectionPicker'
import GrammarHammerPanel from './GrammarHammerPanel'
import SecondPassPreview from './SecondPassPreview'
import TextRulesPanel from './TextRulesPanel'
import './settings.css'

type Tab = 'setup' | 'checks' | 'rules' | 'hammer'

const TABS: Array<[Tab, string]> = [
  ['setup', 'Setup'],
  ['checks', 'Checks'],
  ['rules', 'Rules'],
  ['hammer', 'Hammer'],
]

/**
 * Second Pass: setup, the three built-in checks, the free-text rule list and the Grammar Hammer,
 * behind a local tab strip, with one preview under it that every tab shares.
 *
 * The tab state is a `useState` on purpose: the Settings sidebar keeps one flat entry for Second
 * Pass, so there is nothing to link to and no hash to read.
 */
export default function SecondPassPanel() {
  const settings = useSecondPass()
  const patch = useSettings((s) => s.setSecondPass)
  const [tab, setTab] = useState<Tab>('setup')
  const [paste, setPaste] = useState('')
  const [importError, setImportError] = useState('')

  // Standing rules force the second request whether or not anything matched, so the skip setting
  // has nothing left to skip while any are on. Say so rather than let it read as broken.
  const alwaysOn = standingNotes(settings.textRules, 'assistant').length
  const rules = settings.textRules
  const hammer = settings.rules
  const pun = settings.punctuation
  const rep = settings.repetition
  const patchRep = (over: Partial<typeof rep>) => patch({ repetition: { ...rep, ...over } })
  const spr = settings.sprawl
  const patchSpr = (over: Partial<typeof spr>) => patch({ sprawl: { ...spr, ...over } })
  const tri = settings.triplet
  const patchTri = (over: Partial<typeof tri>) => patch({ triplet: { ...tri, ...over } })

  /** Append what the JSON holds. Import adds; it never replaces the list, so a file with one rule
   *  in it cannot cost you the other forty. */
  const addJson = (text: string) => {
    try {
      const file = parseRuleFile(text)
      patch({ textRules: [...rules, ...file.rules], rules: [...hammer, ...file.hammer] })
      setPaste('')
      setImportError('')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that.')
    }
  }


  return (
    <div className="secondPassPanel">
      <div className="secondPassTabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={id === tab ? 'secondPassTab secondPassTabOn' : 'secondPassTab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'setup' && (
        <section className="textRules screenFrame">
          <span className="titleContainer">
            <h3>Second Pass</h3>
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => patch({ enabled: e.target.checked })}
              />
              Enable
            </label>
          </span>

          <div className="secondPassBody">
            <p className="hint">
              Each reply is generated, checked against the rules and checks here, then sent back to
              a model to rewrite.
            </p>

            <ConnectionPicker
              value={settings.connectionId}
              onChange={(connectionId) => patch({ connectionId })}
              allowActive
              label="Editing connection"
            />

            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={settings.skipWhenClean}
                onChange={(e) => patch({ skipWhenClean: e.target.checked })}
              />
              Skip the second request when nothing is found
            </label>
            <p className="hint">
              {alwaysOn > 0
                ? `${alwaysOn} ${alwaysOn === 1 ? 'rule applies' : 'rules apply'} to every reply, so the second request runs every time regardless of this setting. Disable or delete those rules to let it skip.`
                : 'Nothing found means the reply is used as written, and only one request is made.'}
            </p>

            <label className="secondPassPrompt">
              Standing instruction
              <textarea
                className="secondPassPromptInput"
                rows={3}
                value={settings.userPrompt}
                placeholder="Applied to every reply, on top of anything found."
                onChange={(e) => patch({ userPrompt: e.target.value })}
              />
            </label>
            <p className="hint">
              Filled in, the second request runs on every reply, including ones where nothing was
              found.
            </p>

            {/* Global, like the rest of Second Pass. Per-story override if a Story ever needs its
                own answer. */}
            <label className="checkboxRow">
              <input
                type="checkbox"
                checked={settings.passBeats}
                onChange={(e) => patch({ passBeats: e.target.checked })}
              />
              Pass generated beats in Write mode
            </label>
            <p className="hint">Adds one request per generated beat.</p>

            <span className="secondPassSectionTitle">Bundled rules</span>
            <div className="grammarActions">
              <button type="button" onClick={() => addJson(JSON.stringify(bundledRules()))}>
                Add Nessu's rules
              </button>
            </div>
            <p className="hint">
              Both lists start empty. This adds {bundledRules().rules.length} rules and{' '}
              {bundledRules().hammer.length} Hammer patterns, the same way an imported file does.
            </p>

            <div className="grammarActions">
              {/* File inputs can't be styled; the label is the button. */}
              <label className="ruleImportButton">
                Import JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (file) addJson(await file.text())
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => downloadRules(rules, hammer)}
                disabled={rules.length === 0 && hammer.length === 0}
              >
                Export JSON
              </button>
            </div>
            <div className="ruleImport">
              <textarea
                className="ruleImportInput"
                value={paste}
                rows={3}
                placeholder="…or paste rule JSON here"
                onChange={(e) => setPaste(e.target.value)}
              />
              <div className="grammarActions">
                <button type="button" disabled={!paste.trim()} onClick={() => addJson(paste)}>
                  Add pasted rules
                </button>
              </div>
              {importError && <p className="hint danger">{importError}</p>}
              <p className="hint">
                Takes an export, a bare array of rules, or a single rule object. A file may carry
                Hammer patterns too, and those go to the Hammer tab. Imported rules are added to the
                lists, not swapped in for them.
              </p>
            </div>
          </div>
        </section>
      )}

      {tab === 'checks' && (
        <section className="textRules screenFrame">
          <span className="titleContainer">
            <h3>Checks</h3>
          </span>

          <ul className="ruleCards screenBody">
            <li className="card ruleCard">
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={spr.enabled}
                  onChange={(e) => patchSpr({ enabled: e.target.checked })}
                />
                Sentence sprawl
              </label>
              {/* A rule cannot do this one: what makes a sentence sprawl is how many joints it has,
                  not which words fill them. */}
              <p className="hint">
                Reports sentences over these counts of words, commas and conjunctions.
              </p>
              {spr.enabled && (
                <div className="secondPassNumbers">
                  <label className="secondPassNumber">
                    Words
                    <input
                      className="secondPassNumberInput"
                      type="number"
                      min={10}
                      max={200}
                      value={spr.maxWords}
                      onChange={(e) => patchSpr({ maxWords: Number(e.target.value) })}
                    />
                  </label>
                  <label className="secondPassNumber">
                    Commas
                    <input
                      className="secondPassNumberInput"
                      type="number"
                      min={1}
                      max={20}
                      value={spr.maxCommas}
                      onChange={(e) => patchSpr({ maxCommas: Number(e.target.value) })}
                    />
                  </label>
                  <label className="secondPassNumber">
                    Conjunctions
                    <input
                      className="secondPassNumberInput"
                      type="number"
                      min={1}
                      max={20}
                      value={spr.maxConjunctions}
                      onChange={(e) => patchSpr({ maxConjunctions: Number(e.target.value) })}
                    />
                  </label>
                </div>
              )}
            </li>

            <li className="card ruleCard">
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={tri.enabled}
                  onChange={(e) => patchTri({ enabled: e.target.checked })}
                />
                Rule of three
              </label>
              <p className="hint">
                Reports sentences built as exactly three comma-separated items. Commas inside quotes
                are skipped.
              </p>
            </li>

            <li className="card ruleCard">
              {/* Not a rule: there is no judgment in either sweep, so there is nothing to tell a
                  model. Both run on the draft before it is stored. */}
              <span className="secondPassSectionTitle">Punctuation</span>
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={pun.dashes}
                  onChange={(e) => patch({ punctuation: { ...pun, dashes: e.target.checked } })}
                />
                Em dashes to commas
              </label>
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={pun.quotes}
                  onChange={(e) => patch({ punctuation: { ...pun, quotes: e.target.checked } })}
                />
                Curly quotes and ellipses to straight
              </label>
            </li>

            <li className="card ruleCard">
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={rep.enabled}
                  onChange={(e) => patchRep({ enabled: e.target.checked })}
                />
                Repetition
              </label>
              <p className="hint">Reports phrases the reply reuses from earlier replies.</p>
              {rep.enabled && (
                <div className="secondPassNumbers">
                  <label className="secondPassNumber">
                    Phrase length
                    <input
                      className="secondPassNumberInput"
                      type="number"
                      min={2}
                      max={12}
                      value={rep.phrase}
                      onChange={(e) => patchRep({ phrase: Number(e.target.value) })}
                    />
                  </label>
                  <label className="secondPassNumber">
                    Earlier replies using it
                    <input
                      className="secondPassNumberInput"
                      type="number"
                      min={1}
                      max={20}
                      value={rep.repeats}
                      onChange={(e) => patchRep({ repeats: Number(e.target.value) })}
                    />
                  </label>
                  <label className="secondPassNumber">
                    Replies to look back over
                    <input
                      className="secondPassNumberInput"
                      type="number"
                      min={1}
                      max={40}
                      value={rep.lookback}
                      onChange={(e) => patchRep({ lookback: Number(e.target.value) })}
                    />
                  </label>
                </div>
              )}
            </li>
          </ul>
        </section>
      )}

      {tab === 'rules' && <TextRulesPanel />}
      {tab === 'hammer' && <GrammarHammerPanel />}

      <SecondPassPreview />
    </div>
  )
}
