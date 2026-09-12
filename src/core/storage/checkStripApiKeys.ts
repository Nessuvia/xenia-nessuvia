import assert from 'node:assert'
import { stripApiKeys } from './stripApiKeys.ts'

const input = JSON.stringify({
  state: {
    connections: [
      { id: 'a', name: 'local', apiKey: 'secret', model: 'gpt' },
      { id: 'b', apiKey: '' },
    ],
    nested: { deep: [{ apiKey: 'alsoSecret' }] },
    // The sync bucket's credentials. A backup file gets moved between devices and mailed around,
    // and these grant write access to everything the user has stored.
    bucket: {
      endpoint: 'https://s3.example.net',
      region: 'garage',
      bucket: 'tavern',
      prefix: '',
      accessKeyId: 'AKIAsecret',
      secretAccessKey: 'topsecret',
    },
  },
  version: 0,
})

const out = stripApiKeys(input)
assert(out !== null)
// Values only: `secretAccessKey` is a key name and is meant to survive, blanked.
const values = Object.values(JSON.parse(out).state).map((v) => JSON.stringify(v)).join('')
assert(!/secret/i.test(values.replace(/"secretAccessKey"/g, '')), 'credentials must not survive export')
const parsed = JSON.parse(out)
assert.equal(parsed.state.connections[0].name, 'local')
assert.equal(parsed.state.connections[0].apiKey, '')
assert.equal(parsed.state.nested.deep[0].apiKey, '')
assert.equal(parsed.state.bucket.accessKeyId, '')
assert.equal(parsed.state.bucket.secretAccessKey, '')
// Non-secret bucket fields survive. A restored backup still points at the right bucket.
assert.equal(parsed.state.bucket.endpoint, 'https://s3.example.net')
assert.equal(parsed.state.bucket.bucket, 'tavern')
assert.equal(stripApiKeys(null), null)

console.log('checkBackup ok')
