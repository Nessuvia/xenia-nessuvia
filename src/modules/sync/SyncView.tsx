import { RiArrowRightSLine } from '@remixicon/react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import BackupButtons from '../../app/BackupButtons'
import PageHeader from '../../app/PageHeader'
import { usePalette } from '../../core/stores/palettesStore'
import { useSettings } from '../../core/stores/settingsStore'
import { connectDropbox, forgetAccessToken } from '../../core/sync/dropboxAuth'
import { testDropbox } from '../../core/sync/dropboxClient'
import { dropboxConfigured } from '../../core/sync/dropboxConfig'
import { useSync, type Direction, type FileComparison, type Progress } from '../../core/sync/syncStore'

function stamp(at: number | null): string {
  return at === null ? '' : new Date(at).toLocaleString()
}

function verdictLabel(c: FileComparison): string {
  if (c.verdict === 'both') return 'Changed on both sides'
  if (c.verdict === 'localOnly') return c.here ? 'Changed here' : 'Deleted here'
  return c.there ? 'Changed in Dropbox' : 'Deleted in Dropbox'
}

export default function SyncView() {
  const palette = usePalette()
  return (
    <div className="sync screenFrame">
      {/* The frame stays put and this one child scrolls, the setup disclosure makes the page
          taller than the viewport as soon as it opens. */}
      <div className="syncFormal screenBody">
        {/* Follows the palette's chat width, the same var chat reads. Global rather than per-page:
            reading width is one preference, and a Sync-only override would be a knob nobody asked
            for. */}
        <div
          className="syncColumn"
          style={{ '--chatWidth': `${palette.chatWidth}%` } as CSSProperties}
        >
          <PageHeader
            title="Online Sync"
            hint="Copies your library to your Dropbox. Settings upload separately."
          />

          <DropboxSection />
          <BackupSection />
        </div>
      </div>
    </div>
  )
}

/**
 * One collapsible card. `<details>` does the collapsing: it's a disclosure, and the browser
 * already has one.
 */
function Section({
  title,
  status,
  startOpen = false,
  children,
}: {
  title: string
  status: string
  startOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(startOpen)

  return (
    // `card` is the skin contract: skins repaint it, sync.css sets the base paint.
    <details
      className="syncSection card"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="syncSectionHead">
        <RiArrowRightSLine className="syncChevron" size={16} aria-hidden />
        <h3>{title}</h3>
        <span className="syncStatus">{status}</span>
      </summary>

      {/* One wrapper so the rows get a gap: the card's own gap only reaches the summary and the
          slot a <details> lays its body out in. */}
      <div className="syncSectionBody">
        {children}
      </div>
    </details>
  )
}

/** Everything that moves data. */
function SyncActions() {
  const { status, error, progress, comparison, compare, apply, applyAll, clearError } = useSync()
  const lastSyncedAt = useSettings((s) => s.lastSyncedAt)
  const [decisions, setDecisions] = useState<Record<string, Direction>>({})

  const busy = status !== 'idle'

  return (
    <>
      <div className="syncActions">
        <button
          type="button"
          onClick={() => {
            setDecisions({})
            compare()
          }}
          disabled={busy}
        >
          {status === 'comparing' ? 'Comparing…' : 'Compare'}
        </button>
        <SplitButton
          busy={busy}
          actions={[
            ['Upload all', () => applyAll('push', 'push')],
            ['Upload w/o settings', () => applyAll('push')],
          ]}
        />
        <SplitButton
          busy={busy}
          actions={[
            ['Download all', () => applyAll('pull', 'pull')],
            ['Download settings', () => apply({}, 'pull')],
            ['Download content', () => applyAll('pull')],
          ]}
        />
        {lastSyncedAt !== null && <span className="syncNote">Last synced {stamp(lastSyncedAt)}</span>}
      </div>

      <p className="syncNote">
        Settings include your connections and their API keys, and the Ask scratchpad. They're
        written as plain text, readable by anyone who can read this Dropbox account. Downloading
        them replaces the settings in this browser, apart from the sync details.
      </p>

      {comparison && (
        <ComparisonTable
          comparison={comparison}
          decisions={decisions}
          busy={busy}
          onDecide={(path, direction) => setDecisions((d) => ({ ...d, [path]: direction }))}
          // The radios show `suggested` as pre-selected. Apply has to act on it. Only an
          // explicit click lands in `decisions`; without this merge a pre-filled row would look
          // chosen and then be skipped.
          onApply={() => {
            const merged: Record<string, Direction> = {}
            for (const c of comparison) {
              const chosen = decisions[c.path] ?? c.suggested
              if (chosen) merged[c.path] = chosen
            }
            apply(merged)
          }}
        />
      )}

      {progress && <RunProgress progress={progress} />}

      {error && <SyncError error={error} onDismiss={clearError} />}
    </>
  )
}

/**
 * Every button that moves data is primed by the first click and fired by the second. Leaving the
 * button cancels, the same pattern as the regex conversion in RuleBuilder. Upload overwrites
 * Dropbox and download overwrites this browser: neither should be one stray click away.
 */
function PrimedButton({
  label,
  onFire,
  disabled,
  className,
}: {
  label: string
  onFire(): void
  disabled?: boolean
  className?: string
}) {
  const [primed, setPrimed] = useState(false)
  return (
    <button
      type="button"
      className={[className, primed ? 'danger' : ''].filter(Boolean).join(' ') || undefined}
      disabled={disabled}
      onBlur={() => setPrimed(false)}
      onClick={() => {
        if (!primed) return setPrimed(true)
        setPrimed(false)
        onFire()
      }}
    >
      {primed ? `${label}?` : label}
    </button>
  )
}

/**
 * The first action is the button; the rest sit in a menu under it, shown on hover and on
 * focus-within. No open state: priming the main button focuses it, which is the same one tap that
 * opens the menu on a touch screen.
 */
function SplitButton({ actions, busy }: { actions: [string, () => void][]; busy: boolean }) {
  const [[mainLabel, mainFire], ...rest] = actions
  return (
    <div className="syncSplit">
      <PrimedButton className="syncSplitMain" label={mainLabel} onFire={mainFire} disabled={busy} />
      <div className="syncSplitMenu">
        {rest.map(([label, fire]) => (
          <PrimedButton
            key={label}
            className="syncSplitItem"
            label={label}
            onFire={fire}
            disabled={busy}
          />
        ))}
      </div>
    </div>
  )
}

/** One line, replaced as the run moves on. Nothing is kept: the only line worth reading twice is a
 *  failure, and that one is left standing. */
function RunProgress({ progress }: { progress: Progress }) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="syncProgress">
      <div className="syncProgressTrack">
        <div
          className={progress.failed ? 'syncProgressBar syncProgressBarFailed' : 'syncProgressBar'}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="syncProgressRow">
        <span
          className={progress.failed ? 'syncProgressLine syncProgressLineFailed' : 'syncProgressLine'}
        >
          {progress.label}
        </span>
        <span className="syncProgressPercent">{percent}%</span>
      </div>
    </div>
  )
}

