<script setup lang="ts">
import { LEGAL, type LegalKey } from '~/data/legal'

/**
 * "I agree" to the Terms of Order and Privacy Policy, before placing an order or creating an account.
 * The documents stay collapsed; ticking a box opens that document, and it's ticked once the customer has read it
 * to the end and pressed "I agree". `attention` highlights what's still missing (after a blocked attempt).
 */
const agreed = defineModel<Record<LegalKey, boolean>>({ required: true })
const { context, cod = false, attention = false } = defineProps<{ context: 'order' | 'register'; cod?: boolean; attention?: boolean }>()
const { read } = useLegal()

const ROWS: { key: LegalKey; icon: 'clipboard' | 'shield' }[] = [
  { key: 'terms', icon: 'clipboard' },
  { key: 'privacy', icon: 'shield' },
]

async function toggle(key: LegalKey) {
  if (agreed.value[key]) {
    agreed.value = { ...agreed.value, [key]: false }
    return
  }
  if (await read(key, { acceptable: true })) agreed.value = { ...agreed.value, [key]: true }
}
async function view(key: LegalKey) {
  if (await read(key, { acceptable: !agreed.value[key] })) agreed.value = { ...agreed.value, [key]: true }
}
const allAgreed = computed(() => agreed.value.terms && agreed.value.privacy)
</script>

<template>
  <section
    class="rounded-2xl bg-white p-4 ring-1 transition"
    :class="attention && !allAgreed ? 'ring-2 ring-[#C0504D] shake' : 'ring-line'"
    :aria-label="context === 'order' ? 'Before you place your order' : 'Terms and privacy'"
    data-testid="legal-consent"
  >
    <template v-if="context === 'order'">
      <h3 class="flex items-center gap-2 text-sm font-extrabold text-ink"><AppIcon name="info" :size="16" class="text-hela-green" />Before you place your order</h3>
      <ul class="mt-2.5 space-y-2 text-xs text-[#3d4245]">
        <li class="flex gap-2.5"><AppIcon name="package" :size="15" class="mt-px shrink-0 text-hela-green" /><span>HelaMart isn’t responsible for <b>damaged, broken, spoiled or missing items</b>. The supermarket handles item claims — check your order at hand-over.</span></li>
        <li class="flex gap-2.5 rounded-lg" :class="cod ? '-mx-1.5 bg-hela-gold-100 px-1.5 py-1 ring-1 ring-hela-gold' : ''" data-testid="consent-cod">
          <AppIcon name="cash" :size="15" class="mt-px shrink-0 text-hela-green" /><span>HelaMart takes <b>no responsibility for cash on delivery issues</b> (damage, breakage, loss or payment disputes). These are settled with the supermarket.</span>
        </li>
        <li class="flex gap-2.5"><AppIcon name="shield" :size="15" class="mt-px shrink-0 text-hela-green" /><span>Your name, mobile, address and order are <b>shared with the supermarket</b> only to fulfil this order. We never sell your data.</span></li>
      </ul>
      <div class="my-3.5 h-px bg-line" />
    </template>

    <div class="space-y-2">
      <div
        v-for="r in ROWS"
        :key="r.key"
        class="flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition"
        :class="agreed[r.key] ? 'bg-hela-green-50 ring-hela-green/30' : attention ? 'bg-[#FBEAEA]/60 ring-[#C0504D]/40' : 'bg-cream/60 ring-line'"
      >
        <button
          type="button"
          role="checkbox"
          :aria-checked="agreed[r.key]"
          class="grid size-6 shrink-0 place-items-center rounded-md ring-2 transition"
          :class="agreed[r.key] ? 'bg-hela-green text-white ring-hela-green' : 'bg-white ring-line hover:ring-hela-green'"
          :aria-label="`I agree to the ${LEGAL[r.key].title}`"
          :data-testid="`consent-${r.key}`"
          @click="toggle(r.key)"
        >
          <AppIcon v-if="agreed[r.key]" name="check" :size="14" :stroke-width="3.5" />
        </button>
        <p class="min-w-0 flex-1 text-sm text-ink">
          I have read and agree to the
          <button type="button" class="font-bold text-hela-green underline decoration-hela-green/40 underline-offset-2 hover:decoration-hela-green" @click="view(r.key)">{{ LEGAL[r.key].title }}</button>
          <span class="block text-[0.7rem] text-muted">Version {{ LEGAL[r.key].version }} · {{ agreed[r.key] ? 'Agreed' : 'Tap to read and agree' }}</span>
        </p>
        <AppIcon :name="r.icon" :size="18" class="shrink-0" :class="agreed[r.key] ? 'text-hela-green' : 'text-muted'" />
      </div>
    </div>
    <p v-if="attention && !allAgreed" class="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-[#8A2E2E]" role="alert">
      <AppIcon name="alert" :size="14" />{{ context === 'order' ? 'Please read and accept both to place your order.' : 'Please read and accept both to create your account.' }}
    </p>
  </section>
</template>

<style scoped>
.shake {
  animation: shake 0.35s ease-in-out;
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}
</style>
