/**
 * The Dropbox sign-in, and the access tokens it leads to.
 *
 * PKCE, in a popup. This app has no server and ships no secret, so the authorization code is
 * bound to a verifier this tab generated and nothing else can replay it. What comes back that's
 * worth keeping is the refresh token; access tokens last four hours and are minted here on demand,
 * held in a module variable and never persisted.
 *
 * The redirect lands on `public/dropbox.html`, a page with no React in it, which posts the code
 * back to this tab and closes. Loading the whole app inside a popup to read one query parameter
 * would be the alternative.
 */
import { dropboxAppKey } from './dropboxConfig'
import { useSettings } from '../stores/settingsStore'

const authorizeUrl = 'https://www.dropbox.com/oauth2/authorize'
const tokenUrl = 'https://api.dropboxapi.com/oauth2/token'

/** Registered in the Dropbox App Console, and matched exactly by Dropbox. Built from the running
 *  origin so the dev server and the deployed site each get their own, both registered. */
export function redirectUri(): string {
  return `${location.origin}/dropbox.html`
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 96 bytes of randomness, which is 128 base64url characters: the longest verifier the spec
 *  allows. */
function makeVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(96)))
}

async function challenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
}

/** The current access token and when it stops working, a minute early so a request that's already
 *  in flight when it expires isn't the one that finds out. Module-level: it belongs to this tab,
 *  not to the user's data. */
let access: { token: string; expiresAt: number } | null = null

/** Called when the user signs out, and when a refresh is rejected: a stale token in here would
 *  otherwise outlive the account it belonged to. */
export function forgetAccessToken() {
  access = null
}

async function postForm(body: Record<string, string>): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
  } catch {
    throw new Error('Could not reach Dropbox.')
  }
  const text = await response.text()
  if (!response.ok) {
    // Dropbox answers with {error, error_description}. The description is the readable half and
    // the status is the fallback for an empty body.
    const parsed = text ? (JSON.parse(text) as { error_description?: string }) : null
    throw new Error(parsed?.error_description ?? `Dropbox refused the sign-in (${response.status}).`)
  }
  return JSON.parse(text) as Record<string, unknown>
}

/**
 * An access token for the stored refresh token, reusing the live one until it's nearly expired.
 *
 * A rejected refresh token is the sign-out case: Dropbox says no once the user revokes the app,
 * and every later request would fail the same way with a worse message. The stored token is
 * cleared so the screen goes back to Connect.
 */
export async function accessToken(): Promise<string> {
  if (access && Date.now() < access.expiresAt) return access.token
  const { refreshToken } = useSettings.getState().dropbox
  if (!refreshToken) throw new Error('Dropbox is not connected.')

  let result: Record<string, unknown>
  try {
    result = await postForm({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: dropboxAppKey,
    })
  } catch (err) {
    forgetAccessToken()
    useSettings.getState().setDropbox({ refreshToken: '', account: '' })
    throw new Error(`${err instanceof Error ? err.message : 'Dropbox refused the sign-in.'} Connect again.`)
  }

  const token = String(result.access_token ?? '')
  if (!token) throw new Error('Dropbox did not return an access token.')
  access = { token, expiresAt: Date.now() + (Number(result.expires_in) || 14400) * 1000 - 60_000 }
  return token
}

/** How long to wait for the user to finish in the popup before giving up on it. Long enough to
 *  type a password and clear a second factor. */
const authTimeout = 5 * 60_000

/** The code the popup sends back, or a rejection if the user closed it or denied access. */
function waitForCode(popup: Window): Promise<string> {
  return new Promise((resolve, reject) => {
    function done(finish: () => void) {
      window.removeEventListener('message', onMessage)
      clearInterval(closedTimer)
      clearTimeout(timer)
      popup.close()
      finish()
    }
    function onMessage(event: MessageEvent) {
      // Anything from another origin is not our callback page. The popup is same-origin by the
      // time it posts: the redirect lands back here.
      if (event.origin !== location.origin) return
      const data = event.data as { source?: string; code?: string; error?: string } | null
      if (!data || data.source !== 'dropboxAuth') return
      if (data.code) return done(() => resolve(data.code as string))
      done(() => reject(new Error(data.error ?? 'Dropbox did not return a code.')))
    }
    window.addEventListener('message', onMessage)
    // A closed popup posts nothing, and the promise would hang on a user who changed their mind.
    const closedTimer = setInterval(() => {
      if (popup.closed) done(() => reject(new Error('The Dropbox window was closed.')))
    }, 500)
    const timer = setTimeout(() => done(() => reject(new Error('The Dropbox sign-in timed out.'))), authTimeout)
  })
}

export interface DropboxAccount {
  refreshToken: string
  account: string
}

/**
 * Opens the popup, waits for the code, and trades it for a refresh token. Nothing is written to
 * settings here: the caller stores what comes back, so a half-finished sign-in leaves the existing
 * connection alone.
 *
 * The popup is opened before any await. A browser only allows window.open inside the click that
 * asked for it, and awaiting first loses that permission.
 */
export async function connectDropbox(): Promise<DropboxAccount> {
  if (!dropboxAppKey) throw new Error('No Dropbox app key is built into this copy of the app.')
  const popup = window.open('', 'dropboxAuth', 'width=600,height=760')
  if (!popup) throw new Error('The Dropbox window was blocked. Allow popups for this site.')

  try {
    const verifier = makeVerifier()
    const url = new URL(authorizeUrl)
    url.search = new URLSearchParams({
      client_id: dropboxAppKey,
      response_type: 'code',
      code_challenge: await challenge(verifier),
      code_challenge_method: 'S256',
      redirect_uri: redirectUri(),
      // Without this Dropbox returns a four-hour access token and no refresh token, and the user
      // would be signing in again every afternoon.
      token_access_type: 'offline',
    }).toString()
    popup.location.replace(url.toString())

    const code = await waitForCode(popup)
    const result = await postForm({
      grant_type: 'authorization_code',
      code,
      client_id: dropboxAppKey,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    })
    const refreshToken = String(result.refresh_token ?? '')
    if (!refreshToken) throw new Error('Dropbox did not return a refresh token.')
    // Usable right away: the sign-in already handed us an access token, and reading the account
    // email below shouldn't cost a second round trip.
    access = {
      token: String(result.access_token ?? ''),
      expiresAt: Date.now() + (Number(result.expires_in) || 14400) * 1000 - 60_000,
    }
    return { refreshToken, account: await currentAccountEmail() }
  } catch (err) {
    popup.close()
    throw err
  }
}

/** The signed-in account's email, for the line under the Connect button. A failure here isn't
 *  worth losing the sign-in over, so it comes back blank. */
async function currentAccountEmail(): Promise<string> {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: { authorization: `Bearer ${access?.token ?? ''}` },
    })
    if (!response.ok) return ''
    return String((await response.json()).email ?? '')
  } catch {
    return ''
  }
}
