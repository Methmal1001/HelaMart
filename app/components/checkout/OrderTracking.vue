<script setup lang="ts">
import type { IconName, Order, OrderProgress, TrackingStep } from '~/types'

/**
 * Delivery / pickup tracking for one order. Follows the supermarket's own
 * sections from its order desk (Cashier → Packing → Verification → Delivery…),
 * with any updates the store chose to share. Older orders without sections
 * show the simple Received → Packed → Out for delivery → Delivered flow.
 */
/** A full order, or the public view the slip's QR code opens. */
type Trackable = Pick<Order, 'createdAt' | 'tracking' | 'progress' | 'steps' | 'storeName' | 'branchName'> & { delivery: Pick<Order['delivery'], 'method' | 'city'> }
const props = defineProps<{ order: Trackable }>()

const pickup = computed(() => props.order.delivery.method === 'pickup')
const fmt = (iso: string) => new Intl.DateTimeFormat('en-LK', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/** Latest time each status was reached. */
const reached = computed(() => {
  const m = new Map<OrderProgress, { at: string; note?: string }>()
  for (const t of props.order.tracking ?? [{ at: props.order.createdAt, status: 'pending' as const }]) m.set(t.status, t)
  return m
})
const stopped = computed(() => (['cancelled', 'refunded'] as const).find((s) => reached.value.has(s)) ?? null)

function simpleFlow(): TrackingStep[] {
  const flow: { status: OrderProgress; label: string; hint: string; icon: IconName }[] = [
    { status: 'pending', label: 'Order received', hint: `${props.order.storeName ?? 'The supermarket'} has your order.`, icon: 'receipt' },
    { status: 'packing', label: 'Packed', hint: 'Your items are being picked and packed.', icon: 'package' },
    pickup.value
      ? { status: 'ready_for_pickup', label: 'Ready to collect', hint: `Collect it at ${props.order.branchName ?? 'the store'}.`, icon: 'store' }
      : { status: 'out_for_delivery', label: 'Out for delivery', hint: `On the way to ${props.order.delivery.city}.`, icon: 'truck' },
    { status: 'delivered', label: pickup.value ? 'Collected' : 'Delivered', hint: pickup.value ? 'Picked up — enjoy!' : 'Handed over at your door — enjoy!', icon: 'check' },
  ]
  const at = flow.findIndex((s) => s.status === (props.order.progress ?? 'pending'))
  const lastDone = Math.max(at, ...flow.map((s, i) => (reached.value.has(s.status) ? i : -1)))
  return flow.map((s, i) => ({
    label: s.label, hint: i <= lastDone ? s.hint : undefined, icon: s.icon, at: reached.value.get(s.status)?.at,
    state: i < lastDone ? 'done' : i === lastDone ? (s.status === 'delivered' ? 'done' : 'current') : 'todo',
  }))
}

const steps = computed<TrackingStep[]>(() => props.order.steps ?? simpleFlow())
const finished = computed(() => !stopped.value && steps.value.every((s) => s.state === 'done'))
</script>

<template>
  <section class="rounded-2xl bg-white p-4 ring-1 ring-line" aria-label="Order tracking" data-testid="order-tracking">
    <h3 class="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
      <AppIcon :name="pickup ? 'store' : 'truck'" :size="16" class="text-hela-green" />
      {{ pickup ? 'Pickup tracking' : 'Delivery tracking' }}
      <span v-if="finished" class="ml-auto rounded-full bg-hela-green-50 px-2 py-0.5 text-[0.65rem] font-bold text-hela-green">{{ pickup ? 'Collected' : 'Delivered' }} — enjoy!</span>
    </h3>

    <div v-if="stopped" class="mb-3 flex items-start gap-2 rounded-xl bg-[#FBEAEA] p-3 text-sm text-[#8A2E2E]" role="status" data-testid="tracking-stopped">
      <AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
      <span>
        <b>{{ stopped === 'refunded' ? 'Refunded' : 'Cancelled' }}</b> · {{ fmt(reached.get(stopped)!.at) }}
        <span v-if="reached.get(stopped)?.note" class="block text-xs">Reason: {{ reached.get(stopped)!.note }}</span>
      </span>
    </div>

    <ol class="relative" :class="{ 'opacity-50': stopped }">
      <li v-for="(s, i) in steps" :key="i" class="relative flex gap-3 pb-4 last:pb-0" :data-state="s.state" :data-testid="`track-step-${i}`">
        <!-- connector -->
        <span v-if="i < steps.length - 1" class="absolute top-8 bottom-0 left-[15px] w-0.5 rounded-full" :class="steps[i + 1]!.state !== 'todo' ? 'bg-hela-green' : 'bg-line'" aria-hidden="true" />
        <span
          class="relative z-10 grid size-8 shrink-0 place-items-center rounded-full transition"
          :class="s.state === 'done' ? 'bg-hela-green text-hela-gold' : s.state === 'current' ? 'bg-hela-gold text-hela-green-900 ring-4 ring-hela-gold/25' : s.state === 'hold' ? 'bg-[#F4C27A] text-[#6d3d00] ring-4 ring-[#F4C27A]/30' : 'bg-cream text-muted ring-1 ring-line'"
        >
          <AppIcon :name="s.state === 'done' ? 'check' : s.state === 'hold' ? 'alert' : s.icon" :size="15" :stroke-width="s.state === 'done' ? 3 : 2" />
          <span v-if="s.state === 'current' && !stopped" class="absolute inset-0 animate-ping rounded-full bg-hela-gold/40 motion-reduce:hidden" aria-hidden="true" />
        </span>
        <span class="min-w-0 pt-1">
          <span class="flex flex-wrap items-baseline gap-x-2">
            <b class="text-sm" :class="s.state === 'todo' ? 'text-muted' : 'text-ink'">{{ s.label }}</b>
            <span v-if="s.at && s.state !== 'todo'" class="text-xs text-muted">{{ fmt(s.at) }}</span>
          </span>
          <span v-if="s.hint && s.state !== 'todo'" class="block text-xs" :class="s.state === 'hold' ? 'font-semibold text-[#8a5300]' : 'text-muted'">{{ s.hint }}</span>
          <span v-for="(n, k) in s.notes" :key="k" class="mt-1 flex items-start gap-1.5 rounded-lg bg-hela-green-50/70 px-2 py-1 text-xs text-ink" data-testid="track-note">
            <AppIcon name="info" :size="12" class="mt-0.5 shrink-0 text-hela-green" />{{ n.text }} <span class="shrink-0 text-muted">· {{ fmt(n.at) }}</span>
          </span>
          <span class="sr-only">{{ s.state === 'done' ? '(done)' : s.state === 'current' ? '(current step)' : s.state === 'hold' ? '(delayed)' : '(not yet)' }}</span>
        </span>
      </li>
    </ol>
  </section>
</template>
