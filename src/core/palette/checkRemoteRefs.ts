// Run: node --experimental-strip-types src/core/palette/checkRemoteRefs.ts
import assert from 'node:assert'
import { cssRemoteRefs, isRemote } from './remoteRefs.ts'

assert.ok(!isRemote(''))
assert.ok(!isRemote(' data:image/png;base64,AA'))
assert.ok(!isRemote('#mask'))
assert.ok(isRemote('https://x.test/p.png'))
assert.ok(isRemote('//x.test/a'))
assert.ok(isRemote('pic.png'), 'relative counts: over-report')

assert.deepStrictEqual(cssRemoteRefs('a { background: url(data:x) } b { mask: url(#m) }'), [])
assert.deepStrictEqual(cssRemoteRefs('a { background: url("https://x.test/d") }'), ['https://x.test/d'])
assert.deepStrictEqual(cssRemoteRefs("a { background: url('https://x.test/d2') }"), ['https://x.test/d2'])
assert.deepStrictEqual(cssRemoteRefs('a { background: url(https://x.test/d3) }'), ['https://x.test/d3'])
assert.deepStrictEqual(cssRemoteRefs("@import 'https://x.test/e.css';"), ['https://x.test/e.css'])
assert.deepStrictEqual(cssRemoteRefs('@import url(https://x.test/f.css);'), ['https://x.test/f.css'])
assert.deepStrictEqual(cssRemoteRefs('a { background: image-set("https://x.test/g.png" 1x) }'), ['https://x.test/g.png'])
assert.deepStrictEqual(cssRemoteRefs('a { background: url(https://x.test/h) } b { background: url(https://x.test/h) }'), ['https://x.test/h'])
