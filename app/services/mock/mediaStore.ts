/**
 * Uploaded images (product photos, store logos and banners, homepage banners) live in the
 * HelaMart database. Records reference them as `media:<id>`; GET /media/:id serves the bytes
 * (cached by the browser for a year: ids are random and an image never changes).
 */

const urlCache = new Map<string, string>()

export const isMediaRef = (ref?: string): ref is string => !!ref && /^media:[a-f0-9]{8,64}$/.test(ref)

function mediaUrl(id: string) {
  return `${useRuntimeConfig().public.apiBase.replace(/\/+$/, '')}/media/${encodeURIComponent(id)}`
}

/** The image's bytes (undefined when it doesn't exist). */
export async function getMedia(id: string): Promise<Blob | undefined> {
  const res = await fetch(mediaUrl(id), { mode: 'cors' })
  return res.ok ? await res.blob() : undefined
}

/** Browser-displayable URL for an image reference (null when there's no image). */
export async function resolveImageUrl(ref?: string): Promise<string | null> {
  if (!ref) return null
  if (/^(https?:|data:image\/)/.test(ref)) return ref
  if (!isMediaRef(ref)) return null
  const cached = urlCache.get(ref)
  if (cached) return cached
  const url = mediaUrl(ref.slice(6))
  urlCache.set(ref, url)
  return url
}

/** Decoded image for drawing into canvases / WebGL textures. */
export async function loadImageSource(ref?: string): Promise<ImageBitmap | null> {
  if (!ref) return null
  try {
    if (isMediaRef(ref)) {
      const blob = await getMedia(ref.slice(6))
      return blob ? await createImageBitmap(blob) : null
    }
    if (/^(https?:|data:image\/)/.test(ref)) {
      const res = await fetch(ref, { mode: 'cors' })
      return await createImageBitmap(await res.blob())
    }
  } catch {
    /* unreadable image → fall back to artwork */
  }
  return null
}
