<script setup lang="ts">
import type { TableColumn } from '~/types/admin'
import { listReviews, removeReviewReply, replyToReview, type AdminReview } from '~/services/admin/reviewsApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'reviews.view' })
useHead({ title: 'Customer reviews' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const reviews = ref<AdminReview[]>([])
const loading = ref(true)
const replyFilter = ref<'all' | 'waiting' | 'replied'>('all')
const ratingFilter = ref(0)

const canReply = computed(() => auth.can('reviews.manage') && !auth.readOnly.value)

async function load() {
  loading.value = true
  try {
    reviews.value = await auth.call(listReviews)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() =>
  reviews.value.filter((r) =>
    (replyFilter.value === 'all' || (replyFilter.value === 'replied') === !!r.reply) && (!ratingFilter.value || r.rating === ratingFilter.value)),
)
const average = computed(() => (reviews.value.length ? reviews.value.reduce((s, r) => s + r.rating, 0) / reviews.value.length : 0))
const waiting = computed(() => reviews.value.filter((r) => !r.reply).length)
const low = computed(() => reviews.value.filter((r) => r.rating <= 2 && !r.reply).length)

const columns: TableColumn[] = [
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'productName', label: 'Product', sortable: true },
  { key: 'rating', label: 'Rating', sortable: true },
  { key: 'comment', label: 'Review' },
  { key: 'customerName', label: 'Customer', sortable: true },
  { key: 'branchName', label: 'Branch', sortable: true },
  { key: 'reply', label: 'Reply', value: (r: AdminReview) => r.reply?.text ?? '' },
]
const when = (iso: string) => new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })

// ------------------------------------------------------------------ reply
const active = ref<AdminReview | null>(null)
const text = ref('')
const saving = ref(false)

function openReply(r: AdminReview) {
  active.value = r
  text.value = r.reply?.text ?? ''
}

function applied(updated: AdminReview) {
  reviews.value = reviews.value.map((r) => (r.id === updated.id ? updated : r))
  active.value = null
}

async function saveReply() {
  if (!active.value) return
  const reviewId = active.value.id
  saving.value = true
  try {
    applied(await auth.call((t) => replyToReview(t, reviewId, text.value)))
    notify.ok('Reply posted — shoppers can see it under the review')
  } catch (e) {
    notify.error(e)
  } finally {
    saving.value = false
  }
}

