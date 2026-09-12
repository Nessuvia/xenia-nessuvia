import { useEffect, useMemo, useState } from 'react'
import { RiSearchEyeLine } from '@remixicon/react'
import { usePipelines } from '../../core/stores/pipelineStore'
import { useSettings } from '../../core/stores/settingsStore'
import { useSlopSample } from '../../core/stores/slopStore'
import { resolveDetect } from '../../core/nessuPass/detectSettings'
import { countTokens, loadTokenizer } from '../../core/prompt/budget'
import { analyseText, type Finding } from './analyse'
import { ruleFromFinding } from './addRule'
import FindingRow from './FindingRow'
import Highlighted from './Highlighted'
import '../../app/formPage.css'
import './slopdentifier.css'

export default function SlopView() {
  const pipelines = usePipelines((s) => s.pipelines)
  const updatePipeline = usePipelines((s) => s.update)
  const activeId = useSettings((s) => s.nessuPass.pipelineId)
  const takeSample = useSlopSample((s) => s.takeSample)

  const [text, setText] = useState('')
  const [analysed, setAnalysed] = useState('')
  const [pipelineId, setPipelineId] = useState<number | null>(activeId ?? null)
  const [added, setAdded] = useState('')
  const [tokens, setTokens] = useState(0)

  // A chat quick action leaves the message here and routes in. Taken once, so a later visit is
  // a blank screen rather than the last thing inspected.
  useEffect(() => {
    const sample = takeSample()
    if (sample) {
      setText(sample)
      setAnalysed(sample)
    }
  }, [takeSample])

  useEffect(() => {
    if (pipelineId == null && activeId != null) setPipelineId(activeId)
  }, [activeId, pipelineId])

  useEffect(() => {
    loadTokenizer().then(() => setTokens(countTokens(analysed)))
  }, [analysed])

  const pipeline = pipelines.find((p) => p.id === pipelineId)
  const detect = useMemo(() => resolveDetect(pipeline?.detect), [pipeline])
  // The pipeline's own list and nothing else. With no pipeline picked there is no slop list, so
  // the lexicon group finds nothing and the built-in checks carry the report.
  const lexicon = useMemo(() => pipeline?.lexicon ?? [], [pipeline])

  const report = useMemo(
    () => (analysed.trim() ? analyseText(analysed, detect, lexicon) : null),
    [analysed, detect, lexicon],
  )

  async function addRule(finding: Finding, targetId: number) {
    const target = pipelines.find((p) => p.id === targetId)
    if (!target) return
    const rule = ruleFromFinding(finding)
    await updatePipeline(targetId, {
      detect: { ...target.detect, textRules: [...target.detect.textRules, rule] },
    })
    setAdded(`Added "${rule.find}" to ${target.label || 'Untitled pipeline'}.`)
  }

  return (
    <div className="slopPage formPage screenFrame">
      <h2>Slop-dentifier</h2>

      <div className="slopBody screenBody">
        <div className="slopInput">
          <label className="grow">
            Text
            <textarea
              className="slopTextarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a reply here."
            />
          </label>

          <div className="slopControls">
            <label>
              Pipeline
              <select
                className="slopPipelinePicker"
                value={pipelineId ?? ''}
                onChange={(e) => setPipelineId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">None</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || 'Untitled pipeline'}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!text.trim()}
              onClick={() => {
                setAdded('')
                setAnalysed(text)
              }}
            >
              <RiSearchEyeLine size={16} />
              Analyse
            </button>
          </div>

          <p className="slopHint">
            The rules run in this tab. Nothing is sent and the text you paste is not stored.
          </p>
          {!pipelines.length && (
            <p className="slopHint">
              No pipelines. Rules and the slop list come from one, so there is nothing to find
              until you make a pipeline or import one.
            </p>
          )}
        </div>

        <div className="slopReport">
          {!report && <p className="slopHint">Paste text and press Analyse.</p>}

          {report && (
            <>
              <div className="slopStats">
                <span>{report.stats.words} words</span>
                <span>{tokens} tokens</span>
                <span>score {report.score.total.toFixed(1)}</span>
              </div>

              {report.edited && (
                <p className="slopHint">
                  Punctuation and the hammer&apos;s strip rules changed the text below. Spans are
                  against that version.
                </p>
              )}

              <Highlighted text={report.cleaned} findings={report.findings} />

              {report.stats.repeatedPhrases.length > 0 && (
                <div className="slopPhrases">
                  <h3>Repeated phrases</h3>
                  <ul className="slopPhraseList">
                    {report.stats.repeatedPhrases.map((p) => (
                      <li key={p.phrase}>
                        {p.phrase} <span className="slopCount">×{p.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <h3>
                Findings <span className="slopCount">{report.findings.length}</span>
              </h3>
              {added && <p className="slopHint">{added}</p>}
              {!report.findings.length && <p className="slopHint">No findings.</p>}
              <ul className="slopFindings">
                {report.findings.map((f, i) => (
                  <FindingRow
                    key={`${f.source}-${f.span?.start ?? 'n'}-${i}`}
                    finding={f}
                    text={report.cleaned}
                    pipelines={pipelines}
                    onAdd={(p) => {
                      if (p.id != null) addRule(f, p.id)
                    }}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
