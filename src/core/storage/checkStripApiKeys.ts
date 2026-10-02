import assert from 'node:assert'
import { stripApiKeys } from './stripApiKeys.ts'

const input = JSON.stringify({
  state: {
    connections: [
      { id: 'a', name: 'local', apiKey: 'secret', model: 'gpt' },
      { id: 'b', apiKey: '' },
    ],
    nested: { deep: [{ apiKey: 'alsoSecret' }] },
    // The Dropbox sign-in. A backup file gets moved between devices and mailed around, and the
    // refresh token grants write access to everything the user has synced.
    dropbox: { refreshToken: 'secretToken', account: 'a@example.net', folder: 'tavern' },
  },
  version: 0,
})

const out = stripApiKeys(input)
assert(out !== null)
const values = Object.values(JSON.parse(out).state).map((v) => JSON.stringify(v)).join('')
assert(!/secret/i.test(values), 'credentials must not survive export')
const parsed = JSON.parse(out)
assert.equal(parsed.state.connections[0].name, 'local')
assert.equal(parsed.state.connections[0].apiKey, '')
assert.equal(parsed.state.nested.deep[0].apiKey, '')
assert.equal(parsed.state.dropbox.refreshToken, '')
// Non-secret fields survive.
assert.equal(parsed.state.dropbox.folder, 'tavern')
assert.equal(stripApiKeys(null), null)

console.log('checkBackup ok')
