<script setup lang="ts">
import type { ReviewDto } from '~/services/apiTypes'
import { saveProductReview } from '~/services/reviewService'

/** Write or edit the shopper's own review of a product. */
const props = defineProps<{ storeId: string; productId: string; existing?: ReviewDto | null; cancellable?: boolean }>()
const emit = defineEmits<{ saved: [review: ReviewDto]; cancel: [] }>()

const MAX = 1000
const { authorized } = useAuth()
const { show } = useToasts()
const rating = ref(props.existing?.rating ?? 0)
const comment = ref(props.existing?.comment ?? '')
const saving = ref(false)
const error = ref('')
watch([rating, comment], () => (error.value = ''))

async function submit() {
  error.value = ''
  if (!rating.value) {
    error.value = 'Choose how many stars you’d give it.'
    return
  }
  if (comment.value.trim().length < 3) {
    error.value = 'Write a few words about this product.'
    return
  }
  saving.value = true
  try {
    const saved = await authorized((t) => saveProductReview(t, props.storeId, props.productId, { rating: rating.value, comment: comment.value.trim() }))
    show(props.existing ? 'Your review was updated.' : 'Thanks for your review!', 'success')
    emit('saved', saved)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form class="space-y-3" data-testid="review-form" @submit.prevent="submit">
    <div>
      <p class="field-label">Your rating</p>
      <StarRating v-model="rating" editable :size="26" label="Your rating" />
    </div>
    <label class="block">
      <span class="field-label">Your review</span>
      <textarea v-model="comment" class="field min-h-24 resize-y" :maxlength="MAX" rows="3" placeholder="What did you like or dislike? How was the quality?" data-testid="review-comment" />
      <span class="mt-0.5 block text-right text-[0.65rem] text-muted">{{ comment.length }}/{{ MAX }}</span>
    </label>
    <p v-if="error" class="rounded-lg bg-[#FBEAEA] px-3 py-2 text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
    <div class="flex gap-2">
      <button type="submit" class="btn-primary h-10 flex-1" :disabled="saving" data-testid="review-submit">{{ saving ? 'Saving…' : existing ? 'Update review' : 'Post review' }}</button>
      <button v-if="cancellable" type="button" class="btn-ghost h-10" :disabled="saving" @click="emit('cancel')">Cancel</button>
    </div>
    <p class="text-[0.7rem] text-muted">Your first name and last initial are shown with your review. The supermarket may reply publicly.</p>
  </form>
</template>
