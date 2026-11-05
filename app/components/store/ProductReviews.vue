<script setup lang="ts">
import type { ProductReviewsDto, ReviewDto } from '~/services/apiTypes'
import { listProductReviews } from '~/services/reviewService'

/**
 * A product's customer reviews at the chosen supermarket: rating summary, the shopper's own review
 * (or the form to write one, if they've received this product) and everyone else's, with the store's replies.
 */
const props = defineProps<{ storeId: string; productId: string }>()

const { isAuthenticated, getAccessToken } = useAuth()
const { requestLogin } = useAuthDialog()
const data = ref<ProductReviewsDto | null>(null)
const others = ref<ReviewDto[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const failed = ref(false)
const editing = ref(false)

const summary = computed(() => data.value?.summary)
const mine = computed(() => data.value?.mine)
const hasMore = computed(() => !!data.value && data.value.page * data.value.pageSize < data.value.summary.count)

/** Everything except the shopper's own review, which is shown on its own at the top. */
const withoutMine = (list: ReviewDto[], me: ReviewDto | undefined) => list.filter((r) => r.id !== me?.id)

async function load() {
  loading.value = true
  failed.value = false
  try {
    const token = isAuthenticated.value ? await getAccessToken() : null
    const r = await listProductReviews(props.storeId, props.productId, 1, token)
    data.value = r
    others.value = withoutMine(r.reviews, r.mine)
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

async function more() {
  if (!data.value) return
  loadingMore.value = true
  try {
    const token = isAuthenticated.value ? await getAccessToken() : null
    const r = await listProductReviews(props.storeId, props.productId, data.value.page + 1, token)
    data.value = { ...r, reviews: [] }
    others.value = [...others.value, ...withoutMine(r.reviews, r.mine).filter((x) => !others.value.some((y) => y.id === x.id))]
  } catch {
    failed.value = true
  } finally {
    loadingMore.value = false
  }
}

function onSaved() {
  editing.value = false
  void load()
}

watch(() => [props.storeId, props.productId], () => {
  editing.value = false
  void load()
})
// Signing in or out changes what the shopper can do here.
watch(isAuthenticated, () => void load())
onMounted(load)

const date = (iso: string) => new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' }).format(new Date(iso))
const edited = (r: ReviewDto) => Date.parse(r.updatedAt) - Date.parse(r.createdAt) > 60000
const barWidth = (stars: number) => {
  const s = summary.value
  return s?.count ? `${((s.breakdown[stars - 1] ?? 0) / s.count) * 100}%` : '0%'
}
</script>

<template>
  <!-- The server has the last word: reviews may have been turned off since the catalogue loaded. -->
  <section v-if="data?.reviewsEnabled !== false" class="mt-6 border-t border-line pt-5" aria-label="Customer reviews" data-testid="product-reviews">
    <h3 class="text-base font-extrabold text-ink">Customer reviews</h3>

    <div v-if="loading && !data" class="mt-3 space-y-2" aria-hidden="true">
      <div v-for="i in 2" :key="i" class="h-16 animate-pulse rounded-xl bg-hela-green-50" />
    </div>
    <p v-else-if="failed && !data" class="mt-3 text-sm text-muted">
      Couldn’t load reviews. <button type="button" class="font-bold text-hela-green underline" @click="load">Try again</button>
    </p>

    <template v-else-if="data">
      <!-- Summary -->
      <div v-if="summary?.count" class="mt-3 flex items-center gap-4 rounded-2xl bg-white p-3 ring-1 ring-line">
        <div class="shrink-0 text-center">
          <p class="text-3xl font-extrabold tabular-nums text-ink">{{ summary.average.toFixed(1) }}</p>
          <StarRating :model-value="summary.average" :size="13" />
          <p class="mt-0.5 text-[0.7rem] text-muted">{{ summary.count }} review{{ summary.count === 1 ? '' : 's' }}</p>
        </div>
        <div class="min-w-0 flex-1 space-y-0.5" aria-hidden="true">
          <div v-for="stars in [5, 4, 3, 2, 1]" :key="stars" class="flex items-center gap-1.5 text-[0.65rem] text-muted">
            <span class="w-2 tabular-nums">{{ stars }}</span>
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-hela-green-50"><span class="block h-full rounded-full bg-[#E0A526]" :style="{ width: barWidth(stars) }" /></span>
            <span class="w-5 text-right tabular-nums">{{ summary.breakdown[stars - 1] }}</span>
          </div>
        </div>
      </div>
      <p v-else class="mt-2 text-sm text-muted">No reviews yet.</p>

      <!-- Writing a review -->
      <div class="mt-3">
        <div v-if="mine && !editing" class="rounded-2xl bg-hela-green-50/60 p-3" data-testid="my-review">
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs font-extrabold text-hela-green">Your review</p>
            <button type="button" class="text-xs font-bold text-hela-green hover:underline" data-testid="review-edit" @click="editing = true">Edit</button>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <StarRating :model-value="mine.rating" :size="14" />
            <span class="text-[0.7rem] text-muted">{{ date(mine.createdAt) }}<template v-if="edited(mine)"> · edited</template></span>
          </div>
          <p class="mt-1 text-sm whitespace-pre-line text-ink">{{ mine.comment }}</p>
          <div v-if="mine.reply" class="mt-2 rounded-xl bg-white p-2.5 ring-1 ring-line">
            <p class="text-xs font-bold text-ink">Reply from {{ mine.reply.by }} <span class="font-normal text-muted">· {{ date(mine.reply.at) }}</span></p>
            <p class="mt-0.5 text-sm whitespace-pre-line text-ink">{{ mine.reply.text }}</p>
          </div>
        </div>
        <div v-else-if="data.canReview && (editing || !mine)" class="rounded-2xl bg-white p-3 ring-1 ring-line">
          <p class="mb-2 text-sm font-bold text-ink">{{ mine ? 'Edit your review' : 'You bought this. How was it?' }}</p>
          <ProductReviewForm :store-id="storeId" :product-id="productId" :existing="mine" :cancellable="!!mine" @saved="onSaved" @cancel="editing = false" />
        </div>
        <p v-else-if="data.cannotReviewReason === 'sign_in'" class="rounded-xl bg-white px-3 py-2 text-xs text-muted ring-1 ring-line">
          Bought this? <button type="button" class="font-bold text-hela-green underline" @click="requestLogin('Log in to review products you’ve received.')">Log in</button> to write a review.
        </p>
        <p v-else-if="data.cannotReviewReason === 'not_received'" class="rounded-xl bg-white px-3 py-2 text-xs text-muted ring-1 ring-line">You can review this product once your order has been delivered.</p>
        <p v-else-if="data.cannotReviewReason === 'blocked'" class="rounded-xl bg-white px-3 py-2 text-xs text-muted ring-1 ring-line">This account can’t write reviews at this supermarket.</p>
        <p v-else class="rounded-xl bg-white px-3 py-2 text-xs text-muted ring-1 ring-line">Only customers who have received this product can review it.</p>
      </div>

      <!-- Everyone's reviews -->
      <ul v-if="others.length" class="mt-3 divide-y divide-line" data-testid="review-list">
        <li v-for="r in others" :key="r.id" class="py-3">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <StarRating :model-value="r.rating" :size="13" />
            <span class="text-xs font-bold text-ink">{{ r.author }}</span>
            <span class="inline-flex items-center gap-0.5 text-[0.65rem] font-semibold text-hela-green"><AppIcon name="check" :size="11" :stroke-width="3" />Verified purchase</span>
          </div>
          <p class="mt-0.5 text-[0.7rem] text-muted">{{ date(r.createdAt) }}<template v-if="edited(r)"> · edited</template></p>
          <p class="mt-1 text-sm whitespace-pre-line text-ink">{{ r.comment }}</p>
          <div v-if="r.reply" class="mt-2 rounded-xl bg-hela-green-50/60 p-2.5">
            <p class="text-xs font-bold text-ink">Reply from {{ r.reply.by }} <span class="font-normal text-muted">· {{ date(r.reply.at) }}</span></p>
            <p class="mt-0.5 text-sm whitespace-pre-line text-ink">{{ r.reply.text }}</p>
          </div>
        </li>
      </ul>
      <button v-if="hasMore" type="button" class="btn-ghost mt-2 h-9 w-full text-xs" :disabled="loadingMore" @click="more">{{ loadingMore ? 'Loading…' : 'Show more reviews' }}</button>
    </template>
  </section>
</template>
