import type { AdminOrder, OrderStage, OrderWorkflow, StageAppliesTo, WorkflowStage } from '~/types/admin'
import type { IconName } from '~/types'
import { ApiError } from '../apiError'
import { randomId } from '../mock/server'
import { ensureTrackToken, workflowFor } from './db'
import { markReceived } from './handover'
import { audit, allowedBranchIds, assertBranchAccess, isChainLevel, ownedOrNotFound, requireTenant, requireWritable, sanitize, type AdminContext } from './security'
import { nowIso, run } from './common'
import { atHandover, currentStage, deriveStatus, isClosed, isFinished, stageApplies } from '~/lib/workflow'

/**
 * Order desk: online orders move through the supermarket's own sections
 * (Cashier → Packing → Verification → Delivery by default). Officers work only
 * the sections they're assigned to, at their own branches; supervisors
 * ("Supervise orders" permission — branch managers, the chain admin) can act
 * on every section. The chain default workflow is set by chain-level staff with
 * "Customise the order workflow"; a branch can have its own, set by that
 * branch's staff when the admin grants them the same permission.
 */

const SUPERVISE = 'orders.manage'
const isSupervisor = (ctx: AdminContext) => ctx.permissions.has(SUPERVISE)

/** May this person change the chain default (no branch) or a branch's own workflow? */
function canEditWorkflow(ctx: AdminContext, branchId?: string | null) {
  if (!ctx.permissions.has('workflow.manage') || ctx.tenant?.status === 'restricted') return false
  return branchId ? allowedBranchIds(ctx).has(branchId) : isChainLevel(ctx)
}

function liveStage(wf: OrderWorkflow, s: OrderStage | null): WorkflowStage | undefined {
  return s ? wf.stages.find((x) => x.id === s.stageId) : undefined
}

/** Can this person act on the section the order is in now? (Officers come from the order's branch workflow.) */
function canAct(ctx: AdminContext, o: AdminOrder) {
  if (isClosed(o) || !allowedBranchIds(ctx).has(o.branchId)) return false
  if (isSupervisor(ctx)) return true
  return !!liveStage(workflowFor(ctx.db, o.tenantId, o.branchId), currentStage(o))?.officerIds.includes(ctx.staff.id)
}

// ================================================================== workflow (sections)

export interface DeskOfficer {
  id: string
  name: string
  title: string
  roleName: string
  branchNames: string[]
  status: 'active' | 'suspended'
  avatarColor: string
}

/** The supermarket's officers (for a branch: the people who work there). */
function officersOf(ctx: AdminContext, branchId?: string | null): DeskOfficer[] {
  const t = requireTenant(ctx)
  return ctx.db.staff
    .filter((s) => s.tenantId === t.id && (!branchId || !s.branchIds.length || s.branchIds.includes(branchId)))
    .map((s) => ({
      id: s.id, name: s.name, title: s.title, status: s.status, avatarColor: s.avatarColor,
      roleName: ctx.db.roles.find((r) => r.id === s.roleId)?.name ?? '—',
      branchNames: s.branchIds.length ? s.branchIds.map((b) => ctx.db.branches.find((x) => x.id === b)?.name ?? b) : ['All branches'],
    }))
}

export interface WorkflowView {
  /** Which workflow this is: a branch's, or null for the chain default. */
  branchId: string | null
  workflow: OrderWorkflow
  /** The branch follows the chain default (it has no workflow of its own). */
  inherited: boolean
  officers: DeskOfficer[]
  canEdit: boolean
  /** Chain-level: may see and change the chain default. */
  canEditChain: boolean
  branches: { id: string; name: string; custom: boolean; editable: boolean }[]
}

/** The chain default (branchId null) or one branch's workflow. */
export function getWorkflow(token: string, branchId: string | null = null): Promise<WorkflowView> {
  return run(token, (ctx) => {
    const t = requireTenant(ctx)
    if (branchId) assertBranchAccess(ctx, branchId)
    else if (!isChainLevel(ctx)) branchId = [...allowedBranchIds(ctx)][0] ?? null
    const own = branchId ? ctx.db.workflows.find((w) => w.tenantId === t.id && w.branchId === branchId) : undefined
    const allowed = allowedBranchIds(ctx)
    return {
      branchId,
      workflow: own ?? workflowFor(ctx.db, t.id),
      inherited: !!branchId && !own,
      officers: officersOf(ctx, branchId),
      canEdit: canEditWorkflow(ctx, branchId),
      canEditChain: canEditWorkflow(ctx, null),
      branches: ctx.db.branches
        .filter((b) => b.tenantId === t.id && allowed.has(b.id))
        .map((b) => ({ id: b.id, name: b.name, custom: ctx.db.workflows.some((w) => w.tenantId === t.id && w.branchId === b.id), editable: canEditWorkflow(ctx, b.id) })),
    }
  })
}

