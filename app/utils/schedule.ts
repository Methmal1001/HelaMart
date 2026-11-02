/**
 * Scheduling helpers for offers and banners: `<input type="datetime-local">`
 * values are in the admin's local time (Sri Lanka); the API stores ISO UTC.
 */

/** ISO → "YYYY-MM-DDTHH:mm" in local time, for datetime-local inputs. */
export function toLocalInput(iso: string | number | Date) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local value → ISO (empty → undefined). */
export function fromLocalInput(value: string) {
  if (!value) return undefined
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? undefined : new Date(t).toISOString()
}

/** "Sat 2 Nov, 6:00 pm" */
export function formatWhen(iso: string | number) {
  return new Date(iso).toLocaleString('en-LK', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

export type ScheduleState = 'live' | 'scheduled' | 'paused' | 'ended'

/** Where something is in its publishing life-cycle. */
export function scheduleState(item: { status: 'active' | 'paused'; startsAt?: string; endsAt: string }, now = Date.now()): ScheduleState {
  if (Date.parse(item.endsAt) <= now) return 'ended'
  if (item.status === 'paused') return 'paused'
  if (item.startsAt && Date.parse(item.startsAt) > now) return 'scheduled'
  return 'live'
}

/** "Live · ends Sat 2 Nov, 6:00 pm" / "Starts …" / "Ended …" */
export function scheduleText(item: { status: 'active' | 'paused'; startsAt?: string; endsAt: string }, now = Date.now()) {
  const s = scheduleState(item, now)
  if (s === 'ended') return `Ended ${formatWhen(item.endsAt)}`
  if (s === 'scheduled') return `Starts ${formatWhen(item.startsAt!)} · ends ${formatWhen(item.endsAt)}`
  return `${s === 'paused' ? 'Paused' : 'Live'} · ends ${formatWhen(item.endsAt)}`
}
