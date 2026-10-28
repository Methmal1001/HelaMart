import type { AuditEntry, Permission, Role, StaffTask, StaffUser, StaffView, TaskStatus } from '~/types/admin'
import { ROLE_IDS, permissionsFor } from '~/data/admin/permissions'
import { EMAIL_RE, isSriLankanMobile } from '~/utils/validation'
import { ApiError } from '../apiError'
import { hashPassword, latency, randomId } from '../mock/server'
import { writeAdminDb } from './db'
import {
  allowedBranchIds,
  assertCanManageLevel,
  assertGrantable,
  audit,
  authenticate,
  isChainLevel,
  requirePermission,
  requireStepUp,
  requireWritable,
  roleOf,
  sanitize,
  toStaffView,
  type AdminContext,
} from './security'

/**
 * Team functions shared by HelaMart head office and supermarkets. Every call
 * is limited to the caller's own organisation (platform team vs. one chain)
 * and, for branch heads, to their own branch.
 */

export const nowIso = () => new Date().toISOString()
export const money = (c: number) => `Rs. ${(c / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`

export async function run<T>(token: string, fn: (ctx: AdminContext) => T, ms: [number, number] = [120, 320]): Promise<T> {
  await latency(...ms)
  const ctx = authenticate(token)
  const result = fn(ctx)
  writeAdminDb(ctx.db)
  // Serialise like a real HTTP response (also strips any Vue proxies passed in).
  return result === undefined ? result : (JSON.parse(JSON.stringify(result)) as T)
}

export function generateTempPassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '@#$%&!?']
  const rand = (n: number) => {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0]! % n
  }
  const chars: string[] = []
  for (let i = 0; i < 14; i++) {
    const set = sets[i % sets.length]!
    chars.push(set[rand(set.length)]!)
  }
  return chars.sort(() => rand(3) - 1).join('')
}

const PERM = {
  platform: { viewStaff: 'platform.staff.manage', manageStaff: 'platform.staff.manage', roles: 'platform.roles.manage', audit: 'platform.audit.view' },
  tenant: { viewStaff: 'staff.view', manageStaff: 'staff.manage', roles: 'roles.manage', audit: 'audit.view' },
} as const

/** People in the caller's organisation (and, for branch heads, their branch). */
function teamOf(ctx: AdminContext): StaffUser[] {
  const team = ctx.db.staff.filter((s) => s.tenantId === (ctx.tenant?.id ?? null))
  if (ctx.scope === 'platform' || isChainLevel(ctx)) return team
  const mine = allowedBranchIds(ctx)
  return team.filter((s) => s.id === ctx.staff.id || (s.branchIds.length && s.branchIds.every((b) => mine.has(b))))
}

/** Roles usable inside the caller's organisation. */
function rolesOf(ctx: AdminContext): Role[] {
  return ctx.db.roles.filter((r) => r.scope === ctx.scope && (r.tenantId === null || r.tenantId === (ctx.tenant?.id ?? null)))
}

function guardWrite(ctx: AdminContext) {
  if (ctx.scope === 'tenant') requireWritable(ctx)
}

// ================================================================== staff

export function listTeam(token: string): Promise<StaffView[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, PERM[ctx.scope].viewStaff)
    return teamOf(ctx).map((s) => toStaffView(ctx.db, s))
  })
}

export interface StaffInput {
  name: string
  email: string
  phone: string
  title: string
  roleId: string
  branchIds: string[]
  extraPermissions: Permission[]
}

function validateStaff(ctx: AdminContext, input: StaffInput, targetId?: string) {
  requirePermission(ctx, PERM[ctx.scope].manageStaff)
  requireStepUp(ctx)
  guardWrite(ctx)
  const role = rolesOf(ctx).find((r) => r.id === input.roleId)
  if (!role) throw new ApiError(422, 'Choose a role.')
  if (role.id === ROLE_IDS.superAdmin) throw new ApiError(403, 'Super Admin accounts can only be created by HelaMart directly.', 'HIERARCHY')
  assertCanManageLevel(ctx, role.level, `the “${role.name}” role`)
  const extras = input.extraPermissions.filter((p) => permissionsFor(ctx.scope).includes(p))
  assertGrantable(ctx, [...role.permissions, ...extras])
  // Branch rules.
  let branchIds: string[] = []
  if (ctx.scope === 'tenant') {
    const allowed = allowedBranchIds(ctx)
    branchIds = [...new Set(input.branchIds)]
    if (branchIds.some((b) => !allowed.has(b))) throw new ApiError(403, 'You can only assign people to your own branches.', 'BRANCH_FORBIDDEN')
    if (!isChainLevel(ctx) && !branchIds.length) throw new ApiError(422, 'Choose the branch this person works at.')
    if (role.branchScoped && !branchIds.length) throw new ApiError(422, `The “${role.name}” role must be linked to at least one branch.`)
  }
  if (sanitize(input.name, 80).length < 3) throw new ApiError(422, 'Enter the full name.')
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new ApiError(422, 'Enter a valid email address.')
  if (input.phone && !isSriLankanMobile(input.phone)) throw new ApiError(422, 'Enter a Sri Lankan mobile number.')
  if (ctx.db.staff.some((s) => s.email === email && s.id !== targetId)) throw new ApiError(409, 'A staff account with this email already exists.')
  return { role, email, branchIds, extras }
}

