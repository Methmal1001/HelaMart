import { ApiError } from './apiError'
import type { ApiErrorBody } from './apiTypes'

/**
 * HelaMart API client. The base URL is `runtimeConfig.public.apiBase`
 * (http://localhost:5206/api by default; override with NUXT_PUBLIC_API_BASE).
 *
 * Every non-2xx response `{ status, message, code }` is thrown as an ApiError,
 * so the UI shows `message` and branches on `code`. Bearer tokens are added by
 * the caller (useAuth().authorized handles refresh-and-retry and the single
 * in-flight refresh).
 */

/** True when the storefront talks to the HelaMart API (the default). An empty apiBase runs the offline demo data. */
export function backendEnabled() {
  return !!useRuntimeConfig().public.apiBase
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Sent as JSON, or as multipart form data when it is a FormData (image uploads). */
  body?: unknown
  /** Access token for protected endpoints (`Authorization: Bearer …`). */
  token?: string | null
  query?: Record<string, string | number | undefined | null>
  /** Abort after this long (default 15 s). */
  timeoutMs?: number
  /** Lets the caller cancel the request (e.g. a "Stop" button); it then fails with code ABORTED. */
  signal?: AbortSignal
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const base = useRuntimeConfig().public.apiBase.replace(/\/+$/, '')
  const url = new URL(`${base}${path}`, typeof window === 'undefined' ? 'http://localhost' : window.location.href)
  for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  // File uploads go as multipart form data (the browser sets the boundary).
  const form = options.body instanceof FormData

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000)
  const cancel = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', cancel, { once: true })
  let res: Response
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: form ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    })
  } catch {
    // Cancelled by the caller: not a connection problem.
    if (options.signal?.aborted) throw new ApiError(0, 'Stopped.', 'ABORTED')
    reportReachable(false)
    // Status 0: the API couldn't be reached. Not a 401, so a signed-in session is kept and retried later.
    throw new ApiError(0, 'Can’t reach HelaMart right now. Check your connection and try again.', 'NETWORK')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }
  reportReachable(true)

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON body (e.g. a proxy error page) */
  }
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>
    const fallback = res.status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : `Request failed (${res.status}).`
    throw new ApiError(err.status ?? res.status, err.message || fallback, err.code ?? (res.status >= 500 ? 'SERVER_ERROR' : undefined))
  }
  return data as T
}

// ------------------------------------------------------------------ API health ("API offline" banner)

/** Shared reachability flag: false after a request can't reach the API, true again on the next success. */
export function useApiStatus() {
  return useState<'unknown' | 'online' | 'offline'>('api-status', () => 'unknown')
}
function reportReachable(ok: boolean) {
  if (typeof window === 'undefined') return
  try {
    useApiStatus().value = ok ? 'online' : 'offline'
  } catch {
    /* outside a Nuxt context */
  }
}

/** GET /health — `{ status: "ok" }`, or 503 when the database is down. */
export async function checkHealth(): Promise<boolean> {
  try {
    const r = await api<{ status: string }>('/health', { timeoutMs: 5000 })
    return r?.status === 'ok'
  } catch (e) {
    // 503: the API answers but its database is down — still "offline" for shoppers.
    if (e instanceof ApiError && e.status !== 0) useApiStatus().value = 'offline'
    return false
  }
}

/**
 * For features that change data the HelaMart API owns (products, permissions) but that it
 * doesn't serve yet: fail clearly rather than change only this browser's copy.
 */
export function notOnApiYet(what: string): never {
  throw new ApiError(501, `${what} isn’t available yet — it needs a HelaMart API update.`, 'NOT_IMPLEMENTED')
}
