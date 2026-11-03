import { backendEnabled } from '../http'
/**
 * MOCK MEDIA SERVER — product photos are stored as Blobs in IndexedDB
 * (large quota, unlike localStorage). Products reference them as `media:<id>`.
 * With a real backend this becomes an object store / CDN URL.
 */

const DB_NAME = 'helamart-media'
const STORE = 'images'
let dbPromise: Promise<IDBDatabase> | null = null
const urlCache = new Map<string, string>()

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const putMedia = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id)).then(() => undefined)
export const getMedia = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id))
export const deleteMedia = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined)

export const isMediaRef = (ref?: string): ref is string => !!ref && /^media:[a-f0-9]{8,64}$/.test(ref)

/** With the HelaMart API, `media:<id>` images are served by GET /media/{id}. */
function apiMediaUrl(ref: string): string | null {
  // The /admin portal still keeps its uploads in this browser until it moves to the API.
  if (!backendEnabled() || (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'))) return null
  return `${useRuntimeConfig().public.apiBase.replace(/\/+$/, '')}/media/${encodeURIComponent(ref.slice(6))}`
}

/** Browser-displayable URL for an image reference (null when there's no image). */
export async function resolveImageUrl(ref?: string): Promise<string | null> {
  if (!ref) return null
  if (/^(https?:|data:image\/)/.test(ref)) return ref
  if (!isMediaRef(ref)) return null
  const remote = apiMediaUrl(ref)
  if (remote) return remote
  const cached = urlCache.get(ref)
  if (cached) return cached
  try {
    const blob = await getMedia(ref.slice(6))
    if (!blob) return null
    const url = URL.createObjectURL(blob)
    urlCache.set(ref, url)
    return url
  } catch {
    return null
  }
}

/** Decoded image for drawing into canvases / WebGL textures. */
export async function loadImageSource(ref?: string): Promise<ImageBitmap | null> {
  if (!ref) return null
  try {
    const remote = isMediaRef(ref) ? apiMediaUrl(ref) : null
    if (remote) {
      const res = await fetch(remote, { mode: 'cors' })
      return res.ok ? await createImageBitmap(await res.blob()) : null
    }
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