/** A branch goes back to following the chain default. */
export function resetBranchWorkflow(token: string, branchId: string): Promise<void> {
  return run(token, (ctx) => {
    const t = requireWritable(ctx)
    assertBranchAccess(ctx, branchId)
    if (!canEditWorkflow(ctx, branchId)) throw new ApiError(403, 'You don’t have permission to change this branch’s order workflow.', 'FORBIDDEN')
    const before = ctx.db.workflows.length
    ctx.db.workflows = ctx.db.workflows.filter((w) => !(w.tenantId === t.id && w.branchId === branchId))
    if (ctx.db.workflows.length !== before) audit(ctx.db, ctx, 'workflow.reset', ctx.db.branches.find((b) => b.id === branchId)?.name ?? branchId, 'Back to the chain default', 'warning')
  })
}

export interface StageInput {
  id?: string
  name: string
  description: string
  icon: IconName
  appliesTo: StageAppliesTo
  officerIds: string[]
  completeLabel: string
  customerActiveLabel: string
  customerDoneLabel: string
  customerHint: string
  printSlip?: boolean
}

const ICONS: IconName[] = ['cash', 'package', 'shield', 'truck', 'store', 'check', 'clipboard', 'receipt', 'user', 'tag', 'snowflake', 'card']

export function saveWorkflow(token: string, input: StageInput[], branchId: string | null = null): Promise<OrderWorkflow> {
  return run(token, (ctx) => {
    const t = requireWritable(ctx)
    if (branchId) assertBranchAccess(ctx, branchId)
    if (!canEditWorkflow(ctx, branchId)) {
      throw new ApiError(403, branchId ? 'You don’t have permission to change this branch’s order workflow.' : 'Only chain-level admins with “Customise the order workflow” can change the chain default.', 'FORBIDDEN')
    }
    if (!input.length || input.length > 10) throw new ApiError(422, 'Keep between 1 and 10 sections.')
    // A branch's sections are worked by people at that branch.
    const mine = new Set(officersOf(ctx, branchId).map((s) => s.id))
    const names = new Set<string>()
    const stages: WorkflowStage[] = input.map((s, i) => {
      const name = sanitize(s.name, 40)
      if (name.length < 2) throw new ApiError(422, `Section ${i + 1} needs a name.`)
      if (names.has(name.toLowerCase())) throw new ApiError(422, `Two sections are called “${name}”.`)
      names.add(name.toLowerCase())
      if (!['all', 'delivery', 'pickup'].includes(s.appliesTo)) throw new ApiError(422, `Choose which orders go through ${name}.`)
      if (s.officerIds.some((id) => !mine.has(id))) throw new ApiError(403, branchId ? 'Assign officers who work at this branch.' : 'You can only assign your own officers.')
      const text = (v: string, fallback: string, max = 60) => sanitize(v, max) || fallback
      return {
        id: s.id && /^stg_[a-z0-9_]+$/i.test(s.id) ? s.id : `stg_${randomId(8)}`,
        name,
        description: sanitize(s.description, 200),
        icon: ICONS.includes(s.icon) ? s.icon : 'clipboard',
        appliesTo: s.appliesTo,
        officerIds: [...new Set(s.officerIds)],
        completeLabel: text(s.completeLabel, `${name} done`, 30),
        customerActiveLabel: text(s.customerActiveLabel, name),
        customerDoneLabel: text(s.customerDoneLabel, `${name} done`),
        customerHint: sanitize(s.customerHint, 120),
        printSlip: !!s.printSlip,
      }
    })
    for (const m of ['delivery', 'pickup'] as const) {
      if (!stages.some((s) => stageApplies(s, m))) throw new ApiError(422, `${m === 'delivery' ? 'Home-delivery' : 'Store-pickup'} orders need at least one section.`)
    }
    let wf = branchId ? ctx.db.workflows.find((w) => w.tenantId === t.id && w.branchId === branchId) : workflowFor(ctx.db, t.id)
    const before = (wf ?? workflowFor(ctx.db, t.id)).stages.map((s) => s.name).join(' → ')
    if (!wf) {
      // The branch's first own workflow (until now it followed the chain default).
      wf = { tenantId: t.id, branchId: branchId!, stages: [], updatedAt: '' }
      ctx.db.workflows.push(wf)
    }
    Object.assign(wf, { stages, updatedAt: nowIso(), updatedBy: ctx.staff.name })
    const where = branchId ? `${ctx.db.branches.find((b) => b.id === branchId)?.name} branch workflow` : 'Order workflow (chain default)'
    audit(ctx.db, ctx, 'workflow.update', where, `${before} ⇒ ${stages.map((s) => `${s.name} (${s.officerIds.length})`).join(' → ')}`, 'warning')
    return wf
  })
}

