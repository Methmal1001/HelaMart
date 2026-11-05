/** Returns & refunds (HelaMart API /me/returns and /admin/store/returns). */
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'refunded' | 'withdrawn'
export type ReturnReason = 'damaged' | 'spoiled' | 'wrong_item' | 'missing' | 'not_as_described' | 'changed_mind'
export type StockAction = 'restock' | 'write_off'
export type RefundMethod = 'original' | 'cash' | 'bank_transfer'

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
  resolution: 'refund'
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
  paymentMethod?: 'cod' | 'card'
  orderTotalCents?: number
  orderRefundedCents?: number
  receivedAt?: string | null
  receivedVia?: string | null
  reviewedBy?: string | null
  refundedBy?: string | null
  customerReturnCount?: number
  requestedRefundCents?: number
}

export interface ReturnCounts {
  requested: number
  approved: number
  refunded: number
  rejected: number
  overdue: number
}