export function createTeamMember(token: string, input: StaffInput): Promise<{ staff: StaffView; tempPassword: string }> {
  return run(token, (ctx) => {
    const { role, email, branchIds, extras } = validateStaff(ctx, input)
    const tempPassword = generateTempPassword()
    const s: StaffUser = {
      id: `stf_${randomId(5)}`,
      name: sanitize(input.name, 80),
      email,
      phone: input.phone.trim() || undefined,
      title: sanitize(input.title, 80) || role.name,
      tenantId: ctx.tenant?.id ?? null,
      branchIds,
      roleId: role.id,
      extraPermissions: extras,
      status: 'active',
      mfaSecret: `${randomId(10)}-totp`,
      passwordHash: hashPassword(email, tempPassword),
      passwordChangedAt: nowIso(),
      mustChangePassword: true,
      createdAt: nowIso(),
      createdBy: ctx.staff.id,
      avatarColor: ['#174D38', '#2F6E8F', '#9E3A5A', '#B9803F', '#5E9E4A', '#5F7484'][Math.floor(Math.random() * 6)]!,
    }
    ctx.db.staff.push(s)
    if (role.id === ROLE_IDS.branchManager) for (const b of ctx.db.branches) if (branchIds.includes(b.id)) b.managerId = s.id
    audit(ctx.db, ctx, 'staff.create', s.name, `Role: ${role.name}${branchIds.length ? ` · ${branchIds.length} branch(es)` : ''}`, 'warning')
    return { staff: toStaffView(ctx.db, s), tempPassword }
  }, [400, 800])
}

function findManageable(ctx: AdminContext, id: string) {
  const target = teamOf(ctx).find((s) => s.id === id)
  if (!target) throw new ApiError(404, 'Staff member not found.')
  if (target.id === ctx.staff.id) throw new ApiError(403, 'You can’t change your own role, access or status. Ask someone more senior.', 'SELF')
  assertCanManageLevel(ctx, roleOf(ctx.db, target).level, target.name)
  return target
}

export function updateTeamMember(token: string, id: string, input: StaffInput): Promise<StaffView> {
  return run(token, (ctx) => {
    const target = findManageable(ctx, id)
    const { role, email, branchIds, extras } = validateStaff(ctx, input, id)
    const before = roleOf(ctx.db, target).name
    Object.assign(target, { name: sanitize(input.name, 80), email, phone: input.phone.trim() || undefined, title: sanitize(input.title, 80), roleId: role.id, branchIds, extraPermissions: extras })
    ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, 'staff.update', target.name, `Role ${before} → ${role.name}; extra: ${extras.join(', ') || 'none'}`, 'warning')
    return toStaffView(ctx.db, target)
  })
}

export function setTeamMemberStatus(token: string, id: string, status: StaffUser['status'], reason: string): Promise<StaffView> {
  return run(token, (ctx) => {
    requirePermission(ctx, PERM[ctx.scope].manageStaff)
    requireStepUp(ctx)
    guardWrite(ctx)
    const target = findManageable(ctx, id)
    if (status === 'suspended' && !sanitize(reason)) throw new ApiError(422, 'Give a reason.')
    target.status = status
    if (status === 'suspended') ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, status === 'suspended' ? 'staff.suspend' : 'staff.reactivate', target.name, sanitize(reason, 160), 'warning')
    return toStaffView(ctx.db, target)
  })
}

export function resetTeamPassword(token: string, id: string): Promise<{ tempPassword: string }> {
  return run(token, (ctx) => {
    requirePermission(ctx, PERM[ctx.scope].manageStaff)
    requireStepUp(ctx)
    guardWrite(ctx)
    const target = findManageable(ctx, id)
    const tempPassword = generateTempPassword()
    Object.assign(target, { passwordHash: hashPassword(target.email, tempPassword), mustChangePassword: true, passwordChangedAt: nowIso() })
    ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, 'staff.password_reset', target.name, 'Temporary password issued; sessions ended', 'warning')
    return { tempPassword }
  })
}

export function revokeTeamSessions(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, PERM[ctx.scope].manageStaff)
    const target = findManageable(ctx, id)
    ctx.db.sessions.forEach((s) => s.staffId === target.id && (s.revoked = true))
    audit(ctx.db, ctx, 'staff.sessions_revoked', target.name, 'Signed out of all devices', 'warning')
  })
}

