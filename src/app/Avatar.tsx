import type { AvatarSource } from '../core/storage/types'
import './Avatar.css'

/**
 * Renders an avatar image, framed by its crop rect. There is only ever one copy of the pixels:
 * `avatar` is the original the user uploaded, and the crop is applied here rather than baked into
 * a second cropped image. The Gallery can show the whole thing.
 *
 * The crop is fractions of natural size. Blowing the image up to `1/w` of the box and offsetting it
 * by `-x/w` lands exactly the cropped region in view. Doing the same on both axes independently
 * keeps it undistorted: the fractions are of different natural dimensions.
 *
 * `className` is the caller's and carries the size. Every call site already styles `.avatar` (or
 * its own class) with a width and height.
 */
export function Avatar({
  of,
  name = '',
  className = 'avatar',
  title,
  onClick,
}: {
  of: AvatarSource | null | undefined
  /** Drawn as an initial when there is no image. Empty renders nothing at all. */
  name?: string
  className?: string
  title?: string
  onClick?: () => void
}) {
  const src = of?.avatar ?? ''
  const crop = of?.avatarCrop

  if (!src) {
    if (!name) return null
    return (
      <span className={`${className} initial`} title={title} onClick={onClick} aria-label={name}>
        {name.charAt(0).toUpperCase() || '?'}
      </span>
    )
  }

  // No crop: the plain <img> the app used before, so PNG-card avatars keep their object-fit framing.
  if (!crop) {
    return <img className={className} src={src} alt="" title={title} onClick={onClick} />
  }

  return (
    <span className={`${className} cropped`} title={title} onClick={onClick}>
      <img
        src={src}
        alt=""
        style={{
          width: `${100 / crop.w}%`,
          height: `${100 / crop.h}%`,
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
        }}
      />
    </span>
  )
}
