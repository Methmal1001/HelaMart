/** Error shape every service throws — mirrors an HTTP error response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isUnauthorized(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 401
}
