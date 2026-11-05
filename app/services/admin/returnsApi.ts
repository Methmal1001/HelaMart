import type { RefundMethod, ReturnCounts, ReturnRequest, StockAction } from '~/types/returns'
import { apiImage } from '../http'
import { apiGet as get, apiSend as send, encodeId as id } from './common'

/**
 * The supermarket's returns queue (HelaMart API /admin/store/returns). Call with `useAdminAuth().call`
 * (refunds need the password confirmed).
 */
export function listReturns(token: string, filter: { status?: string; branch?: string } = {}): Promise<{ returns: ReturnRequest[]; counts: ReturnCounts }> {
  return get(token, '/admin/store/returns', filter)
}

export function getReturn(token: string, returnId: string): Promise<ReturnRequest> {
  return get(token, `/admin/store/returns/${id(returnId)}`)
}

export interface ReviewInput {
  decision: 'approve' | 'reject'
  items?: { lineNumber: number; approvedQuantity: number; stockAction: StockAction | null }[]
  note: string
}

export function reviewReturn(token: string, returnId: string, input: ReviewInput): Promise<ReturnRequest> {
  return send(token, 'POST', `/admin/store/returns/${id(returnId)}/review`, input)
}

export function recordRefund(token: string, returnId: string, input: { method: RefundMethod; reference: string; note: string }): Promise<ReturnRequest> {
  return send(token, 'POST', `/admin/store/returns/${id(returnId)}/refund`, input)
}

export function returnPhoto(token: string, returnId: string, photoId: string): Promise<string> {
  return apiImage(`/admin/store/returns/${id(returnId)}/photos/${id(photoId)}`, token)
}
