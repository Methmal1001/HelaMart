import type { FulfilmentMethod, TrackingStep } from '~/types'
import type { AdminOrder, OrderStage, OrderStatus, OrderWorkflow, StageState, WorkflowStage } from '~/types/admin'

/**
 * Order fulfilment workflow. Every supermarket runs online orders through its
 * own sections (Cashier → Packing → Verification → Delivery by default); the
 * chain admin can rename, reorder, add or remove sections and assign officers.
 * Each order keeps its own copy of the sections it was placed with, so a
 * workflow change never scrambles orders already in progress.
 */

export const STANDARD_STAGES: Omit<WorkflowStage, 'officerIds'>[] = [
  {
    id: 'stg_cashier', name: 'Cashier', icon: 'cash', appliesTo: 'all',
    description: 'Check the order, prices and payment, then approve it — or reject it with a reason.',
    completeLabel: 'Approve order', customerActiveLabel: 'Confirming your order', customerDoneLabel: 'Order approved',
    customerHint: 'The cashier has checked your order and payment.', printSlip: true,
  },
  {
    id: 'stg_packing', name: 'Packing', icon: 'package', appliesTo: 'all',
    description: 'Pick every item from the shelves and pack it carefully (chilled items last).',
    completeLabel: 'Packing done', customerActiveLabel: 'Packing your items', customerDoneLabel: 'Packed',
    customerHint: 'Your items are picked from the shelves and packed.',
  },
  {
    id: 'stg_verify', name: 'Verification', icon: 'shield', appliesTo: 'all',
    description: 'Check the packed items against the bill — items, quantities and expiry dates — then seal the bags.',
    completeLabel: 'Verified & sealed', customerActiveLabel: 'Checking your items', customerDoneLabel: 'Checked & sealed',
    customerHint: 'Every item is checked against your bill and sealed.',
  },
  {
    id: 'stg_delivery', name: 'Delivery', icon: 'truck', appliesTo: 'delivery',
    description: 'Take the sealed order to the customer. Collect cash for cash-on-delivery orders.',
    completeLabel: 'Customer received', customerActiveLabel: 'Out for delivery', customerDoneLabel: 'Delivered',
    customerHint: 'Handed over at your door.',
  },
  {
    id: 'stg_pickup', name: 'Pickup counter', icon: 'store', appliesTo: 'pickup',
    description: 'Hand the sealed order to the customer at the pickup counter and check their order number.',
    completeLabel: 'Customer collected', customerActiveLabel: 'Ready to collect', customerDoneLabel: 'Collected',
    customerHint: 'Collected at the pickup counter.',
  },
]

export function defaultWorkflow(tenantId: string, officers: Partial<Record<string, string[]>> = {}): OrderWorkflow {
  return {
    tenantId,
    stages: STANDARD_STAGES.map((s) => ({ ...s, officerIds: [...(officers[s.id] ?? [])] })),
    updatedAt: new Date().toISOString(),
  }
}

export const stageApplies = (s: Pick<WorkflowStage, 'appliesTo'>, method: FulfilmentMethod) => s.appliesTo === 'all' || s.appliesTo === method

/** The sections an order goes through, copied from the workflow. */
export function snapshotStages(workflow: OrderWorkflow, method: FulfilmentMethod): OrderStage[] {
  return workflow.stages.filter((s) => stageApplies(s, method)).map((s) => ({
    stageId: s.id, name: s.name, icon: s.icon, completeLabel: s.completeLabel,
    customerActiveLabel: s.customerActiveLabel, customerDoneLabel: s.customerDoneLabel, customerHint: s.customerHint,
    state: 'waiting' as StageState, notes: [], printSlip: s.printSlip,
  }))
}

export function currentStage(o: AdminOrder): OrderStage | null {
  return o.stages?.[o.stageIndex ?? 0] ?? null
}
export const isFinished = (o: AdminOrder) => !!o.stages && (o.stageIndex ?? 0) >= o.stages.length
export const isClosed = (o: AdminOrder) => o.status === 'cancelled' || o.status === 'refunded' || isFinished(o)