// ================================================================== roles

export function listTeamRoles(token: string): Promise<(Role & { members: number })[]> {
  return run(token, (ctx) => {
    if (!ctx.permissions.has(PERM[ctx.scope].roles)) requirePermission(ctx, PERM[ctx.scope].viewStaff)
    const people = ctx.db.staff.filter((s) => s.tenantId === (ctx.tenant?.id ?? null))
    return rolesOf(ctx)
      .map((r) => ({ ...r, members: people.filter((s) => s.roleId === r.id).length }))
      .sort((a, b) => b.level - a.level)
  })
}

export interface RoleInput {
  name: string
  description: string
  permissions: Permission[]
  level: number
  branchScoped: boolean
}

export function saveTeamRole(token: string, input: RoleInput, id?: string): Promise<Role> {
  return run(token, (ctx) => {
    requirePermission(ctx, PERM[ctx.scope].roles)
    requireStepUp(ctx)
    guardWrite(ctx)
    const name = sanitize(input.name, 40)
    if (name.length < 3) throw new ApiError(422, 'Enter a role name.')
    const maxLevel = ctx.scope === 'platform' ? 99 : 79
    if (!Number.isInteger(input.level) || input.level < 1 || input.level > maxLevel) throw new ApiError(422, `Seniority level must be between 1 and ${maxLevel}.`)
    assertCanManageLevel(ctx, input.level, 'a role at that seniority')
    const perms = input.permissions.filter((p) => permissionsFor(ctx.scope).includes(p))
    if (!perms.length) throw new ApiError(422, 'Give the role at least one permission.')
    assertGrantable(ctx, perms)
    if (rolesOf(ctx).some((r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== id)) throw new ApiError(409, 'A role with this name already exists.')
    if (id) {
      const role = rolesOf(ctx).find((r) => r.id === id)
      if (!role) throw new ApiError(404, 'Role not found.')
      if (role.system || role.tenantId !== (ctx.tenant?.id ?? null)) throw new ApiError(403, 'Built-in roles can’t be changed.', 'SYSTEM_ROLE')
      assertCanManageLevel(ctx, role.level, `the “${role.name}” role`)
      Object.assign(role, { name, description: sanitize(input.description, 200), permissions: perms, level: input.level, branchScoped: ctx.scope === 'tenant' && input.branchScoped })
      ctx.db.sessions.forEach((s) => ctx.db.staff.find((x) => x.id === s.staffId)?.roleId === role.id && (s.revoked = true))
      audit(ctx.db, ctx, 'role.update', role.name, `${perms.length} permissions · level ${role.level}`, 'warning')
      return role
    }
    const role: Role = {
      id: `role_${randomId(5)}`, name, description: sanitize(input.description, 200), permissions: perms, scope: ctx.scope,
      tenantId: ctx.tenant?.id ?? null, system: false, level: input.level, branchScoped: ctx.scope === 'tenant' && input.branchScoped, createdAt: nowIso(), createdBy: ctx.staff.id,
    }
    ctx.db.roles.push(role)
    audit(ctx.db, ctx, 'role.create', role.name, `${perms.length} permissions · level ${role.level}`, 'warning')
    return role
  })
}

export function deleteTeamRole(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    requirePermission(ctx, PERM[ctx.scope].roles)
    requireStepUp(ctx)
    guardWrite(ctx)
    const role = rolesOf(ctx).find((r) => r.id === id)
    if (!role) throw new ApiError(404, 'Role not found.')
    if (role.system || role.tenantId !== (ctx.tenant?.id ?? null)) throw new ApiError(403, 'Built-in roles can’t be deleted.', 'SYSTEM_ROLE')
    assertCanManageLevel(ctx, role.level, `the “${role.name}” role`)
    const members = ctx.db.staff.filter((s) => s.roleId === id).length
    if (members) throw new ApiError(409, `${members} staff member${members === 1 ? ' still has' : 's still have'} this role. Move them to another role first.`)
    ctx.db.roles = ctx.db.roles.filter((r) => r.id !== id)
    audit(ctx.db, ctx, 'role.delete', role.name, undefined, 'warning')
  })
}

// ================================================================== tasks

function visibleTasks(ctx: AdminContext): StaffTask[] {
  const org = ctx.db.tasks.filter((t) => t.tenantId === (ctx.tenant?.id ?? null))
  const manage = ctx.scope === 'platform' ? ctx.permissions.has('platform.staff.manage') : ctx.permissions.has('tasks.manage')
  if (!manage) return org.filter((t) => t.assigneeId === ctx.staff.id)
  if (ctx.scope === 'platform' || isChainLevel(ctx)) return org
  const team = new Set(teamOf(ctx).map((s) => s.id))
  return org.filter((t) => team.has(t.assigneeId) || t.createdById === ctx.staff.id)
}

