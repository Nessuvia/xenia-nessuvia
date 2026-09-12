import { RiCloseLine } from '@remixicon/react'
import { defaultPalettePrompt } from '../../core/palette/palettePrompt'
import { useSettings } from '../../core/stores/settingsStore'

/** The prompt we send to the LLM. Autosaves like every other setting. Reset clears the stored
 *  string: an empty string is what makes the built-in prompt apply again. */
export default function PalettePromptModal({ onClose }: { onClose: () => void }) {
  const palettePrompt = useSettings((s) => s.palettePrompt)
  const setPalettePrompt = useSettings((s) => s.setPalettePrompt)

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog palettePromptDialog" onClick={(e) => e.stopPropagation()}>
        <div className="palettePromptHead">
          <h3>Palette prompt</h3>
          <button type="button" title="Close" onClick={onClose}>
            <RiCloseLine size={16} />
          </button>
        </div>

        <textarea
          value={palettePrompt || defaultPalettePrompt}
          rows={20}
          onChange={(e) => setPalettePrompt(e.target.value)}
        />

        <div className="dialogActions">
          <button
            type="button"
            disabled={!palettePrompt}
            onClick={() => setPalettePrompt('')}
          >
            Reset to default
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
