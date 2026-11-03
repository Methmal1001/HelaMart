import * as desk from './orderDeskApi'
import * as store from './tenantApi'

/**
 * The supermarket side of ordering, for the orders, order desk and order workflow pages
 * (call these with `useAdminAuth().callApi`). The orders list and status changes are on the
 * HelaMart API; the order desk (sections, stage actions, slips) and the order workflow run on
 * in-browser data until the API serves them (`/admin/store/desk`, `/workflow`…).
 */

// ---- orders (HelaMart API)

export const { listOrders, updateOrderStatus, branchDirectory, allowedTransitions } = store

// ---- order desk and order workflow (in-browser for now)

export const { listDesk, stageAction, orderSlip, getWorkflow, saveWorkflow, resetBranchWorkflow } = desk

export type { DeskOfficer, DeskOrder, DeskView, OrderSlip, StageAction, StageInput, WorkflowView } from './orderDeskApi'
