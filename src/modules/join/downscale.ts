/** The longest edge, in pixels, a guest avatar is reduced to before it crosses the wire. */
export const avatarMaxEdge = 256

/**
 * Read an image file, downscale it so its longest edge is at most `avatarMaxEdge`, and return a
 * base64 data URI. Rejects when the file isn't a decodable image.
 */
export function downscaleImage(file: File, maxEdge: number = avatarMaxEdge): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      const scale = Math.min(1, maxEdge / Math.max(width, height))
      const w = Math.max(1, Math.round(width * scale))
      const h = Math.max(1, Math.round(height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas not available.'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Not a decodable image.'))
    }
    img.src = url
  })
}
