import assert from 'node:assert'
import { emptyDropboxConfig } from './dropboxConfig.ts'
import { apiArg, filePath, folderPath } from './dropboxPath.ts'

const at = (folder: string) => ({ ...emptyDropboxConfig, folder })

// No folder: the tables sit at the app folder's own root, which Dropbox spells ''.
assert.equal(folderPath(at('')), '')
assert.equal(filePath(at(''), 'chats'), '/chats.json')

// The three ways a user types one folder all mean the same folder.
for (const typed of ['books', '/books', 'books/', '/books/']) {
  assert.equal(folderPath(at(typed)), '/books', typed)
  assert.equal(filePath(at(typed), 'chats'), '/books/chats.json', typed)
}

// A lone slash is the root, not a folder named ''. Without the trim this builds '//chats.json'.
assert.equal(folderPath(at('/')), '')
assert.equal(filePath(at('/'), 'chats'), '/chats.json')

// Plain ASCII passes through untouched, quotes and all: the header carries real JSON.
assert.equal(apiArg({ path: '/chats.json' }), '{"path":"/chats.json"}')
assert.equal(apiArg({ path: '/a b/c.json' }), '{"path":"/a b/c.json"}')

// An accented folder name. A header can only carry ASCII, so Dropbox takes it escaped, and the
// escape has to be a backslash and a u rather than the character itself.
assert.equal(apiArg({ path: '/café.json' }), '{"path":"/caf\\u00e9.json"}')
assert.ok(!/[^\x20-\x7e]/.test(apiArg({ path: '/café.json' })), 'the header must be ASCII')

// Outside the BMP, which JSON.stringify leaves as a surrogate pair. Both halves get escaped.
assert.equal(apiArg({ path: '/\u{1f600}.json' }), '{"path":"/\\ud83d\\ude00.json"}')

// DEL and the C1 range are above 0x7e and escape too: a raw control character in a header value
// is what a request smuggling check would reject.
assert.equal(apiArg(''), '"\\u007f"')

console.log('checkDropboxPath ok')
