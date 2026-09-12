import { useState } from 'react'
import type { Chapter } from '../../core/storage/types'
import { useWrite } from '../../core/stores/writeStore'
import { chapterProse, hasProse } from '../../core/prompt/chapterGuide'
import './plotLayout.css'

/**
 * Chapter generation: the beats of one chapter.
 *
 * Same plumbing as the Story outline, narrower scope. The chapter's own title and summary are the
 * required input and are already on the record. The dialog opens on the optional half: what the
 * author wants from it, how long it runs, how many beats to break it into. The story's premise,
 * themes and ending and the previous chapter go in automatically and are never retyped.
 */
export function ChapterOutlineDialog({
  chapter,
  index,
  onClose,
}: {
  chapter: Chapter
  index: number
  onClose: () => void
}) {
  const story = useWrite((s) => s.story)
  const chapters = useWrite((s) => s.chapters)
  const generateChapterOutline = useWrite((s) => s.generateChapterOutline)
  const updateChapter = useWrite((s) => s.updateChapter)

  const [notes, setNotes] = useState('')
  const [beats, setBeats] = useState(0)
  const [targetWords, setTargetWords] = useState(chapter.targetWords || 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const previous = index > 0 ? chapters[index - 1] : undefined
  const existing = chapter.blocks.length

  const run = async () => {
    // The beats go, and so does the prose written into them.
    if (
      existing > 0 &&
      !confirm(
        hasProse(chapter)
          ? `Replace all ${existing} beats in this chapter and the prose in them?`
          : `Replace all ${existing} beats in this chapter?`,
      )
    )
      return

    setBusy(true)
    setError('')
    try {
      // The target is the chapter's own field. A run that fails still leaves the number where
      // the author put it.
      if (targetWords !== chapter.targetWords) await updateChapter(chapter.id!, { targetWords })
      await generateChapterOutline(chapter.id!, {
        chapterNumber: index + 1,
        title: chapter.title,
        summary: chapter.summary,
        beats,
        targetWords,
        notes,
        premise: story?.premise ?? '',
        themes: story?.themes ?? '',
        ending: story?.ending ?? '',
        previousSummary: previous?.summary ?? '',
        previousProse: previous ? chapterProse(previous) : '',
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="dialogBackdrop" onClick={busy ? undefined : onClose}>
      <div className="dialog outlineDialog" onClick={(e) => e.stopPropagation()}>
        <h3>
          Generate beats for chapter {index + 1}
          {chapter.title.trim() ? `, ${chapter.title.trim()}` : ''}
        </h3>
        <p className="hint">
          {chapter.summary.trim()
            ? chapter.summary.trim()
            : 'This chapter has no summary. The beats will come from the notes and the story alone.'}
        </p>

        <label className="outlineField">
          <span>Notes</span>
          <textarea
            rows={4}
            value={notes}
            autoFocus
            placeholder="Anything you want in this chapter."
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="outlineNumbers">
          <label className="outlineField">
            <span>Words</span>
            <input
              type="number"
              min={0}
              step={100}
              value={targetWords || ''}
              placeholder="0"
              onChange={(e) => setTargetWords(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
          <label className="outlineField">
            <span>Beats</span>
            <input
              type="number"
              min={0}
              max={40}
              value={beats}
              onChange={(e) => setBeats(Math.max(0, Math.min(40, Number(e.target.value) || 0)))}
            />
            <span className="hint">0 lets the model choose.</span>
          </label>
        </div>
        <p className="hint">
          The words are split across the beats by how long the model makes each one.
        </p>

        <p className="hint">
          {previous
            ? `Chapter ${index} goes in as context, ${hasProse(previous) ? 'its prose' : 'its summary'}.`
            : 'This is the first chapter. There is nothing before it to carry in.'}
        </p>

        {error ? (
          <p className="error">{error}</p>
        ) : (
          existing > 0 && <p className="hint">Replaces the {existing} beats this chapter has.</p>
        )}

        <div className="dialogActions">
          <button type="button" className="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={run}>
            {busy ? 'Generating…' : 'Generate beats'}
          </button>
        </div>
      </div>
    </div>
  )
}
