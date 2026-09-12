/**
 * The seeding flags a restore or a pull has to force on.
 *
 * Four stores write bundled rows on first load and record a flag: a delete sticks. Palettes,
 * characters, sampler defs and prompt stacks. A restore or a pull replaces those tables with
 * someone else's rows, and without the flags the next load writes the bundled ones on top. For
 * stacks that is worse than an extra row: stacksStore.load also calls setActiveId for the two
 * stacks it seeds, and the restored active-stack choice is overwritten too.
 *
 * Its own file, extension-ful imports and all: checkSeedFlags.ts can run it under
 * `node --experimental-strip-types`. backup.ts pulls in Dexie and can't.
 */

/** Every flag that guards a first-run write of bundled rows. */
export const seedFlags = [
  'seededPalettes',
  'seededCharacters',
  'seededParamDefs',
  'seededStacks',
] as const

/**
 * The persisted settings blob with every seed flag on. Forced on even when the backup carries no
 * settings blob at all, which is the case a shareable file lands in.
 */
export function withSeedFlags(settings: string | null): string {
  let parsed: { state?: Record<string, unknown>; version?: number } = {}
  if (settings !== null) {
    try {
      parsed = JSON.parse(settings) as typeof parsed
    } catch {
      parsed = {}
    }
  }
  const state = { ...(parsed.state ?? {}) }
  for (const flag of seedFlags) state[flag] = true
  return JSON.stringify({ ...parsed, state })
}
