import { ApiError } from './apiError'

/**
 * True when the storefront should use the HelaMart API (NUXT_PUBLIC_API_BASE is set).
 * Off by default: everything runs on the in-browser sample data. Parts the API doesn't
 * serve yet (delivery areas, branding, store offers, categories, banners…) always use
 * the in-browser data.
 */
export function backendEnabled() {
  return !!useRuntimeConfig().public.apiBase
}

/**
 * Calls the HelaMart API (`runtimeConfig.public.apiBase`, e.g. http://localhost:5206/api).
 * Error responses are `{ status, message, code }`; they're thrown as ApiError so callers
 * keep handling failures exactly as they did with the mock backend.
 */
export async function api<T>(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown; token?: string | null; query?: Record<string, string | undefined> } = {},
): Promise<T> {
  const base = useRuntimeConfig().public.apiBase.replace(/\/+$/, '')
  const url = new URL(`${base}${path}`, typeof window === 'undefined' ? 'http://localhost' : window.location.href)
  for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined) url.searchParams.set(k, v)

  let res: Response
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    // Status 0: network failure. Not a 401, so a signed-in session is kept and retried later.
    throw new ApiError(0, 'Can’t reach HelaMart right now. Check your connection and try again.', 'NETWORK')
  }

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON body (e.g. a proxy error page) */
  }
  if (!res.ok) {
    const err = (data ?? {}) as { message?: string; code?: string }
    throw new ApiError(res.status, err.message ?? `Request failed (${res.status}).`, err.code)
  }
  return data as T
}