// ================================================================== the desk

export type DeskOrder = AdminOrder & {
  canAct: boolean
  branchName: string
  /** The section just finished prints the order slip. */
  printSlipNow?: boolean
}

export interface DeskView {
  /** Every section used at your branches (officers merged across branch workflows). */
  stages: WorkflowStage[]
  /** The sections each branch uses, in order. */
  branchStages: Record<string, string[]>
  orders: DeskOrder[]
  /** What this person can do: supervise everything, or work their own sections. */
  me: { id: string; supervisor: boolean; stageIds: string[]; canEditWorkflow: boolean }
  branches: { id: string; name: string }[]
}

export function listDesk(token: string): Promise<DeskView> {
  return run(token, (ctx) => {
    const t = requireTenant(ctx)
    const branchIds = allowedBranchIds(ctx)
    const supervisor = isSupervisor(ctx)
    // Branches may run their own workflows: merge their sections for the board.
    const merged = new Map<string, WorkflowStage>()
    const branchStages: Record<string, string[]> = {}
    const myStages = new Set<string>()
    for (const b of branchIds) {
      const wf = workflowFor(ctx.db, t.id, b)
      branchStages[b] = wf.stages.map((s) => s.id)
      for (const s of wf.stages) {
        const seen = merged.get(s.id)
        if (seen) seen.officerIds = [...new Set([...seen.officerIds, ...s.officerIds])]
        else merged.set(s.id, { ...s, officerIds: [...s.officerIds] })
        if (s.officerIds.includes(ctx.staff.id)) myStages.add(s.id)
      }
    }
    const stageIds = [...myStages]
    const seeAll = supervisor || ctx.permissions.has('orders.view')
    const dayAgo = Date.now() - 864e5
    const orders = ctx.db.orders
      .filter((o) => o.tenantId === t.id && branchIds.has(o.branchId) && o.stages)
      .filter((o) => {
        const open = !isClosed(o)
        const recent = Date.parse(o.history.at(-1)?.at ?? o.createdAt) > dayAgo
        if (!open && !recent) return false
        if (seeAll) return true
        // Officers: orders in their sections, plus ones they finished today.
        const cur = currentStage(o)
        return (open && !!cur && stageIds.includes(cur.stageId)) || (!open && o.stages!.some((s) => s.completedBy === ctx.staff.name))
      })
      .map((o) => ({ ...o, canAct: canAct(ctx, o), branchName: ctx.db.branches.find((b) => b.id === o.branchId)?.name ?? '—' }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return {
      stages: [...merged.values()],
      branchStages,
      orders,
      me: { id: ctx.staff.id, supervisor, stageIds, canEditWorkflow: canEditWorkflow(ctx, null) || [...branchIds].some((b) => canEditWorkflow(ctx, b)) },
      branches: ctx.db.branches.filter((b) => b.tenantId === t.id && branchIds.has(b.id)).map((b) => ({ id: b.id, name: b.name })),
    }
  }, [80, 200])
}

export type StageAction = 'start' | 'complete' | 'hold' | 'resume' | 'send_back' | 'note' | 'reject' | 'assign'

export function stageAction(
  token: string,
  orderId: string,
  input: { action: StageAction; note?: string; shared?: boolean; assigneeId?: string; receivedBy?: string },
): Promise<DeskOrder> {
  return run(token, (ctx) => {
    const t = requireWritable(ctx)
    const o = ownedOrNotFound(ctx, ctx.db.orders.find((x) => x.id === orderId), 'Order')
    const wf = workflowFor(ctx.db, t.id, o.branchId)
    if (!allowedBranchIds(ctx).has(o.branchId)) throw new ApiError(403, 'You can only work with your own branch.', 'BRANCH_FORBIDDEN')
    if (o.status === 'cancelled' || o.status === 'refunded') throw new ApiError(409, `This order was ${o.status}.`)
    if (isFinished(o)) throw new ApiError(409, 'This order is already completed.')
    const cur = currentStage(o)!
    if (!canAct(ctx, o)) throw new ApiError(403, `Only officers assigned to ${cur.name} (or a supervisor) can update it.`, 'NOT_YOUR_SECTION')
    const me = ctx.staff.name
    const at = nowIso()
    const note = sanitize(input.note ?? '', 300)
    const needNote = (what: string) => {
      if (!note) throw new ApiError(422, `Please give a reason to ${what}.`)
    }
    let event = ''
    let printSlipNow = false

    switch (input.action) {
      case 'start':
        if (cur.state !== 'waiting') throw new ApiError(409, `${cur.name} has already started.`)
        Object.assign(cur, { state: 'in_progress', startedAt: at, assigneeId: ctx.staff.id, assigneeName: me })
        event = `${cur.name} started`
        break
      case 'complete': {
        if (cur.state === 'on_hold') throw new ApiError(409, 'Resume the order before completing this section.')
        // Last section: the hand-over to the customer (proof of delivery).
        if (atHandover(o)) {
          if (cur.state === 'waiting') Object.assign(cur, { assigneeId: ctx.staff.id, assigneeName: me })
          if (note) cur.notes.push({ at, by: me, text: note, shared: !!input.shared })
          markReceived(ctx.db, o, { via: 'staff', staffName: me, receivedBy: sanitize(input.receivedBy ?? '', 60) || o.customerName })
          audit(ctx.db, ctx, 'order.stage.complete', o.number, `${cur.name}: ${cur.completeLabel}`)
          return { ...o, canAct: false, branchName: ctx.db.branches.find((b) => b.id === o.branchId)?.name ?? '—' }
        }
        if (cur.state === 'waiting') Object.assign(cur, { startedAt: at, assigneeId: ctx.staff.id, assigneeName: me })
        Object.assign(cur, { state: 'done', completedAt: at, completedBy: me, holdReason: undefined })
        if (note) cur.notes.push({ at, by: me, text: note, shared: !!input.shared })
        o.stageIndex = (o.stageIndex ?? 0) + 1
        event = `${cur.name}: ${cur.completeLabel}`
        // The admin's current setting for this section (falls back to the order's copy).
        printSlipNow = !!(liveStage(wf, cur)?.printSlip ?? cur.printSlip)
        // Cash collected at the door / counter.
        if (isFinished(o) && o.payment.method === 'cod') o.payment.status = 'paid'
        break
      }
      case 'hold':
        needNote('put it on hold')
        if (cur.state === 'on_hold') throw new ApiError(409, 'It’s already on hold.')
        Object.assign(cur, { state: 'on_hold', holdReason: note, startedAt: cur.startedAt ?? at })
        cur.notes.push({ at, by: me, text: `On hold: ${note}`, shared: !!input.shared })
        event = `${cur.name} on hold`
        break
      case 'resume':
        if (cur.state !== 'on_hold') throw new ApiError(409, 'It isn’t on hold.')
        Object.assign(cur, { state: 'in_progress', holdReason: undefined, assigneeId: cur.assigneeId ?? ctx.staff.id, assigneeName: cur.assigneeName ?? me })
        event = `${cur.name} resumed`
        break
      case 'send_back': {
        const i = o.stageIndex ?? 0
        if (i === 0) throw new ApiError(409, 'This is the first section — there’s nowhere to send it back to.')
        needNote('send it back')
        const prev = o.stages![i - 1]!
        Object.assign(cur, { state: 'waiting', assigneeId: undefined, assigneeName: undefined, startedAt: undefined, holdReason: undefined })
        Object.assign(prev, { state: 'waiting', completedAt: undefined, completedBy: undefined, startedAt: undefined, assigneeId: undefined, assigneeName: undefined })
        prev.notes.push({ at, by: me, text: `Sent back from ${cur.name}: ${note}`, shared: false })
        o.stageIndex = i - 1
        event = `Sent back from ${cur.name} to ${prev.name}`
        break
      }
      case 'note':
        if (!note) throw new ApiError(422, 'Write the update first.')
        cur.notes.push({ at, by: me, text: note, shared: !!input.shared })
        event = `${cur.name} update`
        break
      case 'reject': {
        if ((o.stageIndex ?? 0) !== 0) throw new ApiError(409, `Only the ${o.stages![0]!.name} section can reject an order. Ask a supervisor to cancel it.`)
        needNote('reject the order')
        for (const l of o.lines) {
          const p = ctx.db.products.find((x) => x.id === l.productId && x.tenantId === o.tenantId)
          if (p) p.stock[o.branchId] = (p.stock[o.branchId] ?? 0) + l.quantity
        }
        if (o.payment.status === 'paid') o.payment.status = 'refunded'
        o.status = 'cancelled'
        cur.notes.push({ at, by: me, text: `Rejected: ${note}`, shared: true })
        o.history.push({ at, status: 'cancelled', by: me, note })
        audit(ctx.db, ctx, 'order.cancelled', o.number, `Rejected at ${cur.name}: ${note}`, 'warning')
        return { ...o, canAct: false, branchName: '' }
      }
      case 'assign': {
        if (!isSupervisor(ctx)) throw new ApiError(403, 'Only a supervisor can reassign work.')
        const officer = ctx.db.staff.find((s) => s.id === input.assigneeId && s.tenantId === t.id && s.status === 'active')
        if (!officer) throw new ApiError(422, 'Choose an active officer.')
        if (officer.branchIds.length && !officer.branchIds.includes(o.branchId)) throw new ApiError(422, `${officer.name} doesn’t work at this branch.`)
        Object.assign(cur, { assigneeId: officer.id, assigneeName: officer.name })
        event = `${cur.name} assigned to ${officer.name}`
        break
      }
      default:
        throw new ApiError(400, 'Unknown action.')
    }

    o.status = deriveStatus(o)
    o.history.push({ at, status: o.status, by: me, note: note && input.action !== 'complete' ? `${event} · ${note}` : event })
    audit(ctx.db, ctx, `order.stage.${input.action}`, o.number, event + (note ? ` · ${note}` : ''))
    return { ...o, canAct: canAct(ctx, o), branchName: ctx.db.branches.find((b) => b.id === o.branchId)?.name ?? '—', printSlipNow }
  })
}

// ================================================================== order slip

export interface OrderSlip {
  order: AdminOrder
  storeName: string
  branchName: string
  branchPhone: string
  /** Path of the tracking page in the QR code (the slip adds the site address). */
  trackPath: string
  printedBy: string
  printedAt: string
  /** Section the order goes to next (shown on the slip for the floor team). */
  nextSection?: string
}

/**
 * The order slip: printed when the cashier approves an order (or reprinted any
 * time). Carries the customer and delivery details, the tracking number and a
 * QR code the customer scans on arrival to confirm they received it.
 */
export function orderSlip(token: string, orderId: string): Promise<OrderSlip> {
  return run(token, (ctx) => {
    const t = requireTenant(ctx)
    const o = ownedOrNotFound(ctx, ctx.db.orders.find((x) => x.id === orderId), 'Order')
    if (!allowedBranchIds(ctx).has(o.branchId)) throw new ApiError(403, 'You can only work with your own branch.', 'BRANCH_FORBIDDEN')
    const wf = workflowFor(ctx.db, t.id, o.branchId)
    const mine = wf.stages.some((s) => s.officerIds.includes(ctx.staff.id))
    if (!isSupervisor(ctx) && !ctx.permissions.has('orders.view') && !mine) throw new ApiError(403, 'You can’t print order slips.', 'FORBIDDEN')
    const token_ = ensureTrackToken(o)
    const at = nowIso()
    o.slipPrintedAt = at
    audit(ctx.db, ctx, 'order.slip.print', o.number, 'Order slip printed')
    const branch = ctx.db.branches.find((b) => b.id === o.branchId)
    return {
      order: o,
      storeName: t.name,
      branchName: branch?.name ?? '',
      branchPhone: branch?.phone ?? t.hotline,
      trackPath: `/track/${encodeURIComponent(o.number)}?t=${token_}`,
      printedBy: ctx.staff.name,
      printedAt: at,
      nextSection: currentStage(o)?.name,
    }
  })
}
