// Extension-ful import on purpose: checkPalette.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import {
  backgroundSlots,
  defaultPalette,
  normalizeBackgrounds,
  normalizeOrder,
  normalizeSkinVars,
  type Palette,
} from './palette.ts'

export interface PaletteFile {
  format: 'nessuTavern.palettes'
  version: 1
  palettes: Palette[]
  /**
   * The bytes for every background image the palettes reference, keyed by the exporting browser's
   * `backgroundImages` row id. A row id means nothing anywhere else. The file carries the image
   * itself and the importer rewrites the ids (see `remapImages`).
   *
   * Optional: a file written before this existed, or a hand-written one, has no images and every
   * `imageId` remaps to 0, no image, which is what a slot with nothing set already means.
   */
  images?: Record<number, PaletteFileImage>
}

export interface PaletteFileImage {
  name: string
  dataUrl: string
}

/** Every user palette. Default is a constant in code: it is never written out. */
export function buildPaletteFile(
  palettes: Palette[],
  library: { id?: number; name: string; dataUrl: string }[] = [],
): PaletteFile {
  const images: Record<number, PaletteFileImage> = {}
  for (const p of palettes) {
    for (const slot of backgroundSlots) {
      const id = p.backgrounds?.[slot]?.imageId
      if (!id || images[id]) continue
      const found = library.find((img) => img.id === id)
      if (found) images[id] = { name: found.name, dataUrl: found.dataUrl }
    }
  }
  return { format: 'nessuTavern.palettes', version: 1, palettes, images }
}

export function downloadPalettes(file: PaletteFile) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName(file.palettes[0]?.name ?? '')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/** The palette's name as a filename: spaces to underscores, anything else a path can't hold gone. */
export function fileName(name: string): string {
  return (
    name
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w.-]/g, '')
      // Dropping a character can leave the underscores around it doubled up.
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '') || 'palette'
  )
}

/**
 * Untrusted file input, read the same tolerant way an imported character card is: reject anything
 * that isn't a palette file, then coerce each field, falling back to the Default value for anything
 * missing or of the wrong type. Ids are dropped; the importer always appends.
 *
 * The images come back alongside rather than merged in: writing them needs Dexie, which this module
 * has no business touching. The caller stores them and then calls `remapImages`.
 */
export function parsePalettes(text: string): { palettes: Palette[]; images: Record<number, PaletteFileImage> } {
  const data = JSON.parse(text) as Partial<PaletteFile>
  if (data.format !== 'nessuTavern.palettes' || !Array.isArray(data.palettes)) {
    throw new Error('Not a palette file.')
  }
  return { palettes: data.palettes.map(coercePalette), images: coerceImages(data.images) }
}

/**
 * Point a parsed palette's background slots at the ids the images actually landed on locally.
 * Anything unmapped becomes 0: the slot shows no image of its own and falls back to the baseline,
 * which is how an empty slot already behaves.
 */
export function remapImages(palette: Palette, map: Record<number, number>): Palette {
  const backgrounds = { ...palette.backgrounds }
  for (const slot of backgroundSlots) {
    backgrounds[slot] = { ...backgrounds[slot], imageId: map[backgrounds[slot].imageId] ?? 0 }
  }
  return { ...palette, backgrounds }
}

/**
 * Read untrusted palette fields off `raw`, field by field, keeping `base`'s value for anything
 * missing or of the wrong type. Two callers with different bases: an imported file falls back to
 * Default, a model's reply falls back to the palette being edited. A partial reply is a partial
 * edit. `id` and `ownerId` never come from outside.
 */
export function coerceFields(raw: unknown, base: Palette): Palette {
  const source = (raw ?? {}) as Record<string, unknown>
  const out = { ...base } as Record<string, unknown>
  delete out.id
  for (const [key, fallback] of Object.entries(base)) {
    if (key === 'id' || key === 'ownerId') continue
    const value = source[key]
    if (key === 'colorOrder' || key === 'storyColorOrder') {
      // Absent leaves the base order alone; present but junk is normalized, not dropped.
      out[key] = value === undefined ? fallback : normalizeOrder(value as Palette['colorOrder'])
    } else if (key === 'backgrounds') {
      // Same rule: absent keeps the base's, present is normalized slot by slot. A model reply never
      // carries this key (it's kept out of the prompt). In practice only an import lands here.
      out[key] =
        value === undefined ? fallback : normalizeBackgrounds(value as Palette['backgrounds'])
    } else if (key === 'skinVars') {
      out[key] = value === undefined ? fallback : normalizeSkinVars(value)
    } else if (typeof fallback === 'boolean') {
      out[key] = typeof value === 'boolean' ? value : fallback
    } else if (typeof fallback === 'number') {
      out[key] = typeof value === 'number' && Number.isFinite(value) ? value : fallback
    } else {
      out[key] = typeof value === 'string' ? value : fallback
    }
  }
  return out as unknown as Palette
}

function coercePalette(raw: unknown): Palette {
  const out = coerceFields(raw, defaultPalette) as unknown as Record<string, unknown>
  out.name = String(out.name).trim() || 'Imported palette'
  return out as unknown as Palette
}

/** Only entries that are a numeric key holding two strings. Everything else is dropped. */
function coerceImages(raw: unknown): Record<number, PaletteFileImage> {
  const out: Record<number, PaletteFileImage> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(key)
    const img = (value ?? {}) as Partial<PaletteFileImage>
    if (!Number.isInteger(id) || id <= 0) continue
    if (typeof img.dataUrl !== 'string' || !img.dataUrl) continue
    out[id] = { name: typeof img.name === 'string' ? img.name : 'Imported image', dataUrl: img.dataUrl }
  }
  return out
}
