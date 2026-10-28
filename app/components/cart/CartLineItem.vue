<script setup lang="ts">
import type { CartLineView } from '~/types'

const props = defineProps<{ line: CartLineView }>()
const { setQuantity, remove } = useCart()
const { show } = useToasts()

function onRemove() {
  remove(props.line.productId)
  show(`${props.line.product.name} removed from cart`)
}
</script>

<template>
  <li class="flex gap-3 py-4">
    <ProductThumb :product="line.product" class="size-18 shrink-0" />
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-bold text-ink">{{ line.product.name }}</p>
          <p class="text-xs text-muted">{{ line.product.size }} · {{ formatLKR(line.product.priceCents) }} / {{ line.product.unit }}</p>
        </div>
        <button
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-[#fbeaea] hover:text-[#8A2E2E]"
          :aria-label="`Remove ${line.product.name} from cart`"
          @click="onRemove"
        >
          <AppIcon name="trash" :size="16" />
        </button>
      </div>
      <div class="flex items-center justify-between gap-2">
        <QuantityStepper
          size="sm"
          :label="line.product.name"
          :model-value="line.quantity"
          @update:model-value="setQuantity(line.productId, $event)"
        />
        <p class="text-sm font-bold tabular-nums text-ink">{{ formatLKR(line.lineTotalCents) }}</p>
      </div>
    </div>
  </li>
</template>
