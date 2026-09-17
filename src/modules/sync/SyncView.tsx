import { useState, type CSSProperties, type ReactNode } from 'react'
import BackupButtons from '../../app/BackupButtons'
import { usePalette } from '../../core/stores/palettesStore'
import { tableNames, type TableName } from '../../core/storage/storageInterface'
import { useSettings } from '../../core/stores/settingsStore'
import { bucketConfigured, type BucketConfig } from '../../core/sync/bucketConfig'
import { connectDropbox, forgetAccessToken } from '../../core/sync/dropboxAuth'
import { testDropbox } from '../../core/sync/dropboxClient'
import { dropboxConfigured } from '../../core/sync/dropboxConfig'
import { r2AccountId, r2Endpoint, r2Region } from '../../core/sync/r2Endpoint'
import { testBucket } from '../../core/sync/s3Client'
import type { SyncProvider } from '../../core/sync/syncTypes'
import {
  useSync,
  type Direction,
  type Progress,
  type TableComparison,
} from '../../core/sync/syncStore'

/** Both all-tables buttons act on every table. The decision map is one direction across the
 *  board. Kept for the case where the user knows which side is right and skips the comparison. */
function allTables(direction: Direction): Record<TableName, Direction> {
  return Object.fromEntries(tableNames.map((t) => [t, direction])) as Record<TableName, Direction>
}

function stamp(at: number | null): string {
  return at === null ? '' : new Date(at).toLocaleString()
}

const verdictLabel: Record<TableComparison['verdict'], string> = {
  identical: 'Same on both sides',
  localOnly: 'Changed here',
  cloudOnly: 'Changed in the bucket',
  both: 'Changed on both sides',
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
          <header className="syncHead">
            <h2>Online Sync</h2>
            <p className="syncLede">
              Copies your library to storage you own. Settings, connections and API keys stay on
              this device unless you upload them separately.
            </p>
          </header>

          <R2Section />
          <DropboxSection />
          <DriveSection />
          <BackupSection />
        </div>
      </div>
    </div>
  )
}

/** `provider` turns the header into the picker: both providers can be set up, and the radio says
 *  which one a run uses. Sections without one (export, Drive) leave it out. */
function Section({
  title,
  status,
  provider,
  children,
}: {
  title: string
  status: string
  provider?: SyncProvider
  children: ReactNode
}) {
  const active = useSettings((s) => s.syncProvider)
  const setProvider = useSettings((s) => s.setSyncProvider)
  return (
    // `card` is the skin contract: skins repaint it, sync.css sets the base paint.
    <section className="syncSection card">
      <div className="syncSectionHead">
        <h3>{title}</h3>
        {provider && (
          <label className="syncPick">
            <input
              type="radio"
              name="syncProvider"
              checked={active === provider}
              onChange={() => setProvider(provider)}
            />
            Use for sync
          </label>
        )}
        <span className="syncStatus">{status}</span>
      </div>
      {children}
    </section>
  )
}

