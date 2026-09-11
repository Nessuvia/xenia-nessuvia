import file from './bundled/starterPreset.json'
import { parsePresetFile } from './presetJson'
import type { GoldPreset } from './goldPassSettings'

/**
 * The one preset that ships with the build, as a file rather than as code: it goes through the same
 * parser as a pasted import, so it gets a fresh id and cannot be a shape the import path would
 * reject. Nothing loads it on its own. It is behind a button, like any other import.
 *
 * It is a worked example of the mechanism, not a curated prompt. Editing it is an edit to
 * `bundled/starterPreset.json` and nothing else. One preset, on purpose: users who care write their
 * own and trade JSON files, which is what import and export are for.
 */
export function bundledPreset(): GoldPreset[] {
  // stringify to reuse the import path's coercion rather than a second parser.
  return parsePresetFile(JSON.stringify(file))
}
