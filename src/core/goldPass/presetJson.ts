// Extension-ful imports on purpose: checkPresetJson.ts runs this under
// `node --experimental-strip-types`.
import type { GoldPreset } from './goldPassSettings.ts'

/**
 * Presets in and out as JSON, so a rewrite prompt can be written in a file, pasted from somewhere,
 * or handed to someone else. The build ships no opinion about prose, so a file is how the list
 * gets filled, and the bundled starter goes through this parser like any other import.
 *
 * Untrusted input: a preset's text becomes a system prompt, so it is coerced here rather than
 * where it is used, and a bad file is rejected whole rather than half-imported.
 */

/** What `exportPresets` writes and `parsePresetFile` recognises. */
const FORMAT = 'nessuTavern.goldPresets'

export function exportPresets(presets: GoldPreset[]): string {
  return JSON.stringify({ format: FORMAT, presets }, null, 2)
}

export function downloadPresets(presets: GoldPreset[]) {
  const url = URL.createObjectURL(
    new Blob([exportPresets(presets)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `XeniaNessuvia-goldPresets-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function one(raw: unknown, index: number): GoldPreset {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Preset ${index + 1} is not an object.`)
  }
  const p = raw as Record<string, unknown>
  const text = str(p.text)
  // A preset with no text is a system prompt that says nothing. Gold Pass would run and send an
  // empty instruction, which is a worse outcome than refusing the file.
  if (!text.trim()) throw new Error(`Preset ${index + 1} has no text.`)
  return {
    // Always a fresh id. An imported file may carry ids already in the list, and two presets under
    // one id would make the active-preset radio point at both.
    id: crypto.randomUUID(),
    label: str(p.label).trim() || `Preset ${index + 1}`,
    text,
  }
}

/**
 * Read a preset file. Three shapes are accepted, because all three are things a person has to
 * hand: what `exportPresets` wrote, a bare array, and a single preset object.
 */
export function parsePresetFile(text: string): GoldPreset[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`Not JSON: ${(err as Error).message}`)
  }

  const bundle =
    data && typeof data === 'object' && !Array.isArray(data) && 'presets' in data
      ? (data as { presets?: unknown })
      : null

  const raw = bundle ? (bundle.presets ?? []) : Array.isArray(data) ? data : [data]
  if (!Array.isArray(raw)) throw new Error('"presets" is not a list.')

  const presets = raw.map(one)
  if (presets.length === 0) throw new Error('No presets in that file.')
  return presets
}
