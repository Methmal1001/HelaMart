import type { AuditEntry, Permission, Role, StaffTask, StaffView, TaskStatus } from '~/types/admin'
import { api } from '../http'

/**
 * Team API shared by HelaMart head office and supermarkets (HelaMart backend, /admin/team/*).
 * The server limits every call to the caller's own organisation (platform team vs. one chain)
 * and, for branch heads, to their own branch.
 */

export const nowIso = () => new Date().toISOString()
export const money = (c: number) => `Rs. ${(c / 100).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`

const get = <T>(token: string, path: string, query?: Record<string, string | number | undefined>) => api<T>(path, { token, query })
const send = <T>(token: string, method: 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown) => api<T>(path, { method, token, body })
const id = (v: string) => encodeURIComponent(v)
export { get as apiGet, send as apiSend, id as encodeId }

// ================================================================== staff

export function listTeam(token: string): Promise<StaffView[]> {
  return get(token, '/admin/team/staff')
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

export function createTeamMember(token: string, input: StaffInput): Promise<{ staff: StaffView; tempPassword: string }> {
  return send(token, 'POST', '/admin/team/staff', input)
}

export function updateTeamMember(token: string, staffId: string, input: StaffInput): Promise<StaffView> {
  return send(token, 'PUT', `/admin/team/staff/${id(staffId)}`, input)
}

export function setTeamMemberStatus(token: string, staffId: string, status: StaffView['status'], reason: string): Promise<StaffView> {
  return send(token, 'PUT', `/admin/team/staff/${id(staffId)}/status`, { status, reason })
}

export function resetTeamPassword(token: string, staffId: string): Promise<{ tempPassword: string }> {
  return send(token, 'POST', `/admin/team/staff/${id(staffId)}/reset-password`)
}

export async function revokeTeamSessions(token: string, staffId: string): Promise<void> {
  await send(token, 'POST', `/admin/team/staff/${id(staffId)}/revoke-sessions`)
}

// ================================================================== roles

export function listTeamRoles(token: string): Promise<(Role & { members: number })[]> {
  return get(token, '/admin/team/roles')
}

export interface RoleInput {
  name: string
  description: string
  permissions: Permission[]
  level: number
  branchScoped: boolean
}

export function saveTeamRole(token: string, input: RoleInput, roleId?: string): Promise<Role> {
  return roleId ? send(token, 'PUT', `/admin/team/roles/${id(roleId)}`, input) : send(token, 'POST', '/admin/team/roles', input)
}

export async function deleteTeamRole(token: string, roleId: string): Promise<void> {
  await send(token, 'DELETE', `/admin/team/roles/${id(roleId)}`)
}

// ================================================================== tasks

export function listTasks(token: string): Promise<{ tasks: StaffTask[]; scope: 'all' | 'mine' }> {
  return get(token, '/admin/team/tasks')
}

export interface TaskInput {
  title: string
  description: string
  assigneeId: string
  priority: StaffTask['priority']
  dueDate: string
}

export function saveTask(token: string, input: TaskInput, taskId?: string): Promise<StaffTask> {
  return taskId ? send(token, 'PUT', `/admin/team/tasks/${id(taskId)}`, input) : send(token, 'POST', '/admin/team/tasks', input)
}

export function setTaskStatus(token: string, taskId: string, status: TaskStatus): Promise<StaffTask> {
  return send(token, 'PUT', `/admin/team/tasks/${id(taskId)}/status`, { status })
}

export function commentOnTask(token: string, taskId: string, text: string): Promise<StaffTask> {
  return send(token, 'POST', `/admin/team/tasks/${id(taskId)}/comments`, { text })
}

export async function deleteTask(token: string, taskId: string): Promise<void> {
  await send(token, 'DELETE', `/admin/team/tasks/${id(taskId)}`)
}

/** Names for assignee pickers — only your own team. */
export function teamDirectory(token: string): Promise<{ id: string; name: string; title: string; avatarColor: string; status: string }[]> {
  return get(token, '/admin/team/directory')
}

// ================================================================== audit

export function listAudit(token: string): Promise<(AuditEntry & { tenantName: string | null })[]> {
  return get(token, '/admin/team/audit')
}
