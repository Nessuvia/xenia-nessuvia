import assert from 'node:assert'
import { loopbackHost, mixedContentBlocked } from './mixedContent.ts'

// Loopback is reachable over plain http from an https page.
assert.equal(loopbackHost('localhost'), true)
assert.equal(loopbackHost('kobold.localhost'), true)
assert.equal(loopbackHost('127.0.0.1'), true)
assert.equal(loopbackHost('127.1.2.3'), true)
assert.equal(loopbackHost('[::1]'), true)
assert.equal(loopbackHost('::1'), true)

// Everything else is not, including the private ranges people reach local models on.
assert.equal(loopbackHost('10.147.17.130'), false)
assert.equal(loopbackHost('192.168.1.50'), false)
assert.equal(loopbackHost('notlocalhost'), false)
assert.equal(loopbackHost('localhost.evil.example'), false)
assert.equal(loopbackHost('128.0.0.1'), false)

// The case the warning exists for.
assert.equal(mixedContentBlocked('http://10.147.17.130:5001/v1', 'https:'), true)
assert.equal(mixedContentBlocked('http://192.168.1.50:8080/v1', 'https:'), true)

// Loopback and https endpoints are fine.
assert.equal(mixedContentBlocked('http://localhost:5001/v1', 'https:'), false)
assert.equal(mixedContentBlocked('http://127.0.0.1:5001/v1', 'https:'), false)
assert.equal(mixedContentBlocked('http://[::1]:5001/v1', 'https:'), false)
assert.equal(mixedContentBlocked('https://nano-gpt.com/api/v1', 'https:'), false)

// A page served over plain http mixes nothing: the dev server is the everyday case.
assert.equal(mixedContentBlocked('http://10.147.17.130:5001/v1', 'http:'), false)

// A field mid-typing is the field's problem, not this one.
assert.equal(mixedContentBlocked('', 'https:'), false)
assert.equal(mixedContentBlocked('10.147.17.130:5001', 'https:'), false)

console.log('checkMixedContent ok')
