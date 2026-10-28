<script setup lang="ts">
const { itemCount, subtotalCents, deliveryFeeCents, totalCents } = useCart()
</script>

<template>
  <dl class="space-y-2 text-sm">
    <div class="flex justify-between text-muted">
      <dt>Items</dt>
      <dd class="tabular-nums">{{ itemCount }}</dd>
    </div>
    <div class="flex justify-between text-muted">
      <dt>Subtotal</dt>
      <dd class="tabular-nums text-ink">{{ formatLKR(subtotalCents) }}</dd>
    </div>
    <div class="flex justify-between text-muted">
      <dt>
        Delivery fee
        <span class="ml-1 rounded-md bg-hela-gold-100 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-hela-gold-600 uppercase">Estimate</span>
      </dt>
      <dd class="tabular-nums text-ink">{{ formatLKR(deliveryFeeCents) }}</dd>
    </div>
    <div class="flex items-baseline justify-between border-t border-dashed border-line pt-3">
      <dt class="font-bold text-ink">Estimated total</dt>
      <dd class="text-lg font-extrabold tabular-nums text-hela-green">{{ formatLKR(totalCents) }}</dd>
    </div>
  </dl>
</template>
