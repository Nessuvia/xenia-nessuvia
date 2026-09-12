/**
 * The relay a multiplayer session runs over. Global default.
 */
import { useState } from 'react'
import { useSettings } from '../../core/stores/settingsStore'
import { validRelayUrl } from '../../core/multiplayer/relayConfig'
import { newSessionId } from '../../core/multiplayer/channel'
import { openCentrifugoChannel } from '../../core/multiplayer/centrifugoChannel'
import { useMediaQuery } from '../../app/useMediaQuery'

export default function RelayPanel() {
  // Running a relay needs a PC. The option is struck out on a phone.
  const isMobile = useMediaQuery('(max-width: 700px)')
  const relay = useSettings((s) => s.relay)
  const setRelay = useSettings((s) => s.setRelay)
  const multiplayerEnabled = useSettings((s) => s.multiplayerEnabled)
  const setMultiplayerEnabled = useSettings((s) => s.setMultiplayerEnabled)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok'>('idle')
  const [testError, setTestError] = useState('')

  const urlOk = !isMobile && validRelayUrl(relay.url)

  /** Subscribes to a channel nobody is on, which proves the endpoint, the certificate, the origin
   *  rules and anonymous subscribe permission in one go. Same reason Sync has a Test button: a
   *  half-configured server should say so before a room is full of people. */
  function test() {
    setTestState('testing')
    setTestError('')
    const channel = openCentrifugoChannel(
      relay.url,
      `test-${newSessionId()}`,
      { id: 'test', isHost: true },
      {
        onEvent: () => {},
        onJoin: () => {},
        onLeave: () => {},
        onReady: (error) => {
          channel.close()
          if (error) {
            setTestState('idle')
            setTestError(error)
            return
          }
          setTestState('ok')
        },
      },
    )
  }

  return (
    <div className="settingsCards">
      <section className="settingsCard">
        <h3>Multiplayer mode</h3>
        <label className="debugToggle">
          <input
            type="checkbox"
            checked={multiplayerEnabled}
            onChange={(e) => setMultiplayerEnabled(e.target.checked)}
          />
          Multiplayer mode
        </label>
        <p className="debugHint">Off hides the Multiplayer tab and the New multiplayer button.</p>
      </section>
      {isMobile ? (
      <section className="settingsCard">
        <h3>Your relay</h3>
        <p className="debugHint">Running a relay requires a Windows PC. Set it up there.</p>
      </section>
      ) : (
      <section className="settingsCard">
        <h3>Your relay</h3>
        <p className="debugHint">
          A Centrifugo server you run. Setup is in resources/self-hosted-relay.md.
        </p>
        <label className="relayUrlField">
          Websocket URL
          <input
            value={relay.url}
            placeholder="wss://relay.example.net/connection/websocket"
            spellCheck={false}
            onChange={(e) => {
              setRelay({ url: e.target.value.trim() })
              setTestState('idle')
              setTestError('')
            }}
          />
        </label>
        <p className="debugHint">
          Must be wss. A ws address cannot be reached from this site.
        </p>
        <div className="dialogActions">
          <button type="button" disabled={!urlOk || testState === 'testing'} onClick={test}>
            {testState === 'testing' ? 'Testing…' : 'Test'}
          </button>
          {testState === 'ok' && <span className="debugHint">Connected.</span>}
        </div>
        {testError && <p className="chatError">{testError}</p>}
      </section>
      )}
    </div>
  )
}
