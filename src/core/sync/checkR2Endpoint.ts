import assert from 'node:assert'
import { r2AccountId, r2Endpoint } from './r2Endpoint.ts'

const id = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'

assert.equal(r2Endpoint(id), `https://${id}.r2.cloudflarestorage.com`)
assert.equal(r2AccountId(r2Endpoint(id)), id, 'round trip')
assert.equal(r2AccountId(r2Endpoint(`  ${id}  `)), id, 'the account id is trimmed on the way in')

// A blank account id leaves the endpoint blank. The form still looks unconfigured.
assert.equal(r2Endpoint(''), '')
assert.equal(r2Endpoint('   '), '')

// Anything that is not an R2 endpoint opens the generic form.
assert.equal(r2AccountId('http://localhost:3900'), null)
assert.equal(r2AccountId('https://s3.us-west-002.backblazeb2.com'), null)
assert.equal(r2AccountId(''), null)
assert.equal(r2AccountId('not a url'), null)
// No account in the host.
assert.equal(r2AccountId('https://r2.cloudflarestorage.com'), null)
// A deeper subdomain is not an account id.
assert.equal(r2AccountId(`https://x.${id}.r2.cloudflarestorage.com`), null)
// The suffix has to be the host, not a path or a query on someone else's server.
assert.equal(r2AccountId('https://evil.example/.r2.cloudflarestorage.com'), null)

console.log('checkR2Endpoint ok')
