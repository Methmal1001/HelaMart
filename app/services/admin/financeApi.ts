import { apiGet as get, apiSend as send } from './common'

/**
 * Financial records the reports can't work out by themselves (HelaMart backend): cash handed in at a branch, and what
 * supermarkets have paid HelaMart. Both are append-only: a mistake is corrected with a negative entry and a note.
 */

export interface CashBalance {
  branchId: string
  branchName: string
  collectorName: string
  collectedCents: number
  handedInCents: number
  outstandingCents: number
}

export interface CashHandover {
  id: number
  branchId: string
  branchName: string
  collectorName: string
  amountCents: number
  at: string
  recordedBy: string
  note?: string | null
}

export function listCashHandovers(token: string): Promise<{ balances: CashBalance[]; recent: CashHandover[] }> {
  return get(token, '/admin/store/cash-handovers')
}

export function recordCashHandover(token: string, input: { branchId: string; collectorName: string; amountCents: number; note: string }): Promise<CashHandover> {
  return send(token, 'POST', '/admin/store/cash-handovers', input)
}

export interface CommissionBalance {
  tenantId: string
  tenantName: string
  status: string
  commissionPercent: number
  chargedCents: number
  reversedCents: number
  paidCents: number
  outstandingCents: number
  /** Commission from finished months that hasn't been paid. */
  dueCents: number
  lastPaidOn?: string | null
  lastReference?: string | null
}

export interface CommissionPayment {
  id: number
  tenantId: string
  tenantName: string
  paidOn: string
  amountCents: number
  reference: string
  note?: string | null
  recordedBy: string
  recordedAt: string
}

export function listCommission(token: string): Promise<{ balances: CommissionBalance[]; recent: CommissionPayment[] }> {
  return get(token, '/admin/platform/commission-payments')
}

export function recordCommissionPayment(token: string, input: { tenantId: string; paidOn: string; amountCents: number; reference: string; note: string }): Promise<CommissionPayment> {
  return send(token, 'POST', '/admin/platform/commission-payments', input)
}
