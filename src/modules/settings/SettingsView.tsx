import { useCallback, useState } from 'react'
import { RiDeleteBinLine, RiFileCopyLine } from '@remixicon/react'
import type { Connection } from '../../core/stores/settingsStore'
import { newConnection, useSettings } from '../../core/stores/settingsStore'
import ConnectionEditor from './ConnectionEditor'
import TagRulesPanel from './TagRulesPanel'
import FindReplacePanel from './FindReplacePanel'
import SecondPassPanel from './SecondPassPanel'
import GoldPassPanel from './GoldPassPanel'
import RelayPanel from './RelayPanel'
import StImportPanel from './StImportPanel'
import { modules } from '../../app/moduleRegistry'
import { wipeEverything } from '../../core/storage/wipe'
import { useHashTab } from '../../app/useHashTab'
import TwoColumn from '../../app/TwoColumn'
import '../../app/formPage.css'
import './settings.css'

export { tabs } from './tabs'
import { tabs } from './tabs'

export default function SettingsView() {
  const {
    connections,
    activeConnectionId,
    addConnection,
    updateConnection,
    removeConnection,
    setActiveConnection,
    debugMode,
    setDebugMode,
    personaTitleOff,
    setPersonaTitleOff,
    customTitle,
    setCustomTitle,
    splashOff,
    setSplashOff,
    writeEnabled,
    setWriteEnabled,
    enabledPlugins,
    setPluginEnabled,
    exportKeys,
    setExportKeys,
  } = useSettings()
  const pluginModules = modules.filter((mod) => mod.plugin)
  const [editing, setEditing] = useState<Connection | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [tab, setTab] = useHashTab(tabs.map(([id]) => id))
  const [resetting, setResetting] = useState(false)
  const [resetPhrase, setResetPhrase] = useState('')
  const [keysPhrase, setKeysPhrase] = useState<string | null>(null)

  // The editor autosaves, so this runs repeatedly while typing: the first write adds the record,
  // every later one updates it in place. It stays open until the user closes it.
  const save = useCallback(
    (connection: Connection) => {
      if (isNew) {
        addConnection(connection)
        setIsNew(false)
      } else {
        updateConnection(connection)
      }
    },
    [isNew, addConnection, updateConnection],
  )

  return (
    <div className="settings formPage screenFrame">
      <h2>Settings</h2>

      <nav className="navbar pageTabs">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`pageTab${tab === id ? ' current' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'connections' ? (
        <TwoColumn
          list={
            <section>
              <div className="titleContainer">
                <h3>Connections</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsNew(true)
                    setEditing(newConnection())
                  }}
                >
                  Add connection
                </button>
              </div>
              <ul className="connectionList">
                {connections.map((c) => (
                  <li
                    key={c.id}
                    className={`card ${c.id === activeConnectionId ? 'active' : ''} ${
                      c.id === editing?.id ? 'editing' : ''
                    }`}
                    // Whole row opens the editor, clicking the open row closes it, same as the
                    // persona list. The controls inside stop the click so they don't toggle too.
                    onClick={() => {
                      setIsNew(false)
                      setEditing(c.id === editing?.id ? null : c)
                    }}
                  >
                    <span className="connectionName">{c.name}</span>
                    <span className="connectionUrl">{c.endpointUrl || 'no endpoint'}</span>
                    <span className="connectionActions">
                      {c.id === activeConnectionId ? (
                        <em>active</em>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveConnection(c.id)
                          }}
                        >
                          Set active
                        </button>
                      )}
                      {/* The copy carries the API key: it is the same account, and a copy you
                          have to re-key is not a copy. */}
                      <button
                        type="button"
                        className="connectionIconButton"
                        title="Copy"
                        aria-label="Copy"
                        onClick={(e) => {
                          e.stopPropagation()
                          addConnection({ ...c, id: crypto.randomUUID(), name: `${c.name} copy` })
                        }}
                      >
                        <RiFileCopyLine size={16} />
                      </button>
                      <button
                        type="button"
                        className="danger connectionIconButton"
                        title="Delete"
                        aria-label="Delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (c.id === editing?.id) setEditing(null)
                          removeConnection(c.id)
                        }}
                      >
                        <RiDeleteBinLine size={16} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              <StImportPanel />
            </section>
          }
          detail={
            editing && (
              <ConnectionEditor
                key={editing.id}
                connection={editing}
                onSave={save}
                onClose={() => setEditing(null)}
              />
            )
          }
        />
      ) : (
      <div className="screenBody">
      {tab === 'debug' ? (
        <div className="settingsCards">
          <section className="settingsCard">
            <h3>Debug</h3>
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
              />
              Debug mode
            </label>
            <p className="debugHint">
              Replies come from a local lorem ipsum generator. Requests are not sent to the connection.
            </p>
          </section>
          <section className="settingsCard">
            <h3>Title</h3>
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={personaTitleOff}
                onChange={(e) => setPersonaTitleOff(e.target.checked)}
              />
              Disable persona names in the title of the page.
            </label>
            {personaTitleOff && (
              <div className="titleRow">
                <input
                  type="text"
                  className="titleInput"
                  value={customTitle}
                  maxLength={80}
                  placeholder="Xenia Nessuvia"
                  onChange={(e) => setCustomTitle(e.target.value.slice(0, 80))}
                />
                <span className="charCount">{customTitle.length}/80</span>
              </div>
            )}
          </section>
          <section className="settingsCard">
            <h3>Loading animation</h3>
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={splashOff}
                onChange={(e) => setSplashOff(e.target.checked)}
              />
              Disable the logo animation on page load
            </label>
          </section>
          <section className="settingsCard">
            <h3>Write mode</h3>
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={writeEnabled}
                onChange={(e) => setWriteEnabled(e.target.checked)}
              />
              Write mode
            </label>
            <p className="debugHint">
              Off hides the Write tab and the Story prompt stack.
            </p>
          </section>
          <section className="settingsCard">
            <h3>Plugins</h3>
            {pluginModules.length === 0 ? (
              <p className="debugHint">No plugins installed.</p>
            ) : (
              pluginModules.map((mod) => (
                <label key={mod.id} className="debugToggle">
                  <input
                    type="checkbox"
                    checked={enabledPlugins[mod.id] === true}
                    onChange={(e) => setPluginEnabled(mod.id, e.target.checked)}
                  />
                  {mod.label}
                </label>
              ))
            )}
            <p className="debugHint">
              Off hides the plugin's tab and its chat panel.
            </p>
          </section>
          <section className="settingsCard">
            <h3>Export</h3>
            <label className="debugToggle">
              <input
                type="checkbox"
                checked={exportKeys}
                onChange={(e) => {
                  // Unchecking is not gated: it only makes exports safer.
                  if (!e.target.checked) return setExportKeys(false)
                  setKeysPhrase('')
                }}
              />
              Include API keys in a full export
            </label>
            {keysPhrase !== null && (
              <div className="titleRow">
                <input
                  type="text"
                  className="titleInput"
                  value={keysPhrase}
                  placeholder="CONFIRM"
                  autoFocus
                  onChange={(e) => {
                    setKeysPhrase(e.target.value)
                    if (e.target.value === 'CONFIRM') {
                      setExportKeys(true)
                      setKeysPhrase(null)
                    }
                  }}
                />
                <span className="charCount">Type CONFIRM</span>
              </div>
            )}
            <p className="debugHint">
              On, Export offers a full file with your keys or a sanitized file without them. Off,
              keys are always removed.
            </p>
          </section>
          <section className="settingsCard">
            <h3>Clear all data</h3>
            <button type="button" className="secondary" onClick={() => setResetting(true)}>
              Clear all data
            </button>
            <p className="debugHint">
              Deletes every chat, character, palette, connection and API key stored in this
              browser, then reloads.
            </p>
          </section>
        </div>
      ) : tab === 'relay' ? (
        <RelayPanel />
      ) : tab === 'secondPass' ? (
        <SecondPassPanel />
      ) : tab === 'goldPass' ? (
        <GoldPassPanel />
      ) : (
        <div className="textRulesCards">
          <TagRulesPanel />
          <FindReplacePanel />
        </div>
      )}
      </div>
      )}
      {resetting && (
        <div className="dialogBackdrop" onClick={() => setResetting(false)}>
          <div className="panel dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Clear all data</h3>
            <p>This cannot be undone. Type xenia-nessuvia to confirm.</p>
            <input
              value={resetPhrase}
              onChange={(e) => setResetPhrase(e.target.value)}
              placeholder="xenia-nessuvia"
              autoFocus
            />
            <div className="dialogActions">
              <button
                type="button"
                disabled={resetPhrase !== 'xenia-nessuvia'}
                onClick={async () => {
                  await wipeEverything()
                  location.reload()
                }}
              >
                Clear
              </button>
              <button type="button" className="secondary" onClick={() => setResetting(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

