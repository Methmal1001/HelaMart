<script setup lang="ts">
import type { Order } from '~/types'

const props = defineProps<{ order: Order }>()
const when = computed(() => new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(props.order.createdAt)))
const b = computed(() => props.order.breakdown)
</script>

<template>
  <article class="print-area rounded-2xl bg-white p-5 ring-1 ring-line" aria-label="Order receipt">
    <header class="flex items-start justify-between gap-3 border-b border-dashed border-line pb-4">
      <div>
        <BrandLogo size="sm" tagline />
        <p class="mt-3 text-xs text-muted">Tax invoice / bill (sample)</p>
      </div>
      <div class="text-right text-xs">
        <p class="font-bold text-ink">{{ order.number }}</p>
        <p class="text-muted">{{ when }}</p>
      </div>
    </header>

    <dl class="grid grid-cols-2 gap-x-4 gap-y-1 border-b border-dashed border-line py-3 text-xs">
      <template v-if="order.storeName">
        <dt class="text-muted">Supermarket</dt>
        <dd class="text-right text-ink">{{ order.storeName }}<template v-if="order.branchName"> · {{ order.branchName }}</template></dd>
      </template>
      <dt class="text-muted">Customer</dt>
      <dd class="text-right text-ink">{{ order.delivery.fullName }}</dd>
      <dt class="text-muted">Phone</dt>
      <dd class="text-right text-ink">{{ order.delivery.phone }}</dd>
      <dt class="text-muted">{{ order.delivery.method === 'delivery' ? 'Deliver to' : 'Collect from' }}</dt>
      <dd class="text-right text-ink">
        {{ order.delivery.method === 'delivery' ? `${order.delivery.address}, ${order.delivery.city}` : `${order.storeName ?? 'HelaMart store'}${order.branchName ? ` ${order.branchName}` : ''} — pickup counter` }}
      </dd>
      <dt class="text-muted">Time slot</dt>
      <dd class="text-right text-ink">{{ order.delivery.slot }}</dd>
      <dt class="text-muted">Payment</dt>
      <dd class="text-right text-ink">
        {{ order.payment.method === 'card' ? `Card •••• ${order.payment.cardLast4} — Paid` : 'Cash on delivery — Pay on arrival' }}
      </dd>
    </dl>

    <table class="mt-3 w-full text-xs">
      <thead>
        <tr class="text-left text-muted">
          <th class="pb-1.5 font-semibold">Item</th>
          <th class="pb-1.5 text-center font-semibold">Qty</th>
          <th class="pb-1.5 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in order.lines" :key="l.productId" class="align-top">
          <td class="py-1 pr-2 text-ink">
            {{ l.name }} <span class="text-muted">· {{ l.size }}</span>
            <span class="block text-muted">@ {{ formatLKR(l.unitPriceCents) }}</span>
            <span v-if="l.discountCents" class="block text-hela-green">Offer − {{ formatLKR(l.discountCents) }}</span>
          </td>
          <td class="py-1 text-center tabular-nums">{{ l.quantity }}</td>
          <td class="py-1 text-right tabular-nums">{{ formatLKR(l.finalCents) }}</td>
        </tr>
      </tbody>
    </table>

    <div class="mt-3 border-t border-dashed border-line pt-3">
      <CartSummary :bill="b" :show-hints="false" />
    </div>
    <p class="mt-4 text-center text-[0.7rem] text-muted">Thank you for shopping at HelaMart · Everything for Every Home.</p>
  </article>
</template>