function DropboxSection() {
  const status = useSync((s) => s.status)
  const clearError = useSync((s) => s.clearError)
  const dropbox = useSettings((s) => s.dropbox)
  const setDropbox = useSettings((s) => s.setDropbox)
  const [state, setState] = useState<'idle' | 'working' | 'ok'>('idle')

  const connected = dropboxConfigured(dropbox)
  const busy = status !== 'idle' || state === 'working'

  function failed(err: unknown) {
    setState('idle')
    useSync.setState({ error: err instanceof Error ? err.message : "Couldn't reach Dropbox." })
  }

  async function connect() {
    setState('working')
    clearError()
    try {
      setDropbox(await connectDropbox())
      setState('ok')
    } catch (err) {
      failed(err)
    }
  }

  async function runTest() {
    setState('working')
    clearError()
    try {
      await testDropbox()
      setState('ok')
    } catch (err) {
      failed(err)
    }
  }

  // Local only. Revoking the app's access is done from the Dropbox account page, and saying so
  // beats a button that looks like it did more than it did.
  function disconnect() {
    forgetAccessToken()
    setDropbox({ refreshToken: '', account: '' })
    setState('idle')
  }

  return (
    <Section
      title="Dropbox"
      startOpen
      status={state === 'ok' ? 'Connected' : connected ? 'Signed in' : 'Not set up'}
    >
      <div className="syncActions">
        {connected ? (
          <>
            <span className="syncNote">
              Signed in{dropbox.account ? ` as ${dropbox.account}` : ''}.
            </span>
            <button type="button" onClick={runTest} disabled={busy}>
              {state === 'working' ? 'Checking…' : 'Test connection'}
            </button>
            <PrimedButton label="Disconnect" onFire={disconnect} disabled={busy} />
          </>
        ) : (
          <button type="button" onClick={connect} disabled={busy}>
            {state === 'working' ? 'Waiting for Dropbox…' : 'Connect Dropbox'}
          </button>
        )}
      </div>

      {connected && (
        <div className="syncBucket">
          <label>
            Folder
            <input
              value={dropbox.folder}
              onChange={(e) => setDropbox({ folder: e.target.value })}
              placeholder="Optional"
              spellCheck={false}
            />
          </label>
        </div>
      )}

      {connected && <SyncActions />}
    </Section>
  )
}

function BackupSection() {
  return (
    <Section title="Export and import" status="Always available" startOpen>
      <p className="syncNote">
        Writes to a ZIP file; importing replaces everything in the browser.
      </p>
      <div className="syncBackupRow">
        <BackupButtons className="syncBackupButton" />
      </div>
    </Section>
  )
}

/**
 * The per-file decision list. A file changed on both sides has no suggestion and no default.
 * `apply` refuses until every one of them has a direction. This is where that gets answered.
 */
function ComparisonTable({
  comparison,
  decisions,
  busy,
  onDecide,
  onApply,
}: {
  comparison: FileComparison[]
  decisions: Record<string, Direction>
  busy: boolean
  onDecide(path: string, direction: Direction): void
  onApply(): void
}) {
  if (!comparison.length) return <p className="syncNote">Everything matches Dropbox.</p>

  return (
    <div className="syncComparison">
      {/* Scrolls on its own so Apply stays in reach under a long list. */}
      <div className="syncComparisonRows">
        {comparison.map((c) => {
          const chosen = decisions[c.path] ?? c.suggested
          return (
            <div className="syncRow" key={c.path}>
              <span className="syncRowName">{c.label}</span>
              <span className="syncNote">{verdictLabel(c)}</span>
              <label>
                <input
                  type="radio"
                  name={`dir-${c.path}`}
                  checked={chosen === 'push'}
                  onChange={() => onDecide(c.path, 'push')}
                />
                Upload
              </label>
              <label>
                <input
                  type="radio"
                  name={`dir-${c.path}`}
                  checked={chosen === 'pull'}
                  onChange={() => onDecide(c.path, 'pull')}
                />
                Download
              </label>
            </div>
          )
        })}
      </div>
      <div className="syncActions">
        <PrimedButton label={busy ? 'Working…' : 'Apply'} onFire={onApply} disabled={busy} />
        <span className="syncNote">Downloading a file replaces what it holds in this browser.</span>
      </div>
    </div>
  )
}

function SyncError({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <p className="syncError">
      {error}
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </p>
  )
}
