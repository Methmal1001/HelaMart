<script setup lang="ts">
import type { CreditNote, ReturnRequest } from '~/types/returns'

/**
 * The credit note issued when a return is refunded: it reduces the original bill. Printable (only this prints
 * while the credit note is open). The store's copy also shows the commission and cost reversed.
 */
const { note, ret, store = false } = defineProps<{ note: CreditNote; ret: ReturnRequest; store?: boolean }>()
const items = computed(() => ret.items.filter((i) => (i.approvedQuantity ?? 0) > 0))
const day = (iso: string) => new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-LK', { hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <article class="credit-note-doc print-area rounded-2xl bg-white p-5 text-sm text-ink ring-1 ring-line sm:p-6" aria-label="Credit note" data-testid="credit-note">
    <header class="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-3">
      <div class="min-w-0">
        <p class="text-lg font-extrabold">{{ ret.storeName }}</p>
        <p class="text-xs text-muted">{{ ret.branchName }} branch<template v-if="note.branchAddress"> · {{ note.branchAddress }}</template></p>
        <p v-if="note.vatNumber" class="text-xs text-muted">VAT reg. no. {{ note.vatNumber }}</p>
      </div>
      <div class="text-right">
        <p class="text-[0.7rem] font-extrabold tracking-[0.18em] text-hela-green uppercase">Credit note</p>
        <p class="text-xl font-black tracking-tight" data-testid="credit-note-number">{{ note.number }}</p>
        <p class="text-xs text-muted">{{ day(note.issuedAt) }}, {{ time(note.issuedAt) }}</p>
      </div>
    </header>

    <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      <dt class="text-muted">Customer</dt>
      <dd class="font-semibold">{{ note.customerName }}</dd>
      <dt class="text-muted">Against bill</dt>
      <dd class="font-semibold">{{ note.orderNumber }} <span class="font-normal text-muted">of {{ day(note.orderDate) }}</span></dd>
      <dt class="text-muted">Return</dt>
      <dd class="font-semibold">{{ ret.number }}</dd>
    </dl>

    <table class="mt-4 w-full text-xs">
      <thead>
        <tr class="border-b border-line text-left text-muted">
          <th class="pb-1.5 font-semibold">Item returned</th>
          <th class="pb-1.5 text-center font-semibold">Qty</th>
          <th class="pb-1.5 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="i in items" :key="i.lineNumber" class="border-b border-line/60">
          <td class="py-1.5 pr-2">{{ i.name }} <span class="text-muted">{{ i.size }}</span><span class="block text-[0.7rem] text-muted">{{ i.reasonLabel }}</span></td>
          <td class="py-1.5 text-center tabular-nums">{{ i.approvedQuantity }}</td>
          <td class="py-1.5 text-right tabular-nums">{{ formatLKR(i.refundCents) }}</td>
        </tr>
        <tr v-if="note.deliveryCents" class="border-b border-line/60">
          <td class="py-1.5" colspan="2">Delivery fee</td>
          <td class="py-1.5 text-right tabular-nums">{{ formatLKR(note.deliveryCents) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="mt-3 flex items-baseline justify-between border-t-2 border-ink pt-2">
      <b>Total credited</b>
      <b class="text-lg tabular-nums" data-testid="credit-note-total">{{ formatLKR(note.totalCents) }}</b>
    </div>
    <p v-if="note.vatCents" class="mt-0.5 text-right text-xs text-muted">Includes VAT {{ note.vatPercent != null ? `at ${note.vatPercent}% ` : '' }}of {{ formatLKR(note.vatCents) }} (on {{ formatLKR(note.taxableCents) }})</p>

    <section class="mt-4 rounded-xl bg-hela-green-50/70 p-3 text-xs">
      <p class="font-bold text-ink">How it was refunded</p>
      <p class="mt-0.5" data-testid="credit-note-summary">{{ note.summary }}</p>
      <p v-if="note.gatewayReference" class="mt-0.5 text-muted">Card refund reference {{ note.gatewayReference }} · usually shows on the statement within 5–10 working days</p>
      <p v-if="note.reference" class="mt-0.5 text-muted">Reference {{ note.reference }}</p>
      <p v-if="note.storeCreditCents" class="mt-0.5 text-muted">Store credit can be used on your next order at {{ ret.storeName }}.</p>
    </section>

    <dl v-if="store" class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs text-muted print:hidden" data-testid="credit-note-internal">
      <dt>Issued by</dt><dd>{{ note.issuedBy }}</dd>
      <dt>HelaMart commission reversed</dt><dd class="tabular-nums">{{ formatLKR(note.commissionCents ?? 0) }}</dd>
      <dt>Cost of goods back on sale</dt><dd class="tabular-nums">{{ formatLKR(note.costCents ?? 0) }}</dd>
    </dl>

    <p class="mt-4 border-t border-line pt-2 text-center text-[0.7rem] text-muted">This credit note reduces bill {{ note.orderNumber }} by {{ formatLKR(note.totalCents) }}. Issued through HelaMart.</p>
  </article>
</template>
