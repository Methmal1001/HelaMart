<script setup lang="ts">
import type { PriceBreakdown } from '~/types'

/** Bill breakdown. Pass `bill` to show a specific breakdown (e.g. checkout with pickup). */
const props = withDefaults(defineProps<{ bill?: PriceBreakdown; showHints?: boolean }>(), { showHints: true })

const live = useBill()
const b = computed(() => props.bill ?? live.value)
const { isAuthenticated } = useAuth()
const { requestLogin } = useAuthDialog()
</script>

<template>
  <div>
    <dl class="space-y-2 text-sm">
      <div class="flex justify-between text-muted">
        <dt>Items</dt>
        <dd class="tabular-nums">{{ b.itemCount }}</dd>
      </div>
      <div class="flex justify-between text-muted">
        <dt>Subtotal</dt>
        <dd class="tabular-nums text-ink">{{ formatLKR(b.subtotalCents) }}</dd>
      </div>
      <div v-for="a in b.applied.filter((x) => x.scope !== 'delivery')" :key="a.offer.id" class="flex justify-between gap-3 text-hela-green">
        <dt class="flex min-w-0 items-center gap-1.5">
          <AppIcon name="tag" :size="14" class="shrink-0" />
          <span class="truncate">{{ a.offer.title }}</span>
        </dt>
        <dd class="shrink-0 font-semibold tabular-nums">− {{ formatLKR(a.discountCents) }}</dd>
      </div>
      <div class="flex justify-between text-muted">
        <dt>
          Delivery fee
          <span v-if="b.deliveryFeeCents" class="ml-1 rounded-md bg-hela-gold-100 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-hela-gold-600 uppercase">Estimate</span>
        </dt>
        <dd class="tabular-nums" :class="b.deliveryDiscountCents ? 'text-hela-green' : 'text-ink'">
          <template v-if="!b.deliveryFeeCents">{{ b.itemCount ? 'Free (pickup)' : formatLKR(0) }}</template>
          <template v-else-if="b.deliveryDiscountCents">
            <s class="mr-1 text-muted">{{ formatLKR(b.deliveryFeeCents) }}</s>Free
          </template>
          <template v-else>{{ formatLKR(b.deliveryFeeCents) }}</template>
        </dd>
      </div>
      <div class="flex items-baseline justify-between border-t border-dashed border-line pt-3">
        <dt class="font-bold text-ink">Total</dt>
        <dd class="text-lg font-extrabold tabular-nums text-hela-green">{{ formatLKR(b.totalCents) }}</dd>
      </div>
      <p v-if="b.totalDiscountCents" class="rounded-lg bg-hela-green-50 px-3 py-1.5 text-center text-xs font-bold text-hela-green">
        You save {{ formatLKR(b.totalDiscountCents) }} with offers
      </p>
    </dl>

    <template v-if="showHints && b.itemCount">
      <ul v-if="b.unmet.length" class="mt-3 space-y-1.5" data-testid="unlock-hints">
        <li v-for="u in b.unmet" :key="u.offer.id" class="flex gap-2 text-xs text-muted">
          <AppIcon name="gift" :size="14" class="mt-px shrink-0 text-hela-gold-600" />
          <span><b class="text-ink">{{ u.offer.title }}:</b> {{ u.hint }}</span>
        </li>
      </ul>
      <button
        v-if="!isAuthenticated"
        type="button"
        class="mt-3 flex w-full items-center gap-2 rounded-lg bg-hela-gold-100/70 px-3 py-2 text-left text-xs text-[#6d5622] hover:bg-hela-gold-100"
        @click="requestLogin('Log in to apply your offers and promotions.')"
      >
        <AppIcon name="gift" :size="15" class="shrink-0" />
        <span><b>Log in</b> to apply your personal offers and promotions.</span>
      </button>
    </template>
  </div>
</template>
