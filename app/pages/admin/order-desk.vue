<script setup lang="ts">
import type { OrderStage, WorkflowStage } from '~/types/admin'
import { getWorkflow, listDesk, orderSlip, stageAction, type DeskOfficer, type DeskOrder, type DeskView, type OrderSlip, type StageAction } from '~/services/admin/orderDeskApi'
import { atHandover, currentStage, isClosed } from '~/lib/workflow'

/**
 * Order desk: every online order moves section by section (Cashier → Packing →
 * Verification → Delivery, as the supermarket admin set it up). Officers see
 * and update only their own sections; supervisors see the whole floor.
 * The customer's tracking follows each update.
 */
definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant' })
useHead({ title: 'Order desk' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()

const view = ref<DeskView | null>(null)
const officers = ref<DeskOfficer[]>([])
const loading = ref(true)
const busy = ref(false)
const branch = ref('all')
const scope = ref<'mine' | 'all'>('mine')

async function load(quiet = false) {
  if (!quiet) loading.value = true
  try {
    const [v, w] = await Promise.all([auth.call(listDesk), officers.value.length ? null : auth.call(getWorkflow)])
    view.value = v
    if (w) officers.value = w.officers
    if (!v.me.stageIds.length) scope.value = 'all'
    if (selectedId.value && !v.orders.some((o) => o.id === selectedId.value)) selectedId.value = null
  } catch (e) {
    if (!quiet) notify.error(e)
  } finally {
    loading.value = false
  }
}

// Live: other officers' updates (another tab or device sync) and a gentle poll.
let timer: ReturnType<typeof setInterval> | null = null
function onStorage(e: StorageEvent) {
  if (e.key === 'helamart:platform-db:v2' && !busy.value) void load(true)
}
onMounted(() => {
  void load()
  timer = setInterval(() => document.visibilityState === 'visible' && !busy.value && load(true), 15000)
  window.addEventListener('storage', onStorage)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('storage', onStorage)
})

const me = computed(() => view.value?.me)
const canSeeAll = computed(() => !!me.value && (me.value.supervisor || auth.can('orders.view')))
const officerName = (id: string) => officers.value.find((o) => o.id === id)?.name ?? 'Unknown'
const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()
const officerOf = (id: string) => officers.value.find((o) => o.id === id)

const inBranch = (o: DeskOrder) => branch.value === 'all' || o.branchId === branch.value
/** Sections shown as columns. */
const columns = computed<WorkflowStage[]>(() => {
  const ids = branch.value !== 'all' ? view.value?.branchStages[branch.value] : undefined
  // One branch: its own sections, in its order. All branches: every section in use.
  const all = ids ? ids.map((id) => view.value!.stages.find((s) => s.id === id)!).filter(Boolean) : (view.value?.stages ?? [])
  return scope.value === 'mine' && me.value?.stageIds.length ? all.filter((s) => me.value!.stageIds.includes(s.id)) : all
})
const openOrders = computed(() => (view.value?.orders ?? []).filter((o) => !isClosed(o) && inBranch(o)))
const doneToday = computed(() => (view.value?.orders ?? []).filter((o) => isClosed(o) && inBranch(o)).reverse())
function ordersIn(stageId: string) {
  const order = { on_hold: 0, in_progress: 1, waiting: 2, done: 3 }
  return openOrders.value
    .filter((o) => currentStage(o)?.stageId === stageId)
    .sort((a, b) => order[currentStage(a)!.state] - order[currentStage(b)!.state] || a.createdAt.localeCompare(b.createdAt))
}
/** Orders in sections that were removed from the workflow (finish them as a supervisor). */
const orphans = computed(() => openOrders.value.filter((o) => !view.value?.stages.some((s) => s.id === currentStage(o)?.stageId)))

// ---- time in section
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | null = null
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 30000)))
onBeforeUnmount(() => clock && clearInterval(clock))
function sinceOf(o: DeskOrder) {
  const i = o.stageIndex ?? 0
  const cur = currentStage(o)
  return cur?.startedAt ?? o.stages?.[i - 1]?.completedAt ?? o.createdAt
}
function age(iso: string) {
  const m = Math.max(0, Math.round((now.value - Date.parse(iso)) / 60000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`
}
const late = (o: DeskOrder) => now.value - Date.parse(sinceOf(o)) > 45 * 60000

const STATE: Record<OrderStage['state'], { label: string; tone: string }> = {
  waiting: { label: 'Waiting', tone: 'bg-[#FFF4D6] text-[#7A5600]' },
  in_progress: { label: 'In progress', tone: 'bg-[#E3EEF9] text-[#1F4E7A]' },
  on_hold: { label: 'On hold', tone: 'bg-[#FDE7D3] text-[#8a3d00]' },
  done: { label: 'Done', tone: 'bg-hela-green-50 text-hela-green' },
}

// ---- actions
async function act(o: DeskOrder, action: StageAction, extra: { note?: string; shared?: boolean; assigneeId?: string; receivedBy?: string } = {}) {
  busy.value = true
  try {
    const u = await auth.call((t) => stageAction(t, o.id, { action, ...extra }))
    if (view.value) view.value.orders = view.value.orders.map((x) => (x.id === u.id ? { ...u, branchName: x.branchName } : x))
    const cur = currentStage(u)
    // The section just finished prints the order slip (the cashier's approval, by default).
    if (u.printSlipNow) void printSlip(u.id, true)
    notify.ok(
      action === 'complete' && u.received ? `${u.number}: ${u.delivery.method === 'pickup' ? 'collected' : 'received'} by ${u.received.receivedBy}`
      : action === 'complete' ? (cur ? `${u.number} → ${cur.name}` : `${u.number} completed`)
      : action === 'reject' ? `${u.number} rejected — the customer has been told`
      : action === 'note' ? 'Update posted'
      : `${u.number}: ${action.replace('_', ' ')}`,
    )
    note.value = ''
    shared.value = false
    handedTo.value = ''
    await load(true)
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = false
  }
}
async function askReason(o: DeskOrder, action: 'hold' | 'send_back' | 'reject') {
  const cur = currentStage(o)!
  const prev = o.stages?.[(o.stageIndex ?? 0) - 1]
  const r = await confirm({
    title: action === 'hold' ? `Put ${o.number} on hold?` : action === 'send_back' ? `Send ${o.number} back to ${prev?.name}?` : `Reject ${o.number}?`,
    message:
      action === 'hold' ? 'Use this when something stops the work (item out of stock, waiting for the customer…). The customer sees a short delay.'
      : action === 'send_back' ? `Something needs fixing in ${prev?.name}. It goes back to that section’s queue with your reason.`
      : 'The order is cancelled, items go back into stock and any card payment is refunded. The customer sees your reason.',
    confirmLabel: action === 'hold' ? 'Put on hold' : action === 'send_back' ? 'Send back' : 'Reject order',
    tone: action === 'reject' ? 'danger' : undefined,
    reasonLabel: 'Reason',
  })
  if (r.ok) await act(o, action, { note: r.reason, shared: action === 'reject' })
  return cur
}
function primary(o: DeskOrder): { label: string; action: StageAction } | null {
  const cur = currentStage(o)
  if (!o.canAct || !cur) return null
  if (cur.state === 'waiting') return { label: 'Start', action: 'start' }
  if (cur.state === 'on_hold') return { label: 'Resume', action: 'resume' }
  return { label: cur.completeLabel, action: 'complete' }
}

// ---- detail
const selectedId = ref<string | null>(null)
const selected = computed(() => view.value?.orders.find((o) => o.id === selectedId.value) ?? null)
const note = ref('')
const shared = ref(false)
/** Pick / check list — ticks are just a working aid for packers and verifiers (kept per order on this device). */
const ticks = ref<Record<string, string[]>>({})
const ticked = (o: DeskOrder, id: string) => ticks.value[o.id]?.includes(id) ?? false
function tick(o: DeskOrder, id: string) {
  const list = (ticks.value[o.id] ??= [])
  const i = list.indexOf(id)
  if (i >= 0) list.splice(i, 1)
  else list.push(id)
}
const assignable = computed(() => {
  const o = selected.value
  const cur = o && currentStage(o)
  if (!o || !cur) return []
  const stage = view.value?.stages.find((s) => s.id === cur.stageId)
  return officers.value.filter((x) => x.status === 'active' && (stage?.officerIds.includes(x.id) ?? false))
})
async function complete(o: DeskOrder) {
  const cur = currentStage(o)!
  const list = ticks.value[o.id] ?? []
  const checking = /pack|verif|check/i.test(cur.name)
  if (checking && list.length < o.lines.length) {
    const r = await confirm({ title: `Only ${list.length} of ${o.lines.length} items ticked`, message: `Finish ${cur.name} for ${o.number} anyway?`, confirmLabel: cur.completeLabel })
    if (!r.ok) return
  }
  await act(o, 'complete', { note: note.value, shared: shared.value, receivedBy: atHandover(o) ? handedTo.value || o.customerName : undefined })
}

// ---- order slip (printed on approval; reprint any time)
const slip = ref<OrderSlip | null>(null)
const origin = ref('')
onMounted(() => (origin.value = window.location.origin))
async function printSlip(orderId: string, auto = false) {
  try {
    slip.value = await auth.call((t) => orderSlip(t, orderId))
    await nextTick()
    // Let the QR code paint before the print dialog takes its snapshot.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    window.print()
    notify.ok(auto ? `Order slip for ${slip.value.order.number} sent to the printer` : `Reprinted slip for ${slip.value.order.number}`)
    await load(true)
  } catch (e) {
    notify.error(e)
  }
}

// ---- find an order: scan the slip QR (handheld scanner or camera) or type the number
const find = ref('')
function openFound(raw: string) {
  const m = raw.toUpperCase().match(/HM-\d{4}-\d+/)
  if (!m) return notify.error(new Error('That isn’t an order number or HelaMart slip QR.'))
  const o = view.value?.orders.find((x) => x.number === m[0])
  if (!o) return notify.error(new Error(`${m[0]} isn’t in your sections right now.`))
  if (!isClosed(o) && currentStage(o) && !columns.value.some((c) => c.id === currentStage(o)!.stageId)) scope.value = 'all'
  selectedId.value = o.id
  find.value = ''
}
const canScan = ref(false)
const scanning = ref(false)
const video = ref<HTMLVideoElement | null>(null)
let stream: MediaStream | null = null
type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
onMounted(() => (canScan.value = 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia))
async function startScan() {
  scanning.value = true
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    await nextTick()
    if (!video.value) return
    video.value.srcObject = stream
    await video.value.play()
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector
    const detector = new Ctor({ formats: ['qr_code'] })
    const tickScan = async () => {
      if (!scanning.value || !video.value) return
      const found = await detector.detect(video.value).catch(() => [])
      if (found[0]) {
        stopScan()
        openFound(found[0].rawValue)
        return
      }
      requestAnimationFrame(() => void tickScan())
    }
    void tickScan()
  } catch {
    stopScan()
    notify.error(new Error('Camera unavailable — type the order number instead.'))
  }
}
function stopScan() {
  scanning.value = false
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}
onBeforeUnmount(stopScan)
const handedTo = ref('')
const VIA = { customer_qr: 'Customer scanned the slip QR', customer_app: 'Customer confirmed in the HelaMart app', staff: 'Confirmed by staff' } as const
const fmt = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const allNotes = (o: DeskOrder) => (o.stages ?? []).flatMap((s) => s.notes.map((n) => ({ ...n, stage: s.name }))).sort((a, b) => b.at.localeCompare(a.at))
</script>

<template>
  <div>
    <AdminPageHeader title="Order desk" description="Online orders move section by section. Each officer works the sections their supermarket admin assigned them; customers see every step live.">
      <NuxtLink v-if="me?.canEditWorkflow" to="/admin/order-workflow" class="btn-ghost h-10" data-testid="desk-edit-workflow"><AppIcon name="settings" :size="16" />Order workflow</NuxtLink>
      <button type="button" class="btn-ghost h-10" @click="load()"><AppIcon name="refresh" :size="16" />Refresh</button>
    </AdminPageHeader>

    <!-- Toolbar -->
    <div v-if="view" class="mb-4 flex flex-wrap items-center gap-2">
      <div v-if="canSeeAll && me?.stageIds.length" class="flex rounded-xl bg-white p-1 ring-1 ring-line" role="radiogroup" aria-label="Sections shown">
        <button v-for="o in [{ v: 'mine', l: 'My sections' }, { v: 'all', l: 'All sections' }] as const" :key="o.v" type="button" role="radio" :aria-checked="scope === o.v" class="rounded-lg px-3 py-1.5 text-sm font-semibold transition" :class="scope === o.v ? 'bg-hela-green text-white' : 'text-muted hover:text-ink'" @click="scope = o.v">{{ o.l }}</button>
      </div>
      <select v-if="view.branches.length > 1" v-model="branch" class="field h-10 w-auto" aria-label="Branch">
        <option value="all">All my branches</option>
        <option v-for="b in view.branches" :key="b.id" :value="b.id">{{ b.name }}</option>
      </select>
      <p class="text-sm text-muted">
        <template v-if="me?.supervisor">You supervise every section.</template>
        <template v-else-if="me?.stageIds.length">You work: <b class="text-ink">{{ view.stages.filter((s) => me!.stageIds.includes(s.id)).map((s) => s.name).join(', ') }}</b></template>
      </p>
      <form class="relative ml-auto flex items-center gap-1.5" @submit.prevent="openFound(find)">
        <AppIcon name="search" :size="15" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input v-model="find" class="field h-10 w-64 pl-9 text-sm" placeholder="Scan slip QR or type order no." aria-label="Find an order by scanning its slip or typing its number" data-testid="desk-find">
        <button v-if="canScan" type="button" class="btn-ghost h-10 px-3" aria-label="Scan a slip with the camera" @click="startScan"><AppIcon name="eye" :size="16" /></button>
      </form>
      <span class="flex items-center gap-1.5 text-xs text-muted"><span class="size-2 animate-pulse rounded-full bg-hela-green" />Live</span>
    </div>

    <div v-if="loading && !view" class="flex gap-3 overflow-hidden"><div v-for="i in 4" :key="i" class="h-80 w-72 shrink-0 animate-pulse rounded-2xl bg-white" /></div>

    <div v-else-if="view && !me?.supervisor && !me?.stageIds.length && !auth.can('orders.view')" class="rounded-2xl bg-white p-8 text-center ring-1 ring-line" data-testid="desk-unassigned">
      <AppIcon name="clipboard" :size="32" class="mx-auto text-hela-green/50" />
      <p class="mt-2 font-bold text-ink">You’re not assigned to an order section yet</p>
      <p class="mt-1 text-sm text-muted">Your supermarket admin assigns officers to Cashier, Packing, Verification, Delivery and other sections.</p>
    </div>

    <!-- Board -->
    <div v-else-if="view" class="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3" data-testid="desk-board">
      <section
        v-for="(s, si) in columns"
        :key="s.id"
        class="flex w-[19rem] shrink-0 snap-start flex-col rounded-2xl bg-white/70 ring-1"
        :class="me?.stageIds.includes(s.id) ? 'ring-2 ring-hela-green/60' : 'ring-line'"
        :aria-label="`${s.name} section`"
        :data-testid="`desk-col-${s.id}`"
      >
        <header class="flex items-start gap-2.5 rounded-t-2xl border-b border-line bg-white p-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-hela-green-50 text-hela-green"><AppIcon :name="s.icon" :size="18" /></span>
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 text-sm font-bold text-ink">
              <span class="text-xs text-muted">{{ view.stages.indexOf(s) + 1 }}.</span>{{ s.name }}
              <span class="ml-auto rounded-full bg-ink/5 px-2 py-0.5 text-xs tabular-nums">{{ ordersIn(s.id).length }}</span>
            </p>
            <p class="truncate text-[0.7rem] text-muted">{{ s.appliesTo === 'all' ? 'All orders' : s.appliesTo === 'delivery' ? 'Home delivery only' : 'Store pickup only' }}<template v-if="me?.stageIds.includes(s.id)"> · <b class="text-hela-green">Your section</b></template></p>
            <div class="mt-1.5 flex items-center -space-x-1.5">
              <span v-for="id in s.officerIds.slice(0, 5)" :key="id" class="grid size-6 place-items-center rounded-full text-[0.55rem] font-bold text-white ring-2 ring-white" :style="{ background: officerOf(id)?.avatarColor ?? '#5F7484' }" :title="officerName(id)">{{ initials(officerName(id)) }}</span>
              <span v-if="!s.officerIds.length" class="text-[0.7rem] font-semibold text-[#8a3d00]">No officer assigned — supervisors only</span>
            </div>
          </div>
        </header>

        <ul class="flex min-h-40 flex-1 flex-col gap-2 p-2">
          <li v-for="o in ordersIn(s.id)" :key="o.id">
            <article
              class="cursor-pointer rounded-xl bg-white p-3 ring-1 transition hover:shadow-card"
              :class="currentStage(o)!.state === 'on_hold' ? 'ring-[#F4C27A]' : late(o) ? 'ring-[#E8A0A0]' : 'ring-line hover:ring-hela-green/40'"
              :data-testid="`desk-card-${o.number}`"
              @click="selectedId = o.id"
            >
              <div class="flex items-center gap-2">
                <b class="text-sm text-ink">{{ o.number }}</b>
                <span class="rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold" :class="STATE[currentStage(o)!.state].tone">{{ STATE[currentStage(o)!.state].label }}</span>
                <span class="ml-auto text-[0.7rem] tabular-nums" :class="late(o) ? 'font-bold text-[#8A2E2E]' : 'text-muted'" :title="`In ${s.name} since ${fmt(sinceOf(o))}`">{{ age(sinceOf(o)) }}</span>
              </div>
              <p class="mt-1 truncate text-xs text-muted">
                <AppIcon :name="o.delivery.method === 'delivery' ? 'truck' : 'store'" :size="11" class="inline" />
                {{ o.customerName }} · {{ o.breakdown.itemCount }} items · {{ formatLKR(o.breakdown.totalCents) }}
              </p>
              <p v-if="view.branches.length > 1 && branch === 'all'" class="truncate text-[0.7rem] text-muted">{{ o.branchName }} branch</p>
              <p v-if="currentStage(o)!.assigneeName" class="mt-1 truncate text-[0.7rem] text-ink"><AppIcon name="user" :size="10" class="inline" /> {{ currentStage(o)!.assigneeName }}</p>
              <p v-if="currentStage(o)!.holdReason" class="mt-1 line-clamp-2 text-[0.7rem] font-semibold text-[#8a3d00]">{{ currentStage(o)!.holdReason }}</p>
              <button
                v-if="primary(o)"
                type="button"
                class="btn-primary mt-2 h-8 w-full text-xs"
                :disabled="busy"
                :data-testid="`desk-primary-${o.number}`"
                @click.stop="primary(o)!.action === 'complete' ? complete(o) : act(o, primary(o)!.action)"
              >
                {{ primary(o)!.label }}<AppIcon v-if="primary(o)!.action === 'complete'" name="arrow-right" :size="13" />
              </button>
            </article>
          </li>
          <li v-if="!ordersIn(s.id).length" class="grid flex-1 place-items-center p-4 text-center text-xs text-muted">
            <span><AppIcon name="check" :size="18" class="mx-auto mb-1 text-hela-green/50" />{{ si === 0 ? 'No new orders' : 'Nothing waiting here' }}</span>
          </li>
        </ul>
      </section>

      <!-- Removed sections / finished today -->
      <section v-if="orphans.length" class="flex w-[19rem] shrink-0 flex-col rounded-2xl bg-[#FFF8EE] ring-1 ring-[#F4C27A]">
        <header class="border-b border-[#F4C27A] p-3 text-sm font-bold text-[#8a3d00]">Section removed ({{ orphans.length }})<p class="text-[0.7rem] font-normal">These orders were in a section that no longer exists. A supervisor can finish them.</p></header>
        <ul class="space-y-2 p-2"><li v-for="o in orphans" :key="o.id"><button type="button" class="w-full rounded-xl bg-white p-3 text-left text-sm ring-1 ring-line" @click="selectedId = o.id"><b>{{ o.number }}</b> · {{ currentStage(o)?.name }}</button></li></ul>
      </section>
      <section class="flex w-[17rem] shrink-0 flex-col rounded-2xl bg-white/50 ring-1 ring-line" data-testid="desk-done">
        <header class="flex items-center gap-2 border-b border-line p-3">
          <span class="grid size-9 place-items-center rounded-xl bg-hela-green text-hela-gold"><AppIcon name="check" :size="18" /></span>
          <p class="text-sm font-bold text-ink">Finished · last 24 h <span class="ml-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs">{{ doneToday.length }}</span></p>
        </header>
        <ul class="space-y-1.5 p-2">
          <li v-for="o in doneToday.slice(0, 30)" :key="o.id">
            <button type="button" class="flex w-full items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-left text-xs ring-1 ring-line" @click="selectedId = o.id">
              <b class="text-ink">{{ o.number }}</b>
              <AdminBadge :value="o.status" />
              <span class="ml-auto text-muted">{{ fmt(o.history.at(-1)!.at) }}</span>
            </button>
          </li>
          <li v-if="!doneToday.length" class="p-3 text-center text-xs text-muted">Completed orders appear here.</li>
        </ul>
      </section>
    </div>

    <!-- The slip being printed (only visible on paper) -->
    <div v-if="slip" class="print-area hidden print:block"><OrderSlip :slip="slip" :origin="origin" /></div>

    <!-- Camera scanner -->
    <AdminModal :open="scanning" title="Scan an order slip" description="Point the camera at the QR code on the slip." size="sm" @close="stopScan">
      <video ref="video" class="aspect-square w-full rounded-xl bg-ink object-cover" muted playsinline />
    </AdminModal>

    <!-- Order detail -->
    <AdminModal :open="!!selected" :title="selected ? `Order ${selected.number}` : ''" :description="selected ? `${selected.branchName} branch · placed ${fmt(selected.createdAt)} · ${selected.delivery.method === 'delivery' ? 'Home delivery' : 'Store pickup'}` : ''" size="xl" @close="selectedId = null">
      <div v-if="selected" class="space-y-4" data-testid="desk-detail">
        <!-- Section progress -->
        <ol class="flex flex-wrap items-center gap-1.5" aria-label="Sections">
          <li v-for="(st, i) in selected.stages" :key="st.stageId" class="flex items-center gap-1.5">
            <span
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1"
              :class="st.state === 'done' ? 'bg-hela-green text-white ring-hela-green' : i === (selected.stageIndex ?? 0) && !isClosed(selected) ? (st.state === 'on_hold' ? 'bg-[#FDE7D3] text-[#8a3d00] ring-[#F4C27A]' : 'bg-hela-gold-100 text-ink ring-hela-gold') : 'bg-white text-muted ring-line'"
              :aria-current="i === (selected.stageIndex ?? 0) ? 'step' : undefined"
            >
              <AppIcon :name="st.state === 'done' ? 'check' : st.icon" :size="12" />{{ st.name }}
            </span>
            <AppIcon v-if="i < selected.stages!.length - 1" name="arrow-right" :size="12" class="text-muted" />
          </li>
        </ol>

        <div class="flex flex-wrap items-center gap-2 text-sm">
          <button v-if="selected.status !== 'cancelled'" type="button" class="btn-ghost h-9 text-sm" data-testid="act-print-slip" @click="printSlip(selected.id)"><AppIcon name="printer" :size="15" />{{ selected.slipPrintedAt ? 'Reprint slip' : 'Print slip' }}</button>
          <span v-if="selected.slipPrintedAt" class="text-xs text-muted">Slip printed {{ fmt(selected.slipPrintedAt) }}</span>
          <span v-else-if="selected.status !== 'cancelled'" class="text-xs font-semibold text-[#8a3d00]">No slip printed yet</span>
        </div>

        <div v-if="selected.received" class="flex items-center gap-3 rounded-xl bg-hela-green p-3 text-sm text-white" data-testid="desk-received">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-hela-gold text-hela-green-900"><AppIcon name="check" :size="18" :stroke-width="3" /></span>
          <span><b>{{ selected.delivery.method === 'pickup' ? 'Collected' : 'Received' }} by {{ selected.received.receivedBy ?? selected.customerName }}</b> · {{ fmt(selected.received.at) }}<span class="block text-xs text-white/80">{{ VIA[selected.received.via] }}<template v-if="selected.received.staffName"> · {{ selected.received.staffName }}</template></span></span>
        </div>

        <div v-if="selected.status === 'cancelled' || selected.status === 'refunded'" class="rounded-xl bg-[#FBEAEA] p-3 text-sm text-[#8A2E2E]">This order was {{ selected.status }}. {{ selected.history.at(-1)?.note }}</div>

        <!-- Actions -->
        <section v-else-if="currentStage(selected) && !isClosed(selected)" class="rounded-2xl bg-hela-green-50/60 p-4 ring-1 ring-hela-green/20" data-testid="desk-actions">
          <div class="flex flex-wrap items-center gap-2">
            <p class="mr-auto text-sm">
              <b class="text-ink">{{ currentStage(selected)!.name }}</b> ·
              <span class="rounded-full px-2 py-0.5 text-xs font-bold" :class="STATE[currentStage(selected)!.state].tone">{{ STATE[currentStage(selected)!.state].label }}</span>
              <span v-if="currentStage(selected)!.assigneeName" class="text-muted"> · {{ currentStage(selected)!.assigneeName }}</span>
              <span class="text-muted"> · {{ age(sinceOf(selected)) }}</span>
            </p>
            <template v-if="selected.canAct">
              <button v-if="currentStage(selected)!.state === 'waiting'" type="button" class="btn-ghost h-9 text-sm" :disabled="busy" data-testid="act-start" @click="act(selected, 'start')"><AppIcon name="arrow-right" :size="14" />Start</button>
              <button v-if="currentStage(selected)!.state === 'on_hold'" type="button" class="btn-primary h-9 text-sm" :disabled="busy" data-testid="act-resume" @click="act(selected, 'resume')">Resume</button>
              <button v-else type="button" class="btn-primary h-9 text-sm" :disabled="busy" data-testid="act-complete" @click="complete(selected)"><AppIcon name="check" :size="14" />{{ currentStage(selected)!.completeLabel }}</button>
            </template>
          </div>
          <div v-if="selected.canAct && atHandover(selected)" class="mt-3 rounded-xl bg-white p-3 ring-1 ring-line" data-testid="handover">
            <label class="block text-sm">
              <span class="field-label">Handed to <span class="font-normal text-muted">(if not {{ selected.customerName }})</span></span>
              <input v-model="handedTo" class="field h-9" maxlength="60" :placeholder="selected.customerName" data-testid="act-handed-to">
            </label>
            <p class="mt-1.5 flex items-start gap-1.5 text-xs text-muted"><AppIcon name="info" :size="13" class="mt-px shrink-0" />The customer can also confirm by scanning the QR code on the order slip — it updates here instantly.</p>
          </div>
          <p v-if="!selected.canAct" class="mt-2 text-xs text-muted">Only officers assigned to {{ currentStage(selected)!.name }} at {{ selected.branchName }} (or a supervisor) can update this order.</p>
          <template v-else>
            <label class="mt-3 block">
              <span class="field-label">Update <span class="font-normal text-muted">(saved with the next action, or post it on its own)</span></span>
              <textarea v-model="note" rows="2" maxlength="300" class="field" placeholder="e.g. Substituted 1L milk with 2 × 500 ml — same price" data-testid="act-note" />
            </label>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <label class="mr-auto flex items-center gap-2"><input v-model="shared" type="checkbox" class="size-4 accent-hela-green" data-testid="act-shared">Show this update to the customer</label>
              <button type="button" class="btn-ghost h-9 text-sm" :disabled="busy || !note.trim()" data-testid="act-note-post" @click="act(selected, 'note', { note, shared })">Post update</button>
              <button v-if="currentStage(selected)!.state !== 'on_hold'" type="button" class="btn-ghost h-9 text-sm" :disabled="busy" data-testid="act-hold" @click="askReason(selected, 'hold')">Put on hold</button>
              <button v-if="(selected.stageIndex ?? 0) > 0" type="button" class="btn-ghost h-9 text-sm" :disabled="busy" data-testid="act-send-back" @click="askReason(selected, 'send_back')">Send back</button>
              <button v-if="(selected.stageIndex ?? 0) === 0" type="button" class="btn-ghost h-9 text-sm text-[#8A2E2E]" :disabled="busy" data-testid="act-reject" @click="askReason(selected, 'reject')">Reject order</button>
            </div>
            <label v-if="me?.supervisor && assignable.length" class="mt-3 flex items-center gap-2 text-sm">
              <span class="text-muted">Assign to</span>
              <select class="field h-9 w-auto" :value="currentStage(selected)!.assigneeId ?? ''" data-testid="act-assign" @change="act(selected, 'assign', { assigneeId: ($event.target as HTMLSelectElement).value })">
                <option value="" disabled>Choose officer…</option>
                <option v-for="x in assignable" :key="x.id" :value="x.id">{{ x.name }} · {{ x.title }}</option>
              </select>
            </label>
          </template>
        </section>

        <div class="grid gap-4 md:grid-cols-2">
          <section class="space-y-1 text-sm">
            <h3 class="mb-1 text-xs font-bold tracking-wide text-muted uppercase">Customer</h3>
            <p class="font-semibold text-ink">{{ selected.customerName }}</p>
            <p class="text-muted">{{ selected.delivery.phone }}</p>
            <p v-if="selected.delivery.method === 'delivery'" class="text-ink">{{ selected.delivery.address }}, {{ selected.delivery.city }}</p>
            <p class="text-muted">{{ selected.delivery.slot }}</p>
            <p v-if="selected.delivery.notes" class="text-muted">Note: {{ selected.delivery.notes }}</p>
            <p class="text-muted">Payment: {{ selected.payment.method === 'card' ? `Card •${selected.payment.cardLast4}` : 'Cash on delivery' }} · <b class="text-ink">{{ selected.payment.status.replace(/-/g, ' ') }}</b> · {{ formatLKR(selected.breakdown.totalCents) }}</p>
          </section>
          <section>
            <h3 class="mb-1 flex items-center text-xs font-bold tracking-wide text-muted uppercase">Items <span class="ml-auto font-semibold normal-case">{{ ticks[selected.id]?.length ?? 0 }}/{{ selected.lines.length }} ticked</span></h3>
            <ul class="divide-y divide-line rounded-xl bg-white ring-1 ring-line">
              <li v-for="l in selected.lines" :key="l.productId">
                <label class="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                  <input type="checkbox" class="size-4 accent-hela-green" :checked="ticked(selected, l.productId)" :disabled="isClosed(selected)" @change="tick(selected, l.productId)">
                  <span class="min-w-0 flex-1" :class="{ 'text-muted line-through': ticked(selected, l.productId) }">{{ l.name }} <span class="text-muted">· {{ l.size }}</span></span>
                  <b class="tabular-nums">× {{ l.quantity }}</b>
                </label>
              </li>
            </ul>
          </section>
        </div>

        <section>
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Updates</h3>
          <ul v-if="allNotes(selected).length" class="space-y-1.5">
            <li v-for="(n, i) in allNotes(selected)" :key="i" class="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line">
              <span class="text-ink">{{ n.text }}</span>
              <span class="block text-xs text-muted">{{ n.stage }} · {{ n.by }} · {{ fmt(n.at) }}<b v-if="n.shared" class="ml-1 text-hela-green">· shown to customer</b></span>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">No updates yet.</p>
        </section>

        <section>
          <h3 class="mb-2 text-xs font-bold tracking-wide text-muted uppercase">History</h3>
          <ol class="space-y-1.5 border-l-2 border-line pl-4 text-sm">
            <li v-for="(h, i) in [...selected.history].reverse()" :key="i">
              <span class="text-ink">{{ h.note ?? h.status.replace(/_/g, ' ') }}</span>
              <span class="text-xs text-muted"> · {{ h.by }} · {{ fmt(h.at) }}</span>
            </li>
          </ol>
        </section>
      </div>
    </AdminModal>
  </div>
</template>
