import { useState } from 'react'
import { RiCloseLine } from '@remixicon/react'
import { fetchCard } from '../../core/connectors/fetchCard'
import { importCard } from '../../core/cards/importCard'
import { Avatar } from '../../app/Avatar'

/** Import a character card from a URL. Generic URLs must return raw JSON; characterhub.org /
 *  chub.ai and aicharactercards.com pages are fetched through their download APIs. Preview
 *  validates before Import. */
export default function ImportUrlModal({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (json: unknown, avatar: string) => void
}) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // holds the parsed card + avatar (for Import) and the display fields (for the preview row)
  const [preview, setPreview] = useState<{
    json: unknown
    avatar: string
    name: string
    description: string
  } | null>(null)

  async function runPreview() {
    setError('')
    setPreview(null)
    setBusy(true)
    try {
      const { json, avatar } = await fetchCard(url.trim())
      const card = importCard(json) // throws if it isn't a character card
      setPreview({ json, avatar, name: card.name, description: card.description })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const truncated =
    preview && preview.description.length > 24
      ? preview.description.slice(0, 24) + '…'
      : preview?.description || '--'

  return (
    <div className="dialogBackdrop" onClick={onClose}>
      <div className="panel dialog importUrlDialog" onClick={(e) => e.stopPropagation()}>
        <div className="palettePromptHead">
          <h3>Import via URL</h3>
          <button type="button" title="Close" onClick={onClose}>
            <RiCloseLine size={16} />
          </button>
        </div>

        <input
          type="text"
          placeholder="Raw JSON link, a characterhub.org or aicharactercards.com page, or an AICC card id"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setPreview(null)
            setError('')
          }}
        />

        {error && <p className="error">{error}</p>}

        {preview && (
          <div className="importUrlPreview">
            <Avatar of={{ avatar: preview.avatar }} name={preview.name || '?'} />
            <div>
              <div>
                <strong>Name:</strong> {preview.name}
              </div>
              <div>
                <strong>Description:</strong> {truncated}
              </div>
            </div>
          </div>
        )}

        <div className="dialogActions">
          <button type="button" onClick={runPreview} disabled={busy || !url.trim()}>
            {busy ? 'Loading…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={!preview}
            onClick={() => preview && onImport(preview.json, preview.avatar)}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}
