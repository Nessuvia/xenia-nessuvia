/**
 * The relay disclaimer, shown once to a host and every time to a guest.
 *
 * Multiplayer is the one feature that sends anything outside the browser other than model requests.
 * Frames go through a relay the host runs (`resources/self-hosted-relay.md`). The relay carries
 * plaintext. That is a fact the user should accept, not discover: this notice gates the feature,
 * it does not sit tucked away on a settings page.
 *
 * A guest's link says which relay the room is on, so the guest's copy names it.
 *
 * Acceptance is persisted for hosts only. `multiplayerStore.ts` holds a guest's tab to writing
 * nothing to localStorage and nothing to Dexie, and one convenience flag is not worth breaking it
 * so `JoinView` keeps the accepted state in React and shows the notice again next session.
 */
import type { JSX } from 'react'

/** Same `nessuTavern.` prefix as the sidebar's collapse flag. Left out of backups on purpose:
 *  acceptance is per-device, not part of the user's data. */
const acceptedKey = 'nessuTavern.relayNoticeAccepted'

export function relayNoticeAccepted(): boolean {
  return localStorage.getItem(acceptedKey) === '1'
}

export function acceptRelayNotice(): void {
  localStorage.setItem(acceptedKey, '1')
}

export function RelayNotice({
  host,
  onAccept,
}: {
  /** The relay's hostname. Absent on the host's landing, where the notice is accepted before a
   *  relay is picked. */
  host?: string
  onAccept: () => void
}): JSX.Element {
  return (
    <div className="relayNotice">
      <h2>Multiplayer uses a relay</h2>
      {host ? (
        <p>
          Messages in a session pass through the relay server at {host}. It is run by whoever sent
          you the link, not by the developer of this app.
        </p>
      ) : (
        <p>
          Messages in a session pass through the relay server you set up in Settings. No relay is
          run by the developer of this app.
        </p>
      )}
      <p>The relay carries messages in plaintext. Whoever runs it can read what passes through it.</p>
      <p>Messages are not stored on the relay.</p>
      <p>API keys are never sent to the relay. Model requests go from your browser straight to your provider.</p>
      <p>Everything outside multiplayer stays in your browser.</p>
      <button type="button" onClick={onAccept}>
        Accept
      </button>
    </div>
  )
}
