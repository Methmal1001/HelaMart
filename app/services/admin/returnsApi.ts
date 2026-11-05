import type { RefundMethod, Resolution, ReturnCounts, ReturnPolicy, ReturnRequest, ReturnSummary, StockAction } from '~/types/returns'
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
  /** Refund it, or send the items again (replacement order). */
  resolution?: Resolution
}

export function reviewReturn(token: string, returnId: string, input: ReviewInput): Promise<ReturnRequest> {
  return send(token, 'POST', `/admin/store/returns/${id(returnId)}/review`, input)
}

export function recordRefund(token: string, returnId: string, input: { method: RefundMethod; reference: string; note: string }): Promise<ReturnRequest> {
  return send(token, 'POST', `/admin/store/returns/${id(returnId)}/refund`, input)
}

/** A supervisor confirms a refund above the store's approval limit (returns.approve_large). */
export function confirmReturn(token: string, returnId: string): Promise<ReturnRequest> {
  return send(token, 'POST', `/admin/store/returns/${id(returnId)}/confirm`)
}

export function returnsSummary(token: string, filter: { days?: number; branch?: string } = {}): Promise<ReturnSummary> {
  return get(token, '/admin/store/returns/summary', { days: filter.days ? String(filter.days) : undefined, branch: filter.branch })
}

export function getReturnPolicy(token: string): Promise<ReturnPolicy> {
  return get(token, '/admin/store/returns/policy')
}

/** settings.manage, with the password confirmed. */
export function saveReturnPolicy(token: string, policy: ReturnPolicy): Promise<ReturnPolicy> {
  return send(token, 'PUT', '/admin/store/returns/policy', policy)
}

// ---- HelaMart head office: returns customers asked HelaMart to review (platform.disputes)

export function listDisputes(token: string, status: string): Promise<{ returns: ReturnRequest[]; counts: ReturnCounts }> {
  return get(token, '/admin/platform/disputes', { status })
}

export function resolveDispute(token: string, returnId: string, input: { decision: 'uphold' | 'overturn'; note: string }): Promise<ReturnRequest> {
  return send(token, 'POST', `/admin/platform/disputes/${id(returnId)}/resolve`, input)
}

export function disputePhoto(token: string, returnId: string, photoId: string): Promise<string> {
  return apiImage(`/admin/platform/disputes/${id(returnId)}/photos/${id(photoId)}`, token)
}

export function returnPhoto(token: string, returnId: string, photoId: string): Promise<string> {
  return apiImage(`/admin/store/returns/${id(returnId)}/photos/${id(photoId)}`, token)
}
