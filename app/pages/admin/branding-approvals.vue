<script setup lang="ts">
import { listBrandingRequests, reviewBrandingRequest, type BrandingReviewItem } from '~/services/admin/brandingApi'
import { premiumItemsUsed } from '~/lib/branding'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'platform', permission: 'tenants.view' })
useHead({ title: 'Branding approvals' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const items = ref<BrandingReviewItem[]>([])
const loading = ref(true)
const tab = ref<'pending' | 'all'>('pending')
const canReview = computed(() => auth.can('tenants.review'))
const busy = ref<string | null>(null)

async function load() {
  loading.value = true
  try {
    items.value = await auth.call(listBrandingRequests)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const pendingCount = computed(() => items.value.filter((i) => i.status === 'pending').length)
const shown = computed(() => (tab.value === 'pending' ? items.value.filter((i) => i.status === 'pending') : items.value))

async function approve(r: BrandingReviewItem) {
  const dropped = r.plan === 'premium' ? [] : premiumItemsUsed(r.profile)
  const ok = await confirm({
    title: `Publish ${r.supermarketName}’s branding?`,
    message: `Shoppers will see it inside the HelaMart store straight away.${dropped.length ? ` Not published (Standard plan): ${dropped.join(', ')}.` : ''}`,
    confirmLabel: 'Approve & publish',
  })
  if (!ok.ok) return
  busy.value = r.id
  try {
    await auth.call((t) => reviewBrandingRequest(t, r.id, 'approve'), 'Publishing supermarket branding needs your password confirmed.')
    notify.ok(`${r.supermarketName}: branding is live`)
    await load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = null
  }
}

async function reject(r: BrandingReviewItem) {
  const res = await confirm({
    title: `Send ${r.supermarketName}’s request back?`,
    message: 'The supermarket sees your reason and can submit a corrected request. Their live branding is unchanged.',
    confirmLabel: 'Reject request',
    tone: 'danger',
    reasonLabel: 'Reason shown to the supermarket',
  })
  if (!res.ok) return
  busy.value = r.id
  try {
    await auth.call((t) => reviewBrandingRequest(t, r.id, 'reject', res.reason), 'Rejecting needs your password confirmed.')
    notify.ok('Request rejected — the supermarket has been told why')
    await load()
  } catch (e) {
    notify.error(e)
  } finally {
    busy.value = null
  }
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' }) : '')
</script>

<template>
  <div>
    <AdminPageHeader title="Branding approvals" description="Supermarkets’ logo, banner, colour and slogan changes. Nothing reaches shoppers until it’s approved here. HelaMart’s own look is never affected." />

    <div class="mb-4 flex gap-2" role="tablist">
      <button type="button" role="tab" class="chip ring-1" :class="tab === 'pending' ? 'bg-hela-green text-white ring-hela-green' : 'bg-white ring-line'" :aria-selected="tab === 'pending'" @click="tab = 'pending'">Waiting ({{ pendingCount }})</button>
      <button type="button" role="tab" class="chip ring-1" :class="tab === 'all' ? 'bg-hela-green text-white ring-hela-green' : 'bg-white ring-line'" :aria-selected="tab === 'all'" @click="tab = 'all'">All requests</button>
    </div>

    <p v-if="loading" class="text-sm text-muted">Loading requests…</p>
    <p v-else-if="!shown.length" class="card p-8 text-center text-sm text-muted">{{ tab === 'pending' ? 'No branding requests are waiting. 🎉' : 'No branding requests yet.' }}</p>

    <div class="space-y-4">
      <article v-for="r in shown" :key="r.id" class="card p-5" :data-testid="`request-${r.tenantId}`">
        <header class="flex flex-wrap items-start gap-3">
          <StoreBadge :name="r.supermarketName" :branding="r.profile" size="size-11" />
          <div class="min-w-0 flex-1">
            <h2 class="font-bold text-ink">{{ r.supermarketName }}</h2>
            <p class="text-xs text-muted">Submitted {{ when(r.submittedAt) }} by {{ r.submittedBy }}</p>
          </div>
          <span class="chip" :class="r.plan === 'premium' ? 'bg-hela-gold-100 text-[#6d5622]' : 'bg-cream text-ink'">{{ r.plan === 'premium' ? 'Premium plan' : 'Standard plan' }}</span>
          <AdminBadge :value="r.status" />
        </header>

        <div class="mt-4 grid gap-4 lg:grid-cols-[1fr_1.6fr]">
          <div class="text-sm">
            <p class="field-label">Requested changes</p>
            <ul class="list-disc space-y-0.5 pl-5 text-ink">
              <li v-for="c in r.changes" :key="c">{{ c }}</li>
            </ul>
            <p v-if="r.plan !== 'premium' && premiumItemsUsed(r.profile).length" class="mt-2 rounded-lg bg-[#FFF4D6] p-2 text-xs text-[#7A5600]">
              Now on Standard — these won’t be published: {{ premiumItemsUsed(r.profile).join(', ') }}
            </p>
            <p v-if="r.reviewedBy" class="mt-3 text-xs text-muted">{{ r.status === 'withdrawn' ? 'Withdrawn' : 'Decided' }} by {{ r.reviewedBy }} · {{ when(r.reviewedAt) }}</p>
            <p v-if="r.reviewNote" class="mt-1 rounded-lg bg-cream p-2 text-xs text-ink">{{ r.reviewNote }}</p>
            <div v-if="r.status === 'pending' && canReview" class="mt-4 flex flex-wrap gap-2">
              <button type="button" class="btn-primary h-9" :disabled="busy === r.id" @click="approve(r)"><AppIcon name="check" :size="15" />Approve &amp; publish</button>
              <button type="button" class="btn-ghost h-9 text-[#8A2E2E] ring-1 ring-line" :disabled="busy === r.id" @click="reject(r)">Reject</button>
            </div>
            <p v-else-if="r.status === 'pending'" class="mt-4 text-xs text-muted">You can view requests; approving needs the “Review applications” permission.</p>
          </div>
          <BrandingCompare :name="r.supermarketName" :before="r.current" :after="r.profile" :plan="r.plan" />
        </div>
      </article>
    </div>
  </div>
</template>
