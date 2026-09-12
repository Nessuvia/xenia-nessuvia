// Card-URL parsing only, no network. Run with:
//   node --experimental-strip-types src/core/connectors/checkFetchCard.ts
import assert from 'node:assert'
import { aiccId, chubFullPath } from './fetchCard.ts'

// aicharactercards.com: the API takes the last two path segments. The page URL and the
// "ST Card ID" printed on that page both resolve.
assert.equal(aiccId('https://aicharactercards.com/cards/2151'), 'cards/2151')
assert.equal(aiccId('https://www.aicharactercards.com/cards/2151/'), 'cards/2151')
assert.equal(aiccId('  AICC/23370/2151  '), '23370/2151')
assert.equal(aiccId('aicc/23370/2151'), '23370/2151')

// Rejected: too few segments, wrong host, a bare id that isn't an AICC one, and traversal.
assert.equal(aiccId('https://aicharactercards.com/'), null)
assert.equal(aiccId('https://aicharactercards.com/cards'), null)
assert.equal(aiccId('https://evil.com/cards/1/2'), null)
assert.equal(aiccId('https://aicharactercards.com.evil.com/cards/2151'), null)
assert.equal(aiccId('23370/2151'), null)
assert.equal(aiccId('AICC/23370/..'), null) // must not walk out of the API's own path
assert.equal(aiccId('AICC/23370/2151/../../../wp-json'), null)
assert.equal(aiccId('AICC/23370/2151?x=1'), null) // the query would ride into the outbound URL

// chub, pinned so the move into this file didn't change it.
assert.equal(chubFullPath('https://chub.ai/characters/anon/mia'), 'anon/mia')
assert.equal(chubFullPath('https://www.characterhub.org/characters/anon/mia'), 'anon/mia')
assert.equal(chubFullPath('https://chub.ai/lorebooks/anon/mia'), null)
assert.equal(chubFullPath('not a url'), null)

console.log('checkFetchCard ok')
