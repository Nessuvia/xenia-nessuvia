import assert from 'node:assert/strict'
import { contract } from './contract.ts'

assert.equal(contract('You should not go. Do not wait.'), "You shouldn't go. Don't wait.")
assert.equal(contract('I will not. He cannot.'), "I won't. He can't.")
assert.equal(contract('I am tired and they are late. It is fine.'), "I'm tired and they're late. It's fine.")
assert.equal(contract('Yes, I am.'), 'Yes, I am.')
assert.equal(contract('Isnot a word, island is not.'), "Isnot a word, island isn't.")
