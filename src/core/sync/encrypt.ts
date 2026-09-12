/**
 * AES-GCM with a key derived from the user's passphrase, for the one object in the bucket that
 * holds secrets. WebCrypto only: no dependency, and the browser's implementation is the one worth
 * trusting.
 *
 * The provider's own encryption at rest is not a substitute: the provider holds that key. This one
 * never leaves the device. The ciphertext is opaque to whoever hosts the bucket.
 *
 * Salt and IV are random per write and travel with the ciphertext; that is what they are for. The
 * passphrase itself is never written to the bucket in the clear.
 *
 * Its own file, extension-ful imports and all, so checkEncrypt.ts can run it under
 * `node --experimental-strip-types`.
 */

interface Envelope {
  format: 'nessuTavern.encrypted'
  version: 1
  salt: string
  iv: string
  data: string
}

// 250k PBKDF2 rounds: about a fifth of a second on a laptop, which nobody notices on a button
// press, and the cost an attacker pays per passphrase guess.
const iterations = 250_000

// `Uint8Array<ArrayBuffer>`, not plain `Uint8Array`: WebCrypto's BufferSource does not accept the
// SharedArrayBuffer-backed variant the default type allows.
type Bytes = Uint8Array<ArrayBuffer>

const base64 = (bytes: Bytes) => btoa(String.fromCharCode(...bytes))
const unbase64 = (text: string): Bytes => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

async function deriveKey(passphrase: string, salt: Bytes): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptText(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const envelope: Envelope = {
    format: 'nessuTavern.encrypted',
    version: 1,
    salt: base64(salt),
    iv: base64(iv),
    data: base64(new Uint8Array(data)),
  }
  return JSON.stringify(envelope)
}

/** True for anything encryptText wrote, so a bucket written before encryption was turned on still
 *  reads. */
export function isEncrypted(text: string): boolean {
  try {
    return (JSON.parse(text) as Envelope).format === 'nessuTavern.encrypted'
  } catch {
    return false
  }
}

/**
 * A wrong passphrase fails as a GCM tag mismatch, which surfaces as a bare OperationError. Said
 * plainly instead: the passphrase is the only thing it is ever likely to be.
 */
export async function decryptText(text: string, passphrase: string): Promise<string> {
  const envelope = JSON.parse(text) as Envelope
  if (envelope.format !== 'nessuTavern.encrypted' || envelope.version !== 1) {
    throw new Error('That object was not written by this app.')
  }
  const key = await deriveKey(passphrase, unbase64(envelope.salt))
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unbase64(envelope.iv) },
      key,
      unbase64(envelope.data),
    )
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('Wrong passphrase for the settings in this bucket.')
  }
}
