import { create } from 'zustand'
import { storage } from '../storage/db'
import { currentOwnerId } from '../storage/storageInterface'
import type { StoredRecord } from '../storage/storageInterface'
import type { BackgroundImage } from '../storage/types'

interface BackgroundImagesState {
  images: BackgroundImage[]
  loaded: boolean
  load(): Promise<void>
  /** Read a picked file as a data URL and store it. Returns the new row's id. */
  add(file: File): Promise<number>
  /** Store imported images. Returns the file's id → the local row id, for `remapImages`. */
  importImages(images: Record<number, { name: string; dataUrl: string }>): Promise<Record<number, number>>
  remove(id: number): Promise<void>
}

export const useBackgroundImages = create<BackgroundImagesState>()((set, get) => ({
  images: [],
  loaded: false,

  load: async () => {
    const rows = (await storage.getAll('backgroundImages')) as unknown as BackgroundImage[]
    set({ images: rows, loaded: true })
  },

  add: async (file) => {
    const dataUrl = await readDataUrl(file)
    const record = { ownerId: currentOwnerId(), name: file.name, dataUrl }
    const id = await storage.put('backgroundImages', record as unknown as StoredRecord)
    await get().load()
    return id
  },

  importImages: async (images) => {
    const map: Record<number, number> = {}
    if (!get().loaded) await get().load()
    for (const [key, img] of Object.entries(images)) {
      // Re-importing a file that already came through here reuses the row instead of stacking up
      // copies of the same bytes.
      const existing = get().images.find((row) => row.dataUrl === img.dataUrl)
      map[Number(key)] =
        existing?.id ??
        (await storage.put('backgroundImages', {
          ownerId: currentOwnerId(),
          name: img.name,
          dataUrl: img.dataUrl,
        } as unknown as StoredRecord))
      await get().load()
    }
    return map
  },

  remove: async (id) => {
    await storage.remove('backgroundImages', id)
    await get().load()
  },
}))

/** The image at `id`, or undefined, a palette can point at a row that was deleted. */
export function useBackgroundImage(id: number): BackgroundImage | undefined {
  return useBackgroundImages((s) => s.images.find((img) => img.id === id))
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Couldn't read the file."))
    reader.readAsDataURL(file)
  })
}
