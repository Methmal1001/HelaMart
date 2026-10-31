<script setup lang="ts">
import type { PublicTracking } from '~/types'
import { confirmReceivedByQr, trackOrder } from '~/services/orderService'

/**
 * What the QR code on an order slip opens. Anyone holding the slip (the code
 * in the link proves it) can follow the order and, once it has arrived,
 * confirm with one tap that they received it — the supermarket's order desk
 * and the customer's account update straight away.
 */
const route = useRoute()
const number = computed(() => String(route.params.number ?? '').toUpperCase())
const code = computed(() => (typeof route.query.t === 'string' ? route.query.t : ''))
useHead({ title: () => `Track ${number.value} — HelaMart`, meta: [{ name: 'robots', content: 'noindex' }, { name: 'referrer', content: 'no-referrer' }] })

const view = ref<PublicTracking | null>(null)
const error = ref('')
const loading = ref(true)
const confirming = ref(false)
const justConfirmed = ref(false)
const receivedBy = ref('')
const someoneElse = ref(false)

async function load(quiet = false) {
  if (!quiet) loading.value = true
  try {
    view.value = await trackOrder(number.value, code.value)
    error.value = ''
  } catch (e) {
    if (!quiet) error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  void load()
  // Keep following the order while the page is open.
  timer = setInterval(() => document.visibilityState === 'visible' && !justConfirmed.value && load(true), 15000)
})
onBeforeUnmount(() => timer && clearInterval(timer))

const pickup = computed(() => view.value?.delivery.method === 'pickup')
const closed = computed(() => view.value?.progress === 'cancelled' || view.value?.progress === 'refunded')

async function confirm() {
  if (!view.value) return
  confirming.value = true
  error.value = ''
  try {
    view.value = await confirmReceivedByQr(number.value, code.value, someoneElse.value ? receivedBy.value : view.value.customerFirstName)
    justConfirmed.value = true
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    confirming.value = false
  }
}
const fmt = (iso: string) => new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
</script>

