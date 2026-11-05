<script setup lang="ts">
import type { Order } from '~/types'
import type { ProductReviewsDto, ReviewDto } from '~/services/apiTypes'
import { listProductReviews } from '~/services/reviewService'

/**
 * On a delivered order's bill: review what you bought, right here. The form stays on the bill rather than opening the
 * product, because the order may be from another supermarket than the one being shopped now (and switching
 * would change the catalogue and the cart).
 */
const props = defineProps<{ order: Order }>()

const { getAccessToken } = useAuth()
const openId = ref<string | null>(null)
const state = ref<ProductReviewsDto | null>(null)
const loading = ref(false)
const problem = ref('')
const savedHere = ref<Record<string, ReviewDto>>({})

const items = computed(() => props.order.lines.filter((l, i, all) => all.findIndex((x) => x.productId === l.productId) === i))

async function toggle(productId: string) {
  if (openId.value === productId) {
    openId.value = null
    return
  }
  openId.value = productId
  state.value = null
  problem.value = ''
  loading.value = true
  try {
    state.value = await listProductReviews(props.order.storeId!, productId, 1, await getAccessToken())
  } catch (e) {
    problem.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function saved(productId: string, review: ReviewDto) {
  savedHere.value = { ...savedHere.value, [productId]: review }
  openId.value = null
}
</script>

<template>
  <section class="mt-4 rounded-2xl bg-white p-4 ring-1 ring-line print:hidden" aria-label="Review what you bought" data-testid="order-reviews">
    <p class="font-bold text-ink">Review what you bought</p>
    <p class="mt-0.5 text-xs text-muted">Help other shoppers: tell them how these were.</p>
    <ul class="mt-2 divide-y divide-line">
      <li v-for="l in items" :key="l.productId" class="py-2">
        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-sm text-ink">{{ l.name }}</span>
          <span v-if="savedHere[l.productId]" class="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-hela-green">
            <StarRating :model-value="savedHere[l.productId]!.rating" :size="12" />Thanks!
          </span>
          <button v-else type="button" class="shrink-0 text-xs font-bold text-hela-green hover:underline" :aria-expanded="openId === l.productId" data-testid="order-review-toggle" @click="toggle(l.productId)">
            {{ openId === l.productId ? 'Close' : 'Review' }}
          </button>
        </div>
        <div v-if="openId === l.productId" class="mt-2">
          <div v-if="loading" class="h-24 animate-pulse rounded-xl bg-hela-green-50" aria-hidden="true" />
          <p v-else-if="problem" class="rounded-lg bg-[#FBEAEA] px-3 py-2 text-sm text-[#8A2E2E]" role="alert">{{ problem }}</p>
          <ProductReviewForm v-else-if="state?.canReview" :store-id="order.storeId!" :product-id="l.productId" :existing="state.mine" @saved="saved(l.productId, $event)" />
          <p v-else class="text-xs text-muted">{{ state?.cannotReviewReason === 'blocked' ? 'This account can’t write reviews at this supermarket.' : state?.reviewsEnabled === false ? 'The supermarket doesn’t take reviews for this product.' : 'This product can’t be reviewed right now.' }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>
