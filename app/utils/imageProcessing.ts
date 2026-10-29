/**
 * Client-side processing for uploaded product photos:
 *  - accepts only real JPEG / PNG / WebP files (checked by file signature, not the extension);
 *    SVG and anything else is rejected (SVG can carry scripts)
 *  - re-encodes through a canvas, which strips EXIF / GPS / other metadata
 *  - resizes to at most 768 px and optionally cuts out a plain background
 *    so the pack sits naturally on the 3D shelf
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const MIN_SIDE = 200

export type ImageKind = 'jpeg' | 'png' | 'webp'

export async function sniffImageType(blob: Blob): Promise<ImageKind | null> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

export interface PreparedImage {
  blob: Blob
  url: string
  width: number
  height: number
  backgroundRemoved: boolean
}

export class ImageRejected extends Error {}

/** Flood-fill the plain background (colour of the border) to transparent, then crop to the product. */
function cutOutBackground(data: ImageData) {
  const { width: w, height: h, data: px } = data
  const at = (x: number, y: number) => (y * w + x) * 4
  // Background colour = average of the border pixels.
  let r = 0, g = 0, b = 0, n = 0
  for (let x = 0; x < w; x += 4) for (const y of [0, h - 1]) { const i = at(x, y); r += px[i]!; g += px[i + 1]!; b += px[i + 2]!; n++ }
  for (let y = 0; y < h; y += 4) for (const x of [0, w - 1]) { const i = at(x, y); r += px[i]!; g += px[i + 1]!; b += px[i + 2]!; n++ }
  r /= n; g /= n; b /= n
  const tol = 42
  const dist = (i: number) => Math.hypot(px[i]! - r, px[i + 1]! - g, px[i + 2]! - b)
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x)
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1)
  let cleared = 0
  while (stack.length) {
    const p = stack.pop()!
    if (seen[p]) continue
    seen[p] = 1
    const i = p * 4
    const d = dist(i)
    if (d > tol) continue
    // Soft edge: near-background pixels become partly transparent.
    px[i + 3] = d < tol * 0.6 ? 0 : Math.round(255 * ((d - tol * 0.6) / (tol * 0.4)))
    cleared++
    const x = p % w
    const y = (p - x) / w
    if (x > 0) stack.push(p - 1)
    if (x < w - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - w)
    if (y < h - 1) stack.push(p + w)
  }
  // Bounding box of what's left.
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[at(x, y) + 3]! > 24) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { cleared: cleared / (w * h), box: maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } }
}

export async function prepareProductImage(file: File, opts: { removeBackground: boolean }): Promise<PreparedImage> {
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageRejected('Photos must be 8 MB or smaller.')
  const kind = await sniffImageType(file)
  if (!kind) throw new ImageRejected('Upload a JPG, PNG or WebP photo. Other file types (including SVG) are not accepted.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageRejected('This photo can’t be read. Try exporting it again as JPG or PNG.')
  }
  if (bitmap.width < MIN_SIDE || bitmap.height < MIN_SIDE) throw new ImageRejected(`Photos must be at least ${MIN_SIDE} × ${MIN_SIDE} pixels.`)

  const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const work = document.createElement('canvas')
  work.width = w
  work.height = h
  const ctx = work.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  let out = work
  let backgroundRemoved = false
  if (opts.removeBackground) {
    const data = ctx.getImageData(0, 0, w, h)
    const { cleared, box } = cutOutBackground(data)
    // Only keep the cut-out if a meaningful plain background was found.
    if (box && cleared > 0.04 && box.w > 40 && box.h > 40) {
      ctx.putImageData(data, 0, 0)
      const pad = 6
      const crop = document.createElement('canvas')
      crop.width = box.w + pad * 2
      crop.height = box.h + pad * 2
      crop.getContext('2d')!.drawImage(work, box.x, box.y, box.w, box.h, pad, pad, box.w, box.h)
      out = crop
      backgroundRemoved = true
    }
  }

  const encode = (type: string) => new Promise<Blob | null>((r) => out.toBlob(r, type, 0.88))
  let blob = await encode('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/png')
  if (!blob) throw new ImageRejected('Could not process this photo.')
  return { blob, url: URL.createObjectURL(blob), width: out.width, height: out.height, backgroundRemoved }
}
