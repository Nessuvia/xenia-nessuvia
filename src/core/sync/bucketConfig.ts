/**
 * The shape of the user's bucket credentials, on its own so both the settings store and the sync
 * client can import it without a cycle. No imports of its own: settingsStore is reachable from
 * checkDirtyTables.ts under node --strip-types.
 */

/** Same trust level as a connection's apiKey: localStorage on a device the user controls, and
 *  stripped from backups by stripApiKeys. */
export interface BucketConfig {
  /** Base URL of the S3 API, e.g. `https://s3.example.net` or `http://localhost:3900`. */
  endpoint: string
  /** Self-hosted servers mostly ignore the value. SigV4 signs it: it has to match what the
   *  server expects and can't be blank. Garage's default is `garage`, set as `s3_region` in
   *  garage.toml. Hosted providers want a real region. */
  region: string
  bucket: string
  /** Optional folder inside the bucket. '' puts the table objects at the root. */
  prefix: string
  accessKeyId: string
  secretAccessKey: string
}

export const emptyBucketConfig: BucketConfig = {
  endpoint: '',
  // Garage's default: Garage is the setup the docs walk through. Anyone pointing at a hosted
  // provider has to change it, and would have had to change `us-east-1` just as often.
  region: 'garage',
  bucket: '',
  prefix: '',
  accessKeyId: '',
  secretAccessKey: '',
}

/** Every field but `prefix`, which is empty when the tables sit at the bucket root. */
export function bucketConfigured(c: BucketConfig): boolean {
  return Boolean(c.endpoint && c.region && c.bucket && c.accessKeyId && c.secretAccessKey)
}
