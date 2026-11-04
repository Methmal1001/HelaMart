import { ApiError } from '../apiError'
import { api } from '../http'

/**
 * Admin reports (HelaMart backend, /admin/reports/*): fixed order reports, a reports assistant that picks
 * them (Google Gemini on the server; the AI never touches the database) and CSV downloads.
 * Every report is limited on the server to what the signed-in staff member may see.
 */

export type ReportName = 'order_summary' | 'top_products' | 'order_list' | 'order_tasks' | 'offer_performance' | 'supermarket_comparison'
export type ReportArgs = Record<string, unknown>

export interface ReportCatalog {
  /** The assistant is set up on the server (Gemini key present). */
  assistant: boolean
  /** Money columns are included for this user (reports.view or head office). */
  showMoney: boolean
  reports: { name: ReportName; title: string; description: string }[]
}

export interface ReportResult {
  name: ReportName
  args: ReportArgs
  title: string
  description: string
  columns: string[]
  /** Preview rows (the CSV has all of them). */
  rows: (string | number | null)[][]
  totalRows: number
  truncated: boolean
  filters: Record<string, unknown>
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface ChatAnswer {
  reply: string
  reports: ReportResult[]
  model: string
}

export function reportCatalog(token: string): Promise<ReportCatalog> {
  return api('/admin/reports/catalog', { token })
}

/** Run one report directly (no AI). */
export function runReport(token: string, name: ReportName, args: ReportArgs = {}): Promise<ReportResult> {
  return api('/admin/reports/run', { method: 'POST', token, body: { name, args } })
}

/**
 * Ask the assistant. Send the conversation so far (text only); the last turn is the new question.
 * Aborting `signal` stops it: the request is cancelled and the server stops its remaining report lookups.
 */
export function askReports(token: string, messages: ChatTurn[], signal?: AbortSignal): Promise<ChatAnswer> {
  return api('/admin/reports/chat', { method: 'POST', token, body: { messages }, timeoutMs: 120000, signal })
}

/** Download the full report as CSV (built by the server from the database). */
export async function downloadReportCsv(token: string, name: ReportName, args: ReportArgs = {}): Promise<void> {
  const base = useRuntimeConfig().public.apiBase.replace(/\/+$/, '')
  let res: Response
  try {
    res = await fetch(`${base}/admin/reports/csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, args }),
    })
  } catch {
    throw new ApiError(0, 'Can’t reach HelaMart right now. Check your connection and try again.', 'NETWORK')
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; code?: string }
    throw new ApiError(res.status, err.message || `Download failed (${res.status}).`, err.code)
  }
  const file = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `helamart-${name}.csv`
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: file })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
