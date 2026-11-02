import type { AdminOrder, OrderReceipt } from '~/types/admin'
import { ApiError } from '../apiError'
import type { AdminDb } from './db'
import { audit } from './security'
import { atHandover, currentStage, deriveStatus, isFinished } from '~/lib/workflow'

const VIA: Record<OrderReceipt['via'], string> = {
  customer_qr: 'Customer (scanned the slip QR)',
  customer_app: 'Customer (HelaMart app)',
  staff: '',
}

/**
 * Hand-over: the order reached the customer. Finishes the last section
 * (Delivery / Pickup counter) whoever confirms it — the customer scanning the
 * slip's QR code, the customer in the app, or the rider / counter officer.
 */
export function markReceived(db: AdminDb, o: AdminOrder, receipt: Omit<OrderReceipt, 'at'>) {
  if (o.status === 'cancelled' || o.status === 'refunded') throw new ApiError(409, `This order was ${o.status}.`)
  if (isFinished(o)) return o // already confirmed — scanning twice is harmless
  if (!atHandover(o)) throw new ApiError(409, 'This order hasn’t left the store yet. You can confirm it once it’s out for delivery or ready to collect.', 'NOT_HANDED_OVER')
  const at = new Date().toISOString()
  const cur = currentStage(o)!
  const by = receipt.via === 'staff' ? (receipt.staffName ?? 'Staff') : VIA[receipt.via]
  Object.assign(cur, { state: 'done', completedAt: at, completedBy: by, holdReason: undefined, startedAt: cur.startedAt ?? at })
  o.stageIndex = (o.stageIndex ?? 0) + 1
  o.received = { ...receipt, at }
  // Cash on delivery is collected at the door / counter.
  if (o.payment.method === 'cod') o.payment.status = 'paid'
  o.status = deriveStatus(o)
  const who = receipt.receivedBy ? ` by ${receipt.receivedBy}` : ''
  o.history.push({ at, status: o.status, by, note: `${o.delivery.method === 'pickup' ? 'Collected' : 'Received'}${who}` })
  audit(db, { staff: null, name: by }, 'order.received', o.number, `${cur.name} · ${o.delivery.method === 'pickup' ? 'collected' : 'received'}${who}`, 'info', o.tenantId)
  return o
}
