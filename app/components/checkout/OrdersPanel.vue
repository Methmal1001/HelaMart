<script setup lang="ts">
import { progressOf } from '~/composables/useMyOrders'
import { confirmMyOrderReceived } from '~/services/orderService'

/**
 * "Your orders": every order the customer has placed, newest first. Tap one to
 * reopen its bill — view or print it any time after checkout.
 */
const { panel, closePanel, openPanel } = useStoreUi()
const { isAuthenticated } = useAuth()
const { orders, loaded, loading, error, viewingId, load } = useMyOrders()
const { authorized } = useAuth()
const { show } = useToasts()
const confirming = ref(false)
/** The customer confirms they have the order (same as scanning the slip's QR). */
async function confirmReceived(id: string) {
  confirming.value = true
  try {
    await authorized((t) => confirmMyOrderReceived(t, id))
    await load()
    show('Thanks! The supermarket has been told you received your order.', 'success')
  } catch (e) {
    show((e as Error).message, 'error')
  } finally {
    confirming.value = false
  }
}

const open = computed(() => panel.value === 'orders' && isAuthenticated.value)
watch(open, (v) => v && load(), { immediate: true })

const viewing = computed(() => orders.value.find((o) => o.id === viewingId.value) ?? null)
const query = ref('')
const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return orders.value
  return orders.value.filter((o) => `${o.number} ${o.storeName ?? ''} ${o.branchName ?? ''} ${o.lines.map((l) => l.name).join(' ')}`.toLowerCase().includes(q))
})

const when = (iso: string) => new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
const itemsText = (n: number) => `${n} item${n === 1 ? '' : 's'}`

function printBill() {
  window.print()
}

// Live tracking: refresh when the supermarket updates an order (another tab or device sync), and every 20 s while open.
let timer: ReturnType<typeof setInterval> | null = null
watch(open, (v) => {
  if (timer) clearInterval(timer)
  timer = v ? setInterval(() => document.visibilityState === 'visible' && load(), 20000) : null
})
onBeforeUnmount(() => timer && clearInterval(timer))

function close() {
  viewingId.value = null
  closePanel()
}
</script>

<template>
  <SidePanel :open="open" :title="viewing ? `Bill ${viewing.number}` : 'Your orders'" width="sm:max-w-lg" @close="close">
    <!-- One bill -->
    <div v-if="viewing" class="px-5 py-5" data-testid="order-bill">
      <button type="button" class="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-hela-green hover:underline" data-testid="orders-back" @click="viewingId = null">
        <AppIcon name="arrow-left" :size="15" />All orders
      </button>
      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded-full px-2.5 py-1 font-bold" :class="progressOf(viewing).tone" data-testid="order-progress">{{ progressOf(viewing).label }}</span>
        <span class="text-muted">{{ viewing.storeName }}<template v-if="viewing.branchName"> · {{ viewing.branchName }}</template></span>
      </div>
      <div v-if="viewing.canConfirmReceipt" class="mb-3 rounded-2xl bg-white p-4 ring-2 ring-hela-gold" data-testid="confirm-receipt">
        <p class="font-bold text-ink">{{ viewing.delivery.method === 'pickup' ? 'Collected your order?' : 'Got your order?' }}</p>
        <p class="mt-0.5 text-xs text-muted">Confirm here, or scan the QR code on the order slip that came with it.</p>
        <button type="button" class="btn-primary mt-3 h-11 w-full" :disabled="confirming" data-testid="confirm-receipt-btn" @click="confirmReceived(viewing.id)">
          <AppIcon name="check" :size="17" :stroke-width="3" />{{ confirming ? 'Confirming…' : viewing.delivery.method === 'pickup' ? 'Yes, I’ve collected it' : 'Yes, I’ve received it' }}
        </button>
      </div>
      <p v-else-if="viewing.received" class="mb-3 flex items-center gap-2 rounded-xl bg-hela-green-50 px-3 py-2 text-xs font-semibold text-hela-green" data-testid="receipt-confirmed">
        <AppIcon name="check" :size="14" :stroke-width="3" />
        {{ viewing.delivery.method === 'pickup' ? 'Collected' : 'Received' }}<template v-if="viewing.received.receivedBy"> by {{ viewing.received.receivedBy }}</template> · {{ when(viewing.received.at) }}
        · {{ viewing.received.via === 'customer_qr' ? 'confirmed by QR scan' : viewing.received.via === 'customer_app' ? 'confirmed by you' : 'confirmed by the store' }}
      </p>
      <OrderTracking :order="viewing" class="mb-3" />
      <OrderReceipt :order="viewing" />
    </div>

    <!-- The list -->
    <div v-else class="px-5 py-5">
      <label v-if="orders.length > 3" class="relative mb-3 block">
        <span class="sr-only">Search your orders</span>
        <AppIcon name="search" :size="15" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input v-model="query" type="search" class="field h-10 pl-9 text-sm" placeholder="Search by bill number, store or item" data-testid="orders-search">
      </label>

      <div v-if="loading && !loaded" class="space-y-2" aria-hidden="true">
        <div v-for="i in 3" :key="i" class="h-20 animate-pulse rounded-2xl bg-hela-green-50" />
      </div>
      <p v-else-if="error" class="rounded-xl bg-[#fbeaea] p-3.5 text-sm text-[#8A2E2E]" role="alert">
        {{ error }} <button type="button" class="font-bold underline" @click="load">Retry</button>
      </p>
      <div v-else-if="!orders.length" class="rounded-2xl bg-white p-6 text-center ring-1 ring-line">
        <AppIcon name="receipt" :size="30" class="mx-auto text-hela-green/50" />
        <p class="mt-2 font-bold text-ink">No orders yet</p>
        <p class="mt-1 text-sm text-muted">Your bills will be kept here after you check out.</p>
      </div>
      <p v-else-if="!shown.length" class="text-sm text-muted">No order matches “{{ query }}”.</p>

      <ul v-else class="space-y-2" data-testid="orders-list">
        <li v-for="o in shown" :key="o.id">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-2xl bg-white p-3.5 text-left ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-card hover:ring-hela-green/40"
            :data-testid="`order-${o.number}`"
            @click="viewingId = o.id"
          >
            <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-hela-green-50 text-hela-green"><AppIcon name="receipt" :size="20" /></span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2">
                <b class="truncate text-sm text-ink">{{ o.number }}</b>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold" :class="progressOf(o).tone">{{ progressOf(o).label }}</span>
              </span>
              <span class="block truncate text-xs text-muted">{{ when(o.createdAt) }}<template v-if="o.storeName"> · {{ o.storeName }}</template></span>
              <span class="block truncate text-xs text-muted">{{ itemsText(o.breakdown.itemCount) }} · {{ o.lines.map((l) => l.name).join(', ') }}</span>
            </span>
            <span class="shrink-0 text-right">
              <b class="block text-sm text-ink tabular-nums">{{ formatLKR(o.breakdown.totalCents) }}</b>
              <span class="text-[0.7rem] font-bold text-hela-green">View bill →</span>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <template #footer>
      <div v-if="viewing" class="grid grid-cols-2 gap-2">
        <button type="button" class="btn-ghost" data-testid="orders-print" @click="printBill()">
          <AppIcon name="printer" :size="17" />
          Print bill
        </button>
        <button type="button" class="btn-primary" @click="close">Continue shopping</button>
      </div>
      <button v-else type="button" class="btn-ghost w-full" @click="openPanel('account')">
        <AppIcon name="user" :size="17" />
        Back to your account
      </button>
    </template>
  </SidePanel>
</template>
