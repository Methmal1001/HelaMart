/** Returns & refunds (HelaMart API /me/returns and /admin/store/returns). */
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'refunded' | 'replaced' | 'withdrawn'
/** refund, or replace: send the items again at no charge. */
export type Resolution = 'refund' | 'replace'
export type ReturnReason = 'damaged' | 'spoiled' | 'wrong_item' | 'missing' | 'not_as_described' | 'changed_mind'
export type StockAction = 'restock' | 'write_off'
export type RefundMethod = 'original' | 'cash' | 'bank_transfer' | 'store_credit'

export interface ReturnableLine {
  lineNumber: number
  productId: string
  name: string
  size: string
  quantity: number
  /** Bought, minus what other returns already hold. */
  returnableQuantity: number
  /** What the customer paid for the whole line (after offers). */
  paidCents: number
}

export interface Returnable {
  eligible: boolean
  reason?: string | null
  deadline?: string | null
  lines: ReturnableLine[]
  reasons: Record<ReturnReason, string>
  /** Reasons that need a photo. */
  photoReasons: ReturnReason[]
  /** The store's return window and whether it offers replacements. */
  windowHours: number
  replacements: boolean
}

export interface ReturnItem {
  lineNumber: number
  productId: string
  name: string
  size: string
  quantity: number
  approvedQuantity?: number | null
  reason: ReturnReason
  reasonLabel: string
  refundCents: number
  stockAction?: StockAction | null
}

export interface ReturnEvent {
  at: string
  status: ReturnStatus
  label: string
  by: string
  note?: string | null
}

export interface ReturnRequest {
  id: string
  number: string
  orderId: string
  orderNumber: string
  status: ReturnStatus
  statusLabel: string
  resolution: Resolution
  preferredResolution: Resolution
  createdAt: string
  customerNote: string
  items: ReturnItem[]
  photoIds: string[]
  /** Approved refund (or, while waiting, what the request would refund). */
  refundCents: number
  deliveryRefundCents: number
  decisionNote?: string | null
  reviewedAt?: string | null
  refundMethod?: RefundMethod | null
  refundMethodLabel?: string | null
  refundReference?: string | null
  refundedAt?: string | null
  events: ReturnEvent[]
  storeName?: string | null
  branchName?: string | null
  // ---- the store's view only
  branchId?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  paymentMethod?: 'cod' | 'card' | 'credit' | 'none'
  orderTotalCents?: number
  orderRefundedCents?: number
  receivedAt?: string | null
  receivedVia?: string | null
  reviewedBy?: string | null
  refundedBy?: string | null
  customerReturnCount?: number
  requestedRefundCents?: number
  cardLast4?: string | null
  /** Store credit used to pay for the order (goes back as store credit). */
  orderStoreCreditCents?: number
  /** How much can still go back by card / cash / bank; anything above it is refunded as store credit. */
  paidOutLeftCents?: number
  // ---- both
  creditNote?: CreditNote | null
  replacementOrderId?: string | null
  replacementOrderNumber?: string | null
  /** Approved above the store's limit: a supervisor confirms before the refund is paid. */
  needsSupervisor: boolean
  escalation?: ReturnEscalation | null
  /** Customer: can ask HelaMart to review now. */
  canEscalate: boolean
  // ---- store / HelaMart only
  risk?: ReturnRisk | null
  approvalLimitCents?: number | null
  canApproveLarge?: boolean
}

export interface ReturnEscalation {
  status: 'open' | 'upheld' | 'overturned'
  at: string
  reason: string
  note?: string | null
  resolvedAt?: string | null
  resolvedBy?: string | null
}

/** Warning signs from the customer's history with the store. */
export interface ReturnRisk {
  level: 'normal' | 'watch' | 'high'
  reasons: string[]
  orders: number
  returns: number
  returns30Days: number
  refunded90DaysCents: number
}

export interface ReturnPolicy {
  windowHours: number
  reasons: ReturnReason[]
  photosRequired: boolean
  replacements: boolean
  approvalLimitCents: number | null
}

export interface ReturnSummary {
  days: number
  requests: number
  decided: number
  approved: number
  approvalRate: number
  refundedCents: number
  replacements: number
  averageHoursToDecision: number | null
  writtenOffUnits: number
  writtenOffCents: number
  escalations: number
  topReasons: { reason: ReturnReason; label: string; items: number }[]
}

/** Issued when a return is refunded: how the money went back and the VAT in it. */
export interface CreditNote {
  id: string
  number: string
  issuedAt: string
  goodsCents: number
  deliveryCents: number
  totalCents: number
  method: RefundMethod
  methodLabel: string
  /** Paid back by card / cash / bank; the rest went to store credit. */
  paidOutCents: number
  storeCreditCents: number
  reference?: string | null
  gatewayReference?: string | null
  cardLast4?: string | null
  taxableCents: number
  vatCents: number
  vatPercent?: number | null
  vatNumber?: string | null
  customerName: string
  orderNumber: string
  orderDate: string
  branchAddress?: string | null
  /** e.g. "Rs. 200.00 to card •••• 4242 + Rs. 52.77 as store credit" */
  summary: string
  // ---- the store's view only
  commissionCents?: number | null
  costCents?: number | null
  issuedBy?: string | null
}

export interface StoreCreditEntry {
  at: string
  kind: 'refund' | 'spent' | 'returned'
  label: string
  amountCents: number
  balanceAfterCents: number
  reference: string
}

/** The customer's store credit with one supermarket. */
export interface StoreCredit {
  storeId: string
  storeName: string
  balanceCents: number
  entries: StoreCreditEntry[]
}

export interface ReturnCounts {
  requested: number
  approved: number
  refunded: number
  rejected: number
  overdue: number
  replaced: number
  /** Approved refunds above the limit, waiting for a supervisor. */
  supervisor: number
  /** Open HelaMart reviews. */
  escalated: number
}