const canManageTasks = (ctx: AdminContext) => (ctx.scope === 'platform' ? ctx.permissions.has('platform.staff.manage') : ctx.permissions.has('tasks.manage'))

export function listTasks(token: string): Promise<{ tasks: StaffTask[]; scope: 'all' | 'mine' }> {
  return run(token, (ctx) => {
    if (ctx.scope === 'tenant') requirePermission(ctx, 'tasks.view')
    return { tasks: visibleTasks(ctx), scope: canManageTasks(ctx) ? 'all' : 'mine' }
  })
}

export interface TaskInput {
  title: string
  description: string
  assigneeId: string
  priority: StaffTask['priority']
  dueDate: string
}

export function saveTask(token: string, input: TaskInput, id?: string): Promise<StaffTask> {
  return run(token, (ctx) => {
    if (!canManageTasks(ctx)) throw new ApiError(403, 'You can’t assign tasks.', 'FORBIDDEN')
    guardWrite(ctx)
    if (sanitize(input.title, 100).length < 3) throw new ApiError(422, 'Enter a task title.')
    const assignee = teamOf(ctx).find((s) => s.id === input.assigneeId && s.status === 'active')
    if (!assignee) throw new ApiError(422, 'Choose an active member of your team.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new ApiError(422, 'Choose a due date.')
    const fields = { title: sanitize(input.title, 100), description: sanitize(input.description, 1000), assigneeId: assignee.id, priority: input.priority, dueDate: input.dueDate, branchId: assignee.branchIds[0] }
    if (id) {
      const t = visibleTasks(ctx).find((x) => x.id === id)
      if (!t) throw new ApiError(404, 'Task not found.')
      Object.assign(t, fields, { updatedAt: nowIso() })
      audit(ctx.db, ctx, 'task.update', t.title, `Assigned to ${assignee.name}`)
      return t
    }
    const task: StaffTask = { ...fields, id: `tsk_${randomId(5)}`, tenantId: ctx.tenant?.id ?? null, createdById: ctx.staff.id, status: 'todo', createdAt: nowIso(), updatedAt: nowIso(), comments: [] }
    ctx.db.tasks.unshift(task)
    audit(ctx.db, ctx, 'task.create', task.title, `Assigned to ${assignee.name} · due ${task.dueDate}`)
    return task
  })
}

function ownTask(ctx: AdminContext, id: string) {
  const t = visibleTasks(ctx).find((x) => x.id === id)
  if (!t) throw new ApiError(404, 'Task not found.')
  return t
}

export function setTaskStatus(token: string, id: string, status: TaskStatus): Promise<StaffTask> {
  return run(token, (ctx) => {
    guardWrite(ctx)
    const t = ownTask(ctx, id)
    t.status = status
    t.updatedAt = nowIso()
    audit(ctx.db, ctx, 'task.status', t.title, status.replace('_', ' '))
    return t
  })
}

export function commentOnTask(token: string, id: string, text: string): Promise<StaffTask> {
  return run(token, (ctx) => {
    guardWrite(ctx)
    const t = ownTask(ctx, id)
    const clean = sanitize(text, 500)
    if (!clean) throw new ApiError(422, 'Write a comment first.')
    t.comments.push({ at: nowIso(), byId: ctx.staff.id, text: clean })
    t.updatedAt = nowIso()
    return t
  })
}

export function deleteTask(token: string, id: string): Promise<void> {
  return run(token, (ctx) => {
    if (!canManageTasks(ctx)) throw new ApiError(403, 'You can’t delete tasks.', 'FORBIDDEN')
    guardWrite(ctx)
    const t = ownTask(ctx, id)
    ctx.db.tasks = ctx.db.tasks.filter((x) => x.id !== id)
    audit(ctx.db, ctx, 'task.delete', t.title)
  })
}

/** Names for assignee pickers — only your own team. */
export function teamDirectory(token: string): Promise<{ id: string; name: string; title: string; avatarColor: string; status: string }[]> {
  return run(token, (ctx) => teamOf(ctx).map((s) => ({ id: s.id, name: s.name, title: s.title, avatarColor: s.avatarColor, status: s.status })))
}

// ================================================================== audit

export function listAudit(token: string): Promise<(AuditEntry & { tenantName: string | null })[]> {
  return run(token, (ctx) => {
    requirePermission(ctx, PERM[ctx.scope].audit)
    const entries = ctx.scope === 'platform' ? ctx.db.audit : ctx.db.audit.filter((e) => e.tenantId === ctx.tenant!.id)
    return [...entries].reverse().map((e) => ({ ...e, tenantName: e.tenantId ? (ctx.db.tenants.find((t) => t.id === e.tenantId)?.name ?? null) : null }))
  })
}
