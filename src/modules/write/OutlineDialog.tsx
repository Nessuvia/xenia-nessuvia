import { useState } from 'react'
import { resolveCast, useWrite } from '../../core/stores/writeStore'
import { customPreset, lengthPresets, presetFor } from './lengthPresets'
import './plotLayout.css'

/**
 * Story generation: the premise, and everything else the outline could use.
 *
 * Advanced View. Every field is laid out at once, with no wizard and no progressive disclosure. A
 * guided setup is the eventual front door onto this same state; nothing here is scaffolding for it.
 *
 * Reuses .dialogBackdrop / .dialog / .dialogActions from chat.css. Stays open on a failure so the
 * fields that produced it are still there to change.
 */
export function OutlineDialog({ onClose }: { onClose: () => void }) {
  const story = useWrite((s) => s.story)
  const chapterCount = useWrite((s) => s.chapters.length)
  const generateStoryOutline = useWrite((s) => s.generateStoryOutline)
  const setStoryFields = useWrite((s) => s.setStoryFields)
  const setPremise = useWrite((s) => s.setPremise)

  const [premise, setPremiseDraft] = useState(story?.premise ?? '')
  const [themes, setThemes] = useState(story?.themes ?? '')
  const [genre, setGenre] = useState(story?.genre ?? '')
  const [tone, setTone] = useState(story?.tone ?? '')
  const [setting, setSetting] = useState(story?.setting ?? '')
  const [ending, setEnding] = useState(story?.ending ?? '')
  const [targetWords, setTargetWords] = useState(story?.targetWords || 0)
  const [chapters, setChapters] = useState(chapterCount || 5)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const cast = resolveCast(story?.cast ?? [])
  const preset = presetFor(targetWords, chapters)

  const applyPreset = (id: string) => {
    const hit = lengthPresets.find((p) => p.id === id)
    if (!hit) return
    setTargetWords(hit.targetWords)
    setChapters(hit.chapters)
  }

  /**
   * The drafts, onto the Story. Every field here is already a Story field. There is nowhere else
   * for them to live and nothing to serialise: this is the same write `run` does, minus the request.
   *
   * Called on the way out as well as on Generate. Without it, typing a premise and closing the
   * dialog throws the premise away, and reopening shows the fields as they were before.
   */
  const persist = async () => {
    if (!story) return
    if (premise !== (story.premise ?? '')) await setPremise(premise)
    if (
      themes !== (story.themes ?? '') ||
      genre !== (story.genre ?? '') ||
      tone !== (story.tone ?? '') ||
      setting !== (story.setting ?? '') ||
      ending !== (story.ending ?? '') ||
      targetWords !== (story.targetWords || 0)
    ) {
      await setStoryFields({ themes, genre, tone, setting, ending, targetWords })
    }
  }

  const close = async () => {
    await persist()
    onClose()
  }

  const run = async () => {
    // Every chapter goes, prose included. Asked once, here, rather than on the button that opened
    // the dialog: the numbers above change what is about to replace them.
    if (chapterCount > 0 && !confirm(`Replace all ${chapterCount} chapters and the prose in them?`))
      return
    setBusy(true)
    setError('')
    try {
      // These are the Story's own fields rather than a copy that lives in the dialog: the Premise
      // cap on the strip edits the same premise, and a second run opens on what was asked for last
      // time.
      await persist()
      await generateStoryOutline({
        premise,
        chapters,
        targetWords,
        themes,
        genre,
        tone,
        setting,
        ending,
        cast: cast.map((c) => `${c.name}: ${c.description ?? ''}`.trim()),
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="dialogBackdrop" onClick={busy ? undefined : close}>
      <div className="dialog outlineDialog" onClick={(e) => e.stopPropagation()}>
        <h3>Generate story outline</h3>
        <p className="hint">Chapters and their summaries. Beats are generated per chapter.</p>

        <label className="outlineField">
          <span>Premise</span>
          <textarea
            rows={4}
            value={premise}
            autoFocus
            placeholder="What the story is about."
            onChange={(e) => setPremiseDraft(e.target.value)}
          />
        </label>

        <h4 className="outlineSection">Shape</h4>

        <label className="outlineField">
          <span>Themes</span>
          <textarea
            rows={2}
            value={themes}
            placeholder="What the story is meant to be about underneath."
            onChange={(e) => setThemes(e.target.value)}
          />
        </label>

        <div className="outlineNumbers">
          <label className="outlineField">
            <span>Genre</span>
            <input value={genre} onChange={(e) => setGenre(e.target.value)} />
          </label>
          <label className="outlineField">
            <span>Tone</span>
            <input value={tone} onChange={(e) => setTone(e.target.value)} />
          </label>
          <label className="outlineField">
            <span>Setting</span>
            <input value={setting} onChange={(e) => setSetting(e.target.value)} />
          </label>
        </div>

        <label className="outlineField">
          <span>Ending</span>
          <textarea
            rows={2}
            value={ending}
            placeholder="Where it all ends up."
            onChange={(e) => setEnding(e.target.value)}
          />
        </label>

        <h4 className="outlineSection">Length</h4>

        <div className="outlineNumbers">
          <label className="outlineField">
            <span>Form</span>
            <select value={preset} onChange={(e) => applyPreset(e.target.value)}>
              {preset === customPreset && <option value={customPreset}>Custom</option>}
              {lengthPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="outlineField">
            <span>Words</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={targetWords || ''}
              placeholder="0"
              onChange={(e) => setTargetWords(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label className="outlineField">
            <span>Chapters</span>
            <input
              type="number"
              min={1}
              max={60}
              value={chapters}
              onChange={(e) => setChapters(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
            />
          </label>
        </div>
        <p className="hint">
          Picking a form fills the numbers. Editing a number sets the form to Custom. The words are
          split across the chapters by how long the model makes each one.
        </p>

        <h4 className="outlineSection">Cast</h4>
        <p className="hint">
          {cast.length === 0
            ? 'No cast attached. Add characters in the Story panel.'
            : `Sent with the request: ${cast.map((c) => c.name).join(', ')}.`}
        </p>

        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="hint">Replaces every chapter in this story, and the prose in them.</p>
        )}

        <div className="dialogActions">
          {/* Close, not Cancel: the fields are kept either way. The label must not promise
              they are thrown away. */}
          <button type="button" className="secondary" disabled={busy} onClick={close}>
            Close
          </button>
          <button type="button" disabled={busy || !premise.trim()} onClick={run}>
            {busy ? 'Generating…' : 'Generate outline'}
          </button>
        </div>
      </div>
    </div>
  )
}
