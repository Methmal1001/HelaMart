<script setup lang="ts">
import type { OrderSlip } from '~/services/admin/orderDeskApi'

/**
 * The order slip printed when the cashier approves an order: goes with the
 * bags through packing and verification to the customer. The QR code opens
 * the order's tracking page, where the customer confirms they received it.
 * Sized for 80 mm receipt printers; prints cleanly on A4 too.
 */
const props = defineProps<{ slip: OrderSlip; origin: string }>()
const o = computed(() => props.slip.order)
const url = computed(() => `${props.origin}${props.slip.trackPath}`)
const pickup = computed(() => o.value.delivery.method === 'pickup')
const cod = computed(() => o.value.payment.method === 'cod' && o.value.payment.status !== 'paid')
const when = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <article class="order-slip mx-auto bg-white text-black" aria-label="Order slip" data-testid="order-slip">
    <header class="text-center">
      <p class="text-[15px] font-extrabold uppercase">{{ slip.storeName }}</p>
      <p class="text-[11px]">{{ slip.branchName }} branch<template v-if="slip.branchPhone"> · {{ slip.branchPhone }}</template></p>
      <p class="mt-1 text-[10px] tracking-[0.2em] uppercase">Order slip · via HelaMart</p>
    </header>

    <div class="rule" />

    <div class="flex items-center justify-between gap-2">
      <div>
        <p class="text-[10px] uppercase">Tracking no.</p>
        <p class="text-[20px] leading-tight font-black tracking-tight" data-testid="slip-number">{{ o.number }}</p>
        <p class="text-[10px]">Placed {{ when(o.createdAt) }}</p>
      </div>
      <span class="badge">{{ pickup ? 'PICKUP' : 'DELIVERY' }}</span>
    </div>

    <div class="rule" />

    <section class="text-[12px] leading-snug">
      <p class="text-[10px] uppercase">{{ pickup ? 'Customer' : 'Deliver to' }}</p>
      <p class="text-[14px] font-bold">{{ o.delivery.fullName || o.customerName }}</p>
      <p class="font-semibold">{{ o.delivery.phone }}</p>
      <p v-if="!pickup">{{ o.delivery.address }}<br>{{ o.delivery.city }}</p>
      <p class="mt-1"><b>Slot:</b> {{ o.delivery.slot }}</p>
      <p v-if="o.delivery.notes" class="mt-1"><b>Note:</b> {{ o.delivery.notes }}</p>
    </section>

    <div class="pay" :class="{ cod }">
      <template v-if="cod">COLLECT CASH {{ formatLKR(o.breakdown.totalCents) }}</template>
      <template v-else>PAID · {{ o.payment.method === 'card' ? `Card •${o.payment.cardLast4}` : 'Cash' }} · {{ formatLKR(o.breakdown.totalCents) }}</template>
    </div>

    <table class="mt-2 w-full text-[11px]">
      <thead><tr><th class="w-4" /><th class="text-left">Item</th><th class="text-right">Qty</th></tr></thead>
      <tbody>
        <tr v-for="l in o.lines" :key="l.productId">
          <td><span class="box" /></td>
          <td class="pr-1">{{ l.name }} <span class="opacity-70">{{ l.size }}</span></td>
          <td class="text-right font-bold">{{ l.quantity }}</td>
        </tr>
      </tbody>
    </table>
    <p class="mt-1 text-right text-[11px]">{{ o.breakdown.itemCount }} items · <b>{{ formatLKR(o.breakdown.totalCents) }}</b></p>

    <div class="rule" />

    <section class="flex flex-col items-center text-center">
      <QrCode :value="url" :size="150" :label="`Tracking QR for ${o.number}`" />
      <p class="mt-1 text-[12px] font-bold">{{ pickup ? 'Scan when you collect it' : 'Scan when it arrives' }}</p>
      <p class="text-[10px] leading-snug">to confirm you received your order and track it live.</p>
      <p class="mt-0.5 font-mono text-[9px] break-all opacity-70">{{ o.number }}</p>
    </section>

    <div class="rule" />
    <footer class="flex justify-between text-[9px]">
      <span>Printed by {{ slip.printedBy }}</span>
      <span>{{ when(slip.printedAt) }}</span>
    </footer>
    <p v-if="slip.nextSection" class="mt-0.5 text-[9px]">Next: <b>{{ slip.nextSection }}</b></p>
  </article>
</template>

<style scoped>
.order-slip {
  width: 76mm;
  padding: 4mm 3mm;
  font-family: ui-sans-serif, system-ui, sans-serif;
}
.rule {
  margin: 2.5mm 0;
  border-top: 1px dashed #000;
}
.badge {
  border: 2px solid #000;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.08em;
}
.pay {
  margin-top: 2.5mm;
  border: 1.5px solid #000;
  border-radius: 4px;
  padding: 4px 6px;
  text-align: center;
  font-size: 12px;
  font-weight: 800;
}
.pay.cod {
  background: #000;
  color: #fff;
  font-size: 13px;
}
.box {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1px solid #000;
}
th {
  font-size: 9px;
  text-transform: uppercase;
  border-bottom: 1px solid #000;
  padding-bottom: 2px;
}
td {
  padding: 2px 0;
  vertical-align: top;
}
@media print {
  .order-slip {
    box-shadow: none;
  }
}
</style>