function R2Section() {
  const status = useSync((s) => s.status)
  const clearError = useSync((s) => s.clearError)
  const bucket = useSettings((s) => s.bucket)
  const setBucket = useSettings((s) => s.setBucket)

  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok'>('idle')
  // A saved endpoint that isn't R2's opens as the six-field form. An existing Garage or B2
  // config still edits as itself. A blank one is a fresh install, which starts on R2.
  const [showAll, setShowAll] = useState(
    () => Boolean(bucket.endpoint) && r2AccountId(bucket.endpoint) === null,
  )

  const busy = status !== 'idle'
  const ready = bucketConfigured(bucket)
  // Same fields bucketConfigured checks, named the way the visible form names them. `prefix` is
  // empty and isn't in either list.
  const fields: [keyof BucketConfig, string][] = showAll
    ? [['endpoint', 'Endpoint'], ['region', 'Region']]
    : [['endpoint', 'Account ID']]
  fields.push(['bucket', 'Bucket'], ['accessKeyId', 'Access key'], ['secretAccessKey', 'Secret key'])
  const missing = fields.filter(([field]) => !bucket[field]).map(([, label]) => label)

  function change(patch: Partial<BucketConfig>) {
    setBucket(patch)
    setTestState('idle')
  }

  async function runTest() {
    setTestState('testing')
    clearError()
    try {
      await testBucket(bucket)
      setTestState('ok')
    } catch (err) {
      setTestState('idle')
      useSync.setState({ error: err instanceof Error ? err.message : 'Could not reach the bucket.' })
    }
  }

  return (
    <Section
      title="Cloudflare R2"
      provider="s3"
      status={testState === 'ok' ? 'Connected' : ready ? 'Configured' : 'Not set up'}
    >
      {showAll ? (
        <BucketForm bucket={bucket} onChange={change} />
      ) : (
        <R2Form bucket={bucket} onChange={change} />
      )}

      <button type="button" className="syncLinkButton" onClick={() => setShowAll(!showAll)}>
        {showAll ? 'Use Cloudflare R2' : 'Other S3-compatible provider'}
      </button>

      <SetupSteps />

      <div className="syncActions">
        {/* A disabled button on its own is a dead end: everything below here is hidden until the
            config is complete. The reason has to be on screen. */}
        {missing.length > 0 && <span className="syncNote">Still needed: {missing.join(', ')}.</span>}
        <button type="button" onClick={runTest} disabled={!ready || busy || testState === 'testing'}>
          {testState === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
      </div>

      {ready && <SyncActions provider="s3" where="bucket" />}
    </Section>
  )
}

/**
 * Everything that moves data, shown under whichever provider is selected. Both sections render it
 * and the inactive one renders nothing: one comparison and one progress bar belong to the run, not
 * to a provider, and two sets on screen would leave the user reading the wrong one.
 */
function SyncActions({ provider, where }: { provider: SyncProvider; where: string }) {
  const { status, error, progress, comparison, compare, apply, clearError } = useSync()
  const active = useSettings((s) => s.syncProvider)
  const lastSyncedAt = useSettings((s) => s.lastSyncedAt)
  const [decisions, setDecisions] = useState<Partial<Record<TableName, Direction>>>({})

  if (active !== provider) return null
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
            ['Upload all', () => apply(allTables('push'), 'push')],
            ['Upload w/o settings', () => apply(allTables('push'))],
          ]}
        />
        <SplitButton
          busy={busy}
          actions={[
            ['Download all', () => apply(allTables('pull'), 'pull')],
            ['Download settings', () => apply({}, 'pull')],
            ['Download content', () => apply(allTables('pull'))],
          ]}
        />
        {lastSyncedAt !== null && <span className="syncNote">Last synced {stamp(lastSyncedAt)}</span>}
      </div>

      <p className="syncNote">
        Settings include your connections and their API keys, the credentials for this {where}, and
        the Ask scratchpad. They're written as plain text, readable by anyone who can read the{' '}
        {where} and by the provider hosting it. Downloading them replaces the settings in this
        browser, apart from the sync details.
      </p>

      {comparison && (
        <ComparisonTable
          comparison={comparison}
          decisions={decisions}
          busy={busy}
          onDecide={(table, direction) => setDecisions((d) => ({ ...d, [table]: direction }))}
          // The radios show `suggested` as pre-selected. Apply has to act on it. Only an
          // explicit click lands in `decisions`; without this merge a pre-filled row would look
          // chosen and then be skipped.
          onApply={() => {
            const merged: Partial<Record<TableName, Direction>> = {}
            for (const [name, c] of Object.entries(comparison) as [TableName, TableComparison][]) {
              const chosen = decisions[name] ?? c.suggested
              if (chosen) merged[name] = chosen
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
 * button cancels, the same pattern as the regex conversion in RuleBuilder. Upload overwrites the
 * bucket and download overwrites this browser: neither should be one stray click away.
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

/** R2's endpoint is its account ID in a fixed hostname and its region is always `auto`. Those
 *  two fields are filled in rather than asked for. The stored BucketConfig is the same either way:
 *  nothing below this component knows which form wrote it. */
function R2Form({
  bucket,
  onChange,
}: {
  bucket: BucketConfig
  onChange(patch: Partial<BucketConfig>): void
}) {
  return (
    <div className="syncBucket">
      <label>
        Account ID
        <input
          value={r2AccountId(bucket.endpoint) ?? ''}
          onChange={(e) => onChange({ endpoint: r2Endpoint(e.target.value), region: r2Region })}
          placeholder="From the R2 dashboard"
          spellCheck={false}
        />
      </label>
      <label>
        Bucket
        <input
          value={bucket.bucket}
          onChange={(e) => onChange({ bucket: e.target.value })}
          spellCheck={false}
        />
      </label>
      <label>
        Access key
        <input
          value={bucket.accessKeyId}
          onChange={(e) => onChange({ accessKeyId: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Secret key
        <input
          type="password"
          value={bucket.secretAccessKey}
          onChange={(e) => onChange({ secretAccessKey: e.target.value })}
          autoComplete="off"
        />
      </label>
      <label>
        Folder
        <input
          value={bucket.prefix}
          onChange={(e) => onChange({ prefix: e.target.value })}
          placeholder="Optional"
          spellCheck={false}
        />
      </label>
    </div>
  )
}

/**
 * The CORS policy is the step that goes wrong, and it fails as a blocked preflight the browser
 * won't explain. Built from location.origin so it's right for whichever build is running.
 */
function SetupSteps() {
  const [copied, setCopied] = useState(false)
  const policy = JSON.stringify(
    [
      {
        AllowedOrigins: [location.origin],
        AllowedMethods: ['GET', 'PUT', 'HEAD', 'DELETE'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['x-amz-meta-hash'],
      },
    ],
    null,
    2,
  )

  return (
    <details className="syncSetup">
      <summary>Bucket setup</summary>
      <ol>
        <li>Create a bucket in the Cloudflare R2 dashboard.</li>
        <li>
          Create an R2 API token: an Account API token, Object Read &amp; Write, scoped to that
          bucket only.
        </li>
        <li>
          Paste the account ID, the bucket name, and both halves of the token, the access key ID
          and the secret access key.
        </li>
        <li>Add this CORS policy to the bucket:</li>
      </ol>
      <pre>{policy}</pre>
      <button
        type="button"
        className="syncLinkButton"
        onClick={() => {
          navigator.clipboard.writeText(policy)
          setCopied(true)
        }}
      >
        {copied ? 'Copied' : 'Copy policy'}
      </button>
      <p className="syncNote">
        Without the policy the browser blocks every request before it is sent. Press Test connection
        once the policy is saved.
      </p>
    </details>
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
    useSync.setState({ error: err instanceof Error ? err.message : 'Could not reach Dropbox.' })
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
      provider="dropbox"
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

      <DropboxSetupSteps />

      {connected && <SyncActions provider="dropbox" where="account" />}
    </Section>
  )
}

/** What signing in gives Dropbox access to, and what it doesn't. The app registration is built
 *  into this copy of the app, so there's nothing here for the user to set up. */
function DropboxSetupSteps() {
  return (
    <details className="syncSetup">
      <summary>What this connects to</summary>
      <p className="syncNote">
        Connect opens Dropbox in a new window and asks for access to one folder,
        Apps/Xenia Nessuvia, inside your own Dropbox. The app cannot read the rest of your files.
      </p>
      <p className="syncNote">
        Your library is written there as JSON files, one per table. They are the same files Export
        writes, so you can open them, copy them, or keep your own backups of them. Nothing passes
        through a server of ours.
      </p>
      <p className="syncNote">
        Disconnect removes the sign-in from this browser. To revoke it everywhere, remove the app
        under Connected apps in your Dropbox account settings.
      </p>
    </details>
  )
}

function DriveSection() {
  return (
    <Section title="Google Drive" status="Not supported">
      <p className="syncNote">
        Google puts Drive access behind an app review. This app has not been through it.
      </p>
    </Section>
  )
}

function BackupSection() {
  return (
    <Section title="Export and import" status="Always available">
      <p className="syncNote">
        Export writes your whole library to a JSON file, and Import reads one back. Both work
        without any of this. Importing replaces everything in this browser.
      </p>
      <div className="syncBackupRow">
        <BackupButtons className="syncBackupButton" />
      </div>
    </Section>
  )
}

function BucketForm({
  bucket,
  onChange,
}: {
  bucket: BucketConfig
  onChange(patch: Partial<BucketConfig>): void
}) {
  return (
    <div className="syncBucket">
      <label>
        Endpoint
        <input
          value={bucket.endpoint}
          onChange={(e) => onChange({ endpoint: e.target.value })}
          placeholder="http://localhost:3900"
          spellCheck={false}
        />
      </label>
      <label>
        Bucket
        <input
          value={bucket.bucket}
          onChange={(e) => onChange({ bucket: e.target.value })}
          spellCheck={false}
        />
      </label>
      <label>
        Region
        <input
          value={bucket.region}
          onChange={(e) => onChange({ region: e.target.value })}
          spellCheck={false}
        />
      </label>
      <label>
        Folder
        <input
          value={bucket.prefix}
          onChange={(e) => onChange({ prefix: e.target.value })}
          placeholder="Optional"
          spellCheck={false}
        />
      </label>
      <label>
        Access key
        <input
          value={bucket.accessKeyId}
          onChange={(e) => onChange({ accessKeyId: e.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label>
        Secret key
        <input
          type="password"
          value={bucket.secretAccessKey}
          onChange={(e) => onChange({ secretAccessKey: e.target.value })}
          autoComplete="off"
        />
      </label>
    </div>
  )
}

/**
 * The per-table decision list. A table changed on both sides has no suggestion and no default.
 * `apply` refuses until every one of them has a direction. This is where that gets answered.
 */
function ComparisonTable({
  comparison,
  decisions,
  busy,
  onDecide,
  onApply,
}: {
  comparison: Partial<Record<TableName, TableComparison>>
  decisions: Partial<Record<TableName, Direction>>
  busy: boolean
  onDecide(table: TableName, direction: Direction): void
  onApply(): void
}) {
  const rows = (Object.entries(comparison) as [TableName, TableComparison][]).filter(
    ([, c]) => c.verdict !== 'identical',
  )

  if (!rows.length) return <p className="syncNote">Everything matches the bucket.</p>

  return (
    <div className="syncComparison">
      {rows.map(([table, c]) => {
        const chosen = decisions[table] ?? c.suggested
        return (
          <div className="syncRow" key={table}>
            <span className="syncRowName">{table}</span>
            <span className="syncNote">{verdictLabel[c.verdict]}</span>
            <label>
              <input
                type="radio"
                name={`dir-${table}`}
                checked={chosen === 'push'}
                onChange={() => onDecide(table, 'push')}
              />
              Upload
            </label>
            <label>
              <input
                type="radio"
                name={`dir-${table}`}
                checked={chosen === 'pull'}
                onChange={() => onDecide(table, 'pull')}
              />
              Download
            </label>
          </div>
        )
      })}
      <div className="syncActions">
        <PrimedButton label={busy ? 'Working…' : 'Apply'} onFire={onApply} disabled={busy} />
        <span className="syncNote">Downloading a table replaces it in this browser.</span>
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
