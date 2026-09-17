import { useRef, useState } from 'react'
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import type { AvatarCrop } from '../../core/storage/types'

/**
 * Both halves of a confirmed crop. Avatars keep `crop` and the original image, so there's one copy
 * of the pixels; story covers take `dataUrl`, since they're stored as a finished image.
 */
export interface CropResult {
  crop: AvatarCrop
  dataUrl: string
}

/** Longest side of the exported image, px. Crops never display larger. */
const outputSize = 512

/** Center an aspect-locked crop (width/height) covering as much of the image as fits. */
function centerCrop(width: number, height: number, aspect: number): Crop {
  let w = width
  let h = width / aspect
  if (h > height) {
    h = height
    w = height * aspect
  }
  return { unit: 'px', width: w, height: h, x: (width - w) / 2, y: (height - h) / 2 }
}

/**
 * Crop an uploaded image to a fixed aspect ratio (square by default). react-image-crop draws the
 * movable/resizable box (aspect locked); the export to a data URL is our own canvas draw, the
 * library doesn't produce the cropped image.
 */
export default function AvatarCropDialog({
  src,
  aspect = 1,
  title = 'Crop avatar',
  initialCrop,
  onCancel,
  onConfirm,
}: {
  src: string
  aspect?: number
  title?: string
  /** Fractions of natural size. Re-cropping an existing avatar opens on its current frame. */
  initialCrop?: AvatarCrop
  onCancel: () => void
  onConfirm: (result: CropResult) => void
}) {
  const outW = aspect >= 1 ? outputSize : Math.round(outputSize * aspect)
  const outH = aspect >= 1 ? Math.round(outputSize / aspect) : outputSize
  const imgRef = useRef<HTMLImageElement>(null)
  const [crop, setCrop] = useState<Crop>()
  const [pixelCrop, setPixelCrop] = useState<PixelCrop>()

  function confirm() {
    const image = imgRef.current
    if (!image || !pixelCrop) return
    // The <img> is scaled to fit the dialog; map the on-screen crop back to natural pixels.
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(
      image,
      pixelCrop.x * scaleX,
      pixelCrop.y * scaleY,
      pixelCrop.width * scaleX,
      pixelCrop.height * scaleY,
      0,
      0,
      outW,
      outH,
    )
    onConfirm({
      crop: {
        x: (pixelCrop.x * scaleX) / image.naturalWidth,
        y: (pixelCrop.y * scaleY) / image.naturalHeight,
        w: (pixelCrop.width * scaleX) / image.naturalWidth,
        h: (pixelCrop.height * scaleY) / image.naturalHeight,
      },
      dataUrl: canvas.toDataURL('image/png'),
    })
  }

  return (
    <div className="dialogBackdrop" onClick={onCancel}>
      <div className="panel dialog avatarCropDialog" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

        <ReactCrop
          crop={crop}
          onChange={(c) => setCrop(c)}
          onComplete={(c) => setPixelCrop(c)}
          aspect={aspect}
          circularCrop={false}
          keepSelection
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            onLoad={(e) => {
              const { width, height } = e.currentTarget
              // The stored crop is fractions of natural size; the <img> here is scaled to fit.
              const c: Crop = initialCrop
                ? {
                    unit: 'px',
                    x: initialCrop.x * width,
                    y: initialCrop.y * height,
                    width: initialCrop.w * width,
                    height: initialCrop.h * height,
                  }
                : centerCrop(width, height, aspect)
              setCrop(c)
              setPixelCrop({ ...c, unit: 'px' } as PixelCrop)
            }}
          />
        </ReactCrop>

        <div className="dialogActions">
          <button type="button" disabled={!pixelCrop?.width} onClick={confirm}>
            Use crop
          </button>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
