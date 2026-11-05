import type { Returnable, ReturnReason, ReturnRequest } from '~/types/returns'
import { api, apiImage } from './http'

/**
 * The customer's returns (HelaMart API):
 *   GET /me/orders/{id}/returnable · POST /me/orders/{id}/returns · GET /me/returns
 *   POST /me/returns/{id}/withdraw · GET /me/returns/{id}/photos/{photoId}
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

export function myReturnPhoto(token: string, id: string, photoId: string): Promise<string> {
  return apiImage(`/me/returns/${enc(id)}/photos/${enc(photoId)}`, token)
}