<template>
  <div class="min-h-dvh bg-warm-white">
    <header class="border-b border-line bg-white/80 backdrop-blur">
      <div class="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
        <NuxtLink to="/" aria-label="HelaMart home"><BrandLogo size="sm" tagline /></NuxtLink>
        <span class="rounded-full bg-hela-green-50 px-3 py-1 text-xs font-bold text-hela-green">Order tracking</span>
      </div>
    </header>

    <main class="mx-auto max-w-xl px-4 py-6">
      <div v-if="loading" class="space-y-3" aria-busy="true">
        <div class="h-24 animate-pulse rounded-2xl bg-white" />
        <div class="h-64 animate-pulse rounded-2xl bg-white" />
      </div>

      <div v-else-if="!view" class="rounded-2xl bg-white p-6 text-center ring-1 ring-line" role="alert" data-testid="track-invalid">
        <AppIcon name="alert" :size="30" class="mx-auto text-[#8A2E2E]" />
        <p class="mt-2 font-bold text-ink">{{ error || 'Order not found' }}</p>
        <p class="mt-1 text-sm text-muted">Check that you scanned the QR code on the order slip that came with your order.</p>
        <NuxtLink to="/" class="btn-primary mt-4 inline-flex h-11 px-5">Go to HelaMart</NuxtLink>
      </div>

      <template v-else>
        <!-- Order -->
        <section class="rounded-2xl bg-white p-4 ring-1 ring-line">
          <p class="text-xs font-bold tracking-wide text-muted uppercase">Order</p>
          <h1 class="text-2xl font-extrabold tracking-tight text-ink" data-testid="track-number">{{ view.number }}</h1>
          <p class="text-sm text-muted">{{ view.storeName }}<template v-if="view.branchName"> · {{ view.branchName }}</template> · {{ fmt(view.createdAt) }}</p>
          <p class="mt-2 text-sm text-ink">{{ view.itemCount }} items · <b>{{ formatLKR(view.totalCents) }}</b> · {{ pickup ? 'Store pickup' : `Delivery to ${view.delivery.city}` }}</p>
        </section>

        <!-- Just confirmed -->
        <section v-if="justConfirmed || view.received" class="mt-4 overflow-hidden rounded-2xl bg-hela-green p-5 text-white" role="status" data-testid="track-received">
          <div class="flex items-center gap-3">
            <span class="grid size-12 shrink-0 place-items-center rounded-full bg-hela-gold text-hela-green-900" :class="{ 'animate-[pop_.5s_ease-out]': justConfirmed }"><AppIcon name="check" :size="26" :stroke-width="3" /></span>
            <div>
              <p class="text-lg font-extrabold">{{ justConfirmed ? `Thank you${view.customerFirstName ? `, ${view.customerFirstName}` : ''}!` : pickup ? 'Collected' : 'Delivered' }}</p>
              <p class="text-sm text-white/85">
                {{ pickup ? 'Collected' : 'Received' }}<template v-if="view.received?.receivedBy"> by {{ view.received.receivedBy }}</template><template v-if="view.received"> · {{ fmt(view.received.at) }}</template>.
                {{ justConfirmed ? `${view.storeName} has been told.` : '' }}
              </p>
            </div>
          </div>
        </section>

        <!-- Confirm receipt -->
        <section v-else-if="view.canConfirmReceipt" class="mt-4 rounded-2xl bg-white p-5 ring-2 ring-hela-gold shadow-card" data-testid="track-confirm">
          <p class="text-lg font-extrabold text-ink">{{ pickup ? 'Collected your order?' : 'Got your order?' }}</p>
          <p class="mt-1 text-sm text-muted">Check your items against the slip, then confirm. It lets {{ view.storeName }} know {{ pickup ? 'you’ve collected it' : 'it reached you safely' }}.</p>
          <label class="mt-3 flex items-center gap-2 text-sm">
            <input v-model="someoneElse" type="checkbox" class="size-4 accent-hela-green" data-testid="track-someone-else">
            Someone else is receiving it for me
          </label>
          <input v-if="someoneElse" v-model="receivedBy" class="field mt-2" maxlength="60" placeholder="Their name, e.g. Mrs. Perera (neighbour)" aria-label="Received by" data-testid="track-received-by">
          <button type="button" class="btn-primary mt-4 h-13 w-full text-base" :disabled="confirming || (someoneElse && !receivedBy.trim())" data-testid="track-confirm-btn" @click="confirm">
            <AppIcon name="check" :size="19" :stroke-width="3" />
            {{ confirming ? 'Confirming…' : pickup ? 'Yes, I’ve collected my order' : 'Yes, I’ve received my order' }}
          </button>
          <p v-if="error" class="mt-2 text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
        </section>

        <p v-else-if="!closed" class="mt-4 flex items-start gap-2 rounded-xl bg-hela-gold-100/60 px-3.5 py-2.5 text-sm text-[#6d5622]" data-testid="track-not-yet">
          <AppIcon name="info" :size="16" class="mt-0.5 shrink-0" />
          <span>{{ view.stageLabel ? `${view.stageLabel}.` : '' }} You can confirm here once it’s {{ pickup ? 'ready to collect' : 'out for delivery' }}.</span>
        </p>

        <OrderTracking :order="view" class="mt-4" />

        <section class="mt-4 rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 class="mb-2 text-sm font-bold text-ink">Items</h2>
          <ul class="divide-y divide-line text-sm">
            <li v-for="(l, i) in view.lines" :key="i" class="flex justify-between gap-3 py-1.5">
              <span class="text-ink">{{ l.name }} <span class="text-muted">· {{ l.size }}</span></span>
              <b class="tabular-nums">× {{ l.quantity }}</b>
            </li>
          </ul>
        </section>
        <p class="mt-4 text-center text-xs text-muted">Signed in on HelaMart? Your full bill is under <b>Your account → Your orders</b>.</p>
      </template>
    </main>
  </div>
</template>

<style scoped>
@keyframes pop {
  0% { transform: scale(0.4); opacity: 0; }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
</style>
