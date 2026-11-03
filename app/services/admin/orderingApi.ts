import type { AdminOrder, OrderStatus, OrderWorkflow } from '~/types/admin'
import { api, backendEnabled } from '../http'
import * as desk from './orderDeskApi'
import * as store from './tenantApi'
import type { DeskOrder, DeskView, OrderSlip, StageAction, StageInput, WorkflowView } from './orderDeskApi'

/**
 * The supermarket side of ordering — orders list, order desk (sections, stage
 * actions, slips) and the order workflow — on the HelaMart API
 * (`/api/admin/store/...`). Without an API (offline demo) the in-browser
 * implementations answer. Call these with `useAdminAuth().callApi`.
 */

const enc = encodeURIComponent

// ---- orders

export function listOrders(token: string): Promise<AdminOrder[]> {
  return backendEnabled() ? api('/admin/store/orders', { token }) : store.listOrders(token)
}

/** Cancel an open order or refund a delivered one (moving orders forward happens on the order desk). */
export function updateOrderStatus(token: string, orderId: string, status: OrderStatus, note = ''): Promise<AdminOrder> {
  return backendEnabled()
    ? api(`/admin/store/orders/${enc(orderId)}/status`, { method: 'PUT', body: { status, note }, token })
    : store.updateOrderStatus(token, orderId, status, note)
}

export function branchDirectory(token: string): Promise<{ id: string; name: string; status: string }[]> {
  return backendEnabled() ? api('/admin/store/branch-directory', { token }) : store.branchDirectory(token)
}

export { allowedTransitions } from './tenantApi'

// ---- how a branch hands orders over: home delivery, or pickup only

/** Each branch's delivery setting, as the API holds it (branchId → home delivery on). */
export async function branchDeliveryStates(token: string): Promise<Record<string, boolean>> {
  if (!backendEnabled()) return Object.fromEntries((await store.listBranches(token)).map((b) => [b.id, b.deliveryEnabled !== false]))
  const list = await api<{ id: string; deliveryEnabled?: boolean }[]>('/admin/store/branches', { token })
  return Object.fromEntries(list.map((b) => [b.id, b.deliveryEnabled !== false]))
}

/** Home delivery on, or pickup only (customers collect at the branch). */
export function setBranchDelivery(token: string, branchId: string, deliveryEnabled: boolean): Promise<{ id: string; deliveryEnabled?: boolean }> {
  return backendEnabled()
    ? api(`/admin/store/branches/${enc(branchId)}/delivery`, { method: 'PUT', body: { deliveryEnabled }, token })
    : store.setBranchDelivery(token, branchId, deliveryEnabled)
}

// ---- order desk

export function listDesk(token: string): Promise<DeskView> {
  return backendEnabled() ? api('/admin/store/desk', { token }) : desk.listDesk(token)
}

export function stageAction(
  token: string,
  orderId: string,
  input: { action: StageAction; note?: string; shared?: boolean; assigneeId?: string; receivedBy?: string },
): Promise<DeskOrder> {
  return backendEnabled() ? api(`/admin/store/orders/${enc(orderId)}/stage`, { method: 'POST', body: input, token }) : desk.stageAction(token, orderId, input)
}

/** The order slip (customer, delivery details, tracking QR). Records that it was printed. */
export function orderSlip(token: string, orderId: string): Promise<OrderSlip> {
  return backendEnabled() ? api(`/admin/store/orders/${enc(orderId)}/slip`, { token }) : desk.orderSlip(token, orderId)
}

// ---- order workflow (sections and their officers)

export function getWorkflow(token: string, branchId: string | null = null): Promise<WorkflowView> {
  return backendEnabled() ? api('/admin/store/workflow', { query: { branch: branchId }, token }) : desk.getWorkflow(token, branchId)
}

export function saveWorkflow(token: string, stages: StageInput[], branchId: string | null = null): Promise<OrderWorkflow> {
  return backendEnabled()
    ? api('/admin/store/workflow', { method: 'PUT', query: { branch: branchId }, body: { stages }, token })
    : desk.saveWorkflow(token, stages, branchId)
}

/** The branch goes back to the chain default. */
export function resetBranchWorkflow(token: string, branchId: string): Promise<void> {
  return backendEnabled() ? api('/admin/store/workflow', { method: 'DELETE', query: { branch: branchId }, token }) : desk.resetBranchWorkflow(token, branchId)
}

export type { DeskOfficer, DeskOrder, DeskView, OrderSlip, StageAction, StageInput, WorkflowView } from './orderDeskApi'
