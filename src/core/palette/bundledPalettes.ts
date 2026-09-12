import { parsePalettes, type PaletteFileImage } from './importPalettes'
import type { Palette } from './palette'

/**
 * Palette files that ship with the build. Drop an exported `.json` into `bundled/` and it seeds
 * itself on a fresh install, and shows up in the Bundled picker. No list to edit.
 *
 * Each file is parsed on its own: image ids are per-file. They have to be remapped per file too.
 */
const files = import.meta.glob<unknown>('./bundled/*.json', { eager: true, import: 'default' })

export interface BundledPalette {
  /** Stable across renders and unique: a name could repeat across two files. */
  key: string
  palette: Palette
  /** The images from the file this palette came out of, for `importImages`. */
  images: Record<number, PaletteFileImage>
}

/** One entry per palette, in filename order. Both the seeding and the picker read this. */
export function bundledPalettes(): BundledPalette[] {
  const out: BundledPalette[] = []
  for (const path of Object.keys(files).sort()) {
    // stringify to reuse the import path's coercion rather than a second parser.
    const { palettes, images } = parsePalettes(JSON.stringify(files[path]))
    palettes.forEach((palette, i) => out.push({ key: `${path}#${i}`, palette, images }))
  }
  return out
}
