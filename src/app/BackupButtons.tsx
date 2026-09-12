import { useState } from 'react'
import { RiDownloadLine, RiUploadLine } from '@remixicon/react'
import { buildBackup, downloadBackup, parseBackup, restoreBackup } from '../core/storage/backup'
import { useSettings } from '../core/stores/settingsStore'
import { useCloseOnOutside } from './useCloseOnOutside'
import './BackupButtons.css'

/**
 * Import and export buttons, used in the sidebar and on the online sync page.
 * Import clears every table in the database.
 * `className` is passed by the caller: the sidebar and the sync page style the buttons differently.
 */
export default function BackupButtons({ className }: { className: string }) {
  const exportKeys = useSettings((s) => s.exportKeys)
  const [choosing, setChoosing] = useState(false)
  const menuRef = useCloseOnOutside<HTMLSpanElement>(choosing, () => setChoosing(false))
  return (
    <>
      {/* File inputs can't be styled; the label is the button. */}
      <label className={className}>
        <RiUploadLine size={18} />
        Import
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!confirm('Import replaces all data in this browser. Continue?')) return
            // Parsed before the confirm's work begins: a bad file must not get as far as
            // clearing a table. Failures are silent otherwise, nothing renders this throw.
            let backup
            try {
              backup = parseBackup(await file.text())
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Not a backup file.')
              return
            }
            await restoreBackup(backup)
            location.reload()
          }}
        />
      </label>

      <span className="exportMenuWrap" ref={menuRef}>
        <button
          type="button"
          className={className}
          onClick={async () => {
            // Without keys in the file there is one sensible export. Skip the menu.
            if (!exportKeys) return downloadBackup(await buildBackup())
            setChoosing((v) => !v)
          }}
        >
          <RiDownloadLine size={18} />
          Export
        </button>

        {choosing && (
          <div className="panel exportMenu">
            <button
              type="button"
              onClick={async () => {
                setChoosing(false)
                downloadBackup(await buildBackup({ keys: true }))
              }}
            >
              Export all
            </button>
            <button
              type="button"
              onClick={async () => {
                setChoosing(false)
                downloadBackup(await buildBackup({ shareable: true }), '-shareable')
              }}
            >
              Export sanitized
            </button>
          </div>
        )}
      </span>
    </>
  )
}