async function removeReply() {
  if (!active.value) return
  const reviewId = active.value.id
  const { ok } = await confirm({ title: 'Remove this reply?', message: 'Shoppers will no longer see it under the review.', confirmLabel: 'Remove reply', tone: 'danger' })
  if (!ok) return
  saving.value = true
  try {
    applied(await auth.call((t) => removeReviewReply(t, reviewId)))
    notify.ok('Reply removed')
  } catch (e) {
    notify.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Customer reviews" description="What customers who received your products say about them. Your replies are public: shoppers see them under the review, signed with your supermarket’s name.">
      <button type="button" class="btn-ghost h-10" @click="load"><AppIcon name="refresh" :size="16" />Refresh</button>
    </AdminPageHeader>

    <div class="mb-4 grid gap-3 sm:grid-cols-3">
      <AdminStatCard label="Average rating" :value="reviews.length ? `${average.toFixed(1)} / 5` : '—'" :hint="`${reviews.length} review${reviews.length === 1 ? '' : 's'}`" icon="sparkle" tone="gold" />
      <AdminStatCard label="Waiting for a reply" :value="String(waiting)" icon="clipboard" />
      <AdminStatCard label="Low ratings without a reply" :value="String(low)" hint="1 or 2 stars" icon="alert" :tone="low ? 'red' : 'green'" />
    </div>

    <AdminDataTable :rows="rows" :columns="columns" row-key="id" :loading="loading" :page-size="15" search-placeholder="Search product, customer or review…" empty-text="No reviews match." :initial-sort="{ key: 'createdAt', dir: 'desc' }">
      <template #toolbar>
        <select v-model="replyFilter" class="field w-auto" aria-label="Reply status"><option value="all">All reviews</option><option value="waiting">Waiting for a reply</option><option value="replied">Replied</option></select>
        <select v-model.number="ratingFilter" class="field w-auto" aria-label="Rating"><option :value="0">All ratings</option><option v-for="n in [5, 4, 3, 2, 1]" :key="n" :value="n">{{ n }} star{{ n === 1 ? '' : 's' }}</option></select>
      </template>
      <template #cell-createdAt="{ row }"><span class="whitespace-nowrap text-xs text-muted">{{ when(row.createdAt) }}</span></template>
      <template #cell-productName="{ row }">
        <span class="font-semibold text-ink">{{ row.productName }}</span>
        <span v-if="!row.productReviewsEnabled" class="mt-0.5 block text-[0.7rem] font-semibold text-[#7A5600]" title="Reviews are turned off for this product, so shoppers don’t see this review.">Hidden: reviews off</span>
      </template>
      <template #cell-rating="{ row }"><StarRating :model-value="row.rating" :size="13" /></template>
      <template #cell-comment="{ row }"><p class="line-clamp-2 max-w-xs text-sm text-ink" :title="row.comment">{{ row.comment }}</p></template>
      <template #cell-customerName="{ row }"><span class="text-sm">{{ row.customerName }}</span><span class="block text-[0.7rem] text-muted">{{ row.orderNumber }}</span></template>
      <template #cell-reply="{ row }">
        <button v-if="canReply" type="button" class="text-xs font-bold whitespace-nowrap text-hela-green hover:underline" data-testid="review-reply" @click="openReply(row)">{{ row.reply ? 'Edit reply' : 'Reply' }}</button>
        <AdminBadge v-else :value="row.reply ? 'active' : 'pending'" :label="row.reply ? 'Replied' : 'No reply'" />
      </template>
    </AdminDataTable>

    <AdminModal :open="!!active" :title="active?.reply ? 'Edit your reply' : 'Reply to this review'" :description="active?.productName" @close="active = null">
      <div v-if="active" class="space-y-3">
        <p v-if="!active.productReviewsEnabled" class="rounded-xl bg-hela-gold-100 px-3 py-2 text-xs text-[#6d5622]">Reviews are turned off for this product, so shoppers won’t see this review or your reply until you turn them on in Products &amp; stock.</p>
        <div class="rounded-xl bg-hela-green-50/60 p-3">
          <div class="flex flex-wrap items-center gap-2">
            <StarRating :model-value="active.rating" :size="14" />
            <span class="text-xs font-bold text-ink">{{ active.customerName }}</span>
            <span class="text-xs text-muted">{{ when(active.createdAt) }} · {{ active.orderNumber }} · {{ active.branchName }}</span>
          </div>
          <p class="mt-1 text-sm whitespace-pre-line text-ink">{{ active.comment }}</p>
        </div>
        <label class="block">
          <span class="field-label">Your reply (public)</span>
          <textarea v-model="text" class="field min-h-28 resize-y" maxlength="1000" rows="4" placeholder="Thank them, or say what you’ll do about the problem." data-testid="review-reply-text" />
          <span class="mt-0.5 block text-right text-[0.65rem] text-muted">{{ text.length }}/1000</span>
        </label>
        <p v-if="active.reply" class="text-xs text-muted">Last replied by {{ active.reply.by }} on {{ when(active.reply.at) }}.</p>
        <div class="flex flex-wrap justify-between gap-2">
          <button v-if="active.reply" type="button" class="btn-ghost h-10 text-[#8A2E2E]" :disabled="saving" @click="removeReply"><AppIcon name="trash" :size="15" />Remove reply</button>
          <span v-else />
          <div class="flex gap-2">
            <button type="button" class="btn-ghost h-10" :disabled="saving" @click="active = null">Cancel</button>
            <button type="button" class="btn-primary h-10" :disabled="saving || text.trim().length < 2" data-testid="review-reply-save" @click="saveReply">{{ saving ? 'Posting…' : active.reply ? 'Update reply' : 'Post reply' }}</button>
          </div>
        </div>
      </div>
    </AdminModal>
  </div>
</template>