/** On the last section (with the rider / at the pickup counter): the customer can confirm they have it. */
export const atHandover = (o: AdminOrder) => !isClosed(o) && !!o.stages?.length && (o.stageIndex ?? 0) === o.stages.length - 1

/** The overall status (reports, filters, customer chips) follows the sections. */
export function deriveStatus(o: AdminOrder): OrderStatus {
  if (o.status === 'cancelled' || o.status === 'refunded') return o.status
  if (!o.stages?.length) return o.status
  const i = o.stageIndex ?? 0
  if (i >= o.stages.length) return 'delivered'
  const s = o.stages[i]!
  const last = i === o.stages.length - 1
  if (i === 0 && s.state === 'waiting') return 'pending'
  if (last && o.delivery.method === 'pickup') return 'ready_for_pickup'
  if (last && s.state !== 'waiting') return 'out_for_delivery'
  return 'packing'
}

/**
 * Give an older order (placed before workflows) its sections, positioned to
 * match its status, so it can be worked on the order desk.
 */
export function attachStages(o: AdminOrder, workflow: OrderWorkflow) {
  if (o.stages) return
  const stages = snapshotStages(workflow, o.delivery.method)
  const last = stages.length - 1
  const at = (o.history.at(-1) ?? { at: o.createdAt }).at
  let index = 0
  if (o.status === 'delivered' || o.status === 'refunded') index = stages.length
  else if (o.status === 'out_for_delivery' || o.status === 'ready_for_pickup') index = last
  else if (o.status === 'packing') index = Math.min(1, last)
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i]!
    if (i < index) Object.assign(s, { state: 'done', startedAt: at, completedAt: at, completedBy: 'Branch team' })
    else if (i === index && (o.status === 'packing' || o.status === 'out_for_delivery')) Object.assign(s, { state: 'in_progress', startedAt: at, assigneeName: 'Branch team' })
  }
  o.stages = stages
  o.stageIndex = o.status === 'cancelled' ? 0 : index
}

/** The customer's view of an order's journey through the supermarket's sections. */
export function trackingSteps(o: AdminOrder, storeName?: string): TrackingStep[] {
  const steps: TrackingStep[] = [{ label: 'Order placed', hint: `${storeName ?? 'The supermarket'} has received your order.`, icon: 'receipt', state: 'done', at: o.createdAt }]
  const stages = o.stages ?? []
  const index = o.stageIndex ?? 0
  const pickup = o.delivery.method === 'pickup'
  stages.forEach((s, i) => {
    const shared = s.notes.filter((n) => n.shared).map((n) => ({ at: n.at, text: n.text }))
    const notes = shared.length ? shared : undefined
    if (i < index) return steps.push({ label: s.customerDoneLabel, hint: s.customerHint, icon: s.icon, state: 'done', at: s.completedAt, notes })
    if (i > index) return steps.push({ label: s.customerDoneLabel, icon: s.icon, state: 'todo' })
    // The section the order is in now.
    const lastPickup = pickup && i === stages.length - 1
    if (s.state === 'on_hold') return steps.push({ label: s.customerActiveLabel, hint: 'Short delay — the store is sorting it out.', icon: s.icon, state: 'hold', at: s.startedAt, notes })
    if (s.state === 'waiting' && !lastPickup) return steps.push({ label: `Waiting for ${s.name.toLowerCase()}`, hint: `The ${s.name.toLowerCase()} team will pick it up shortly.`, icon: s.icon, state: 'current', notes })
    steps.push({ label: s.customerActiveLabel, hint: lastPickup ? 'Bring your order number to the pickup counter.' : undefined, icon: s.icon, state: 'current', at: s.startedAt, notes })
  })
  return steps
}

/** Where the order is now, in the customer's words. */
export function stageLabel(o: AdminOrder): string | undefined {
  if (o.status === 'cancelled' || o.status === 'refunded') return undefined
  const steps = trackingSteps(o)
  const now = steps.find((s) => s.state === 'current' || s.state === 'hold')
  return now ? (now.state === 'hold' ? `${now.label} (delayed)` : now.label) : steps.at(-1)?.label
}
