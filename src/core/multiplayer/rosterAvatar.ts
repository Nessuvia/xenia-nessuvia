/** The longest edge, in pixels, a roster avatar is reduced to before it crosses the wire. Matches
 *  the guest persona avatar cap in `join/downscale.ts`: both travel the same 240 KB event. */
export const rosterAvatarMaxEdge = 256

/**
 * `character.avatar` is the original, uncropped upload: unbounded size, and often well past the
 * Realtime payload cap on its own. `RosterCharacter` is documented as carrying no full-size avatar.
 * Nothing downscaled it before it reached the wire: a session with any real character portrait
 * silently dropped its whole `state` event. `channel.send` refuses an oversized payload with no
 * error. A guest saw no roster, no participants and no messages, all from one avatar.
 *
 * Downscales in place. The crop a character has on file is applied at display time by the `Avatar`
 * component, not baked in here: guests still see the same crop over a smaller image.
 */
export function downscaleAvatar(dataUrl: string, maxEdge: number = rosterAvatarMaxEdge): Promise<string> {
  if (!dataUrl) return Promise.resolve('')
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      // Everything here has to be guarded. `toDataURL` throws SecurityError on a canvas tainted by
      // a cross-origin image, and an unhandled throw inside onload leaves this promise pending
      // forever. `createSession` awaits it: one such avatar hangs the whole room open with an
      // empty roster and no error anywhere. Resolving blank is always better than never resolving.
      try {
        const { width, height } = img
        const scale = Math.min(1, maxEdge / Math.max(width, height))
        const w = Math.max(1, Math.round(width * scale))
        const h = Math.max(1, Math.round(height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        // Undecodable or no 2D context: better to send no avatar than to block the roster on it.
        if (!ctx) {
          resolve('')
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        resolve('')
      }
    }
    img.onerror = () => resolve('')
    img.src = dataUrl
  })
}
