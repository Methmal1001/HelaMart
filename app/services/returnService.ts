import type { Resolution, Returnable, ReturnReason, ReturnRequest, StoreCredit } from '~/types/returns'
import { api, apiImage } from './http'

/**
 * The customer's returns (HelaMart API):
 *   GET /me/orders/{id}/returnable · POST /me/orders/{id}/returns · GET /me/returns
 *   POST /me/returns/{id}/withdraw · POST /me/returns/{id}/escalate · GET /me/returns/{id}/photos/{photoId} · GET /me/store-credit
 */
const enc = encodeURIComponent

export function returnable(token: string, orderId: string): Promise<Returnable> {
  return api<Returnable>(`/me/orders/${enc(orderId)}/returnable`, { token })
}

export interface ReturnInput {
  items: { lineNumber: number; quantity: number; reason: ReturnReason }[]
  note: string
  /** JPEG data URLs (resized in the browser first). */
  photos: string[]
  /** What the customer would like (replace only if the store offers replacements). */
  resolution: Resolution
}

export function createReturn(token: string, orderId: string, input: ReturnInput): Promise<ReturnRequest> {
  return api<ReturnRequest>(`/me/orders/${enc(orderId)}/returns`, { method: 'POST', body: input, token, timeoutMs: 30000 })
}

export function myReturns(token: string): Promise<ReturnRequest[]> {
  return api<ReturnRequest[]>('/me/returns', { token })
}

export function withdrawReturn(token: string, id: string): Promise<ReturnRequest> {
  return api<ReturnRequest>(`/me/returns/${enc(id)}/withdraw`, { method: 'POST', token })
}

/** Ask HelaMart to review a rejected request, or one the store hasn't answered for 48 hours. */
export function escalateReturn(token: string, id: string, reason: string): Promise<ReturnRequest> {
  return api<ReturnRequest>(`/me/returns/${enc(id)}/escalate`, { method: 'POST', body: { reason }, token })
}

export function myReturnPhoto(token: string, id: string, photoId: string): Promise<string> {
  return apiImage(`/me/returns/${enc(id)}/photos/${enc(photoId)}`, token)
}

/** The customer's store credit with each supermarket, with its latest movements. */
export function myStoreCredit(token: string): Promise<StoreCredit[]> {
  return api<StoreCredit[]>('/me/store-credit', { token })
}
