<script setup lang="ts">
import type { BrandingProfile } from '~/types/admin'
import { getBranding, submitBrandingRequest, uploadBrandImage, withdrawBrandingRequest, type BrandingState } from '~/services/admin/brandingApi'
import { MAX_PROMO_BANNERS, PREMIUM_FEATURES, SLOGAN_MAX, WELCOME_MAX, describeChanges, premiumItemsUsed } from '~/lib/branding'
import { ImageRejected, prepareBrandImage, type PreparedImage } from '~/utils/imageProcessing'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'settings.manage' })
useHead({ title: 'Store branding' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()

const state = ref<BrandingState | null>(null)
const saving = ref(false)
const error = ref('')
const premium = computed(() => state.value?.plan === 'premium')
const locked = computed(() => !state.value || state.value.readOnly || auth.readOnly.value)

// ---- draft
interface ImgField {
  ref: string | null
  pending: PreparedImage | null
  url: string | null
  busy: boolean
  error: string
}
const blank = (): ImgField => ({ ref: null, pending: null, url: null, busy: false, error: '' })
const logo = reactive(blank())
const banner = reactive(blank())
const promos = ref<ImgField[]>([])
const removeLogoBg = ref(true)
const f = reactive({ primaryColor: '#174d38', slogan: '', useAccent: false, accentColor: '#e1c987', welcomeMessage: '', logoOnFixtures: false })

async function setImg(field: ImgField, ref_: string | undefined) {
  if (field.pending) URL.revokeObjectURL(field.pending.url)
  Object.assign(field, { ref: ref_ ?? null, pending: null, url: null, busy: false, error: '' })
  if (ref_) {
    const { resolveImageUrl } = await import('~/services/mock/mediaStore')
    const url = await resolveImageUrl(ref_)
    if (field.ref === ref_ && !field.pending) field.url = url
  }
}

async function loadDraft(p: BrandingProfile) {
  Object.assign(f, {
    primaryColor: p.primaryColor,
    slogan: p.slogan,
    useAccent: !!p.accentColor,
    accentColor: p.accentColor ?? '#e1c987',
    welcomeMessage: p.welcomeMessage ?? '',
    logoOnFixtures: p.logoOnFixtures,
  })
  promos.value.forEach((x) => x.pending && URL.revokeObjectURL(x.pending.url))
  promos.value = p.promoBanners.map(() => reactive(blank()))
  await Promise.all([setImg(logo, p.logo), setImg(banner, p.banner), ...p.promoBanners.map((r, i) => setImg(promos.value[i]!, r))])
}

async function load() {
  try {
    state.value = await auth.call(getBranding)
    await loadDraft(state.value.pending?.profile ?? state.value.live)
  } catch (e) {
    notify.error(e)
  }
}
onMounted(load)

/** The draft as a profile (unsaved uploads appear with a placeholder ref so changes are detected). */
const draft = computed<BrandingProfile>(() => ({
  logo: logo.pending ? 'pending:logo' : logo.ref ?? undefined,
  banner: banner.pending ? 'pending:banner' : banner.ref ?? undefined,
  primaryColor: f.primaryColor.toLowerCase(),
  slogan: f.slogan.trim(),
  accentColor: f.useAccent ? f.accentColor.toLowerCase() : undefined,
  promoBanners: promos.value.map((p, i) => (p.pending ? `pending:promo${i}` : p.ref)).filter((x): x is string => !!x),
  welcomeMessage: f.welcomeMessage.trim() || undefined,
  logoOnFixtures: f.logoOnFixtures,
}))
const changes = computed(() => (state.value ? describeChanges(state.value.live, draft.value) : []))
const premiumUsed = computed(() => premiumItemsUsed(draft.value))
const blockedByPlan = computed(() => !premium.value && premiumUsed.value.length > 0)

const preview = useBrandPreview(() =>
  state.value
    ? { name: state.value.supermarketName, profile: { ...draft.value, logo: undefined, banner: undefined }, logo: logo.pending?.url ?? logo.ref, banner: banner.pending?.url ?? banner.ref }
    : null,
)
const promoPreview = computed(() => promos.value.map((p) => p.pending?.url ?? p.url).filter(Boolean) as string[])

// ---- uploads
async function choose(field: ImgField, kind: 'logo' | 'banner', e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  field.busy = true
  field.error = ''
  try {
    const img = await prepareBrandImage(file, kind, { removeBackground: kind === 'logo' && removeLogoBg.value })
    if (field.pending) URL.revokeObjectURL(field.pending.url)
    field.pending = img
    field.url = img.url
  } catch (err) {
    field.error = err instanceof ImageRejected ? err.message : 'That file could not be read as an image.'
  } finally {
    field.busy = false
  }
}
function clearImg(field: ImgField) {
  if (field.pending) URL.revokeObjectURL(field.pending.url)
  Object.assign(field, blank())
}
function addPromo() {
  if (promos.value.length < MAX_PROMO_BANNERS) promos.value.push(reactive(blank()))
}
function removePromo(i: number) {
  clearImg(promos.value[i]!)
  promos.value.splice(i, 1)
}

async function upload(field: ImgField, kind: 'logo' | 'banner') {
  if (!field.pending) return
  const { blob, width, height } = field.pending
  field.ref = await auth.call((t) => uploadBrandImage(t, blob, { width, height }, kind))
  URL.revokeObjectURL(field.pending.url)
  field.pending = null
  const { resolveImageUrl } = await import('~/services/mock/mediaStore')
  field.url = await resolveImageUrl(field.ref)
}

async function submit() {
  error.value = ''
  if ([logo, banner, ...promos.value].some((x) => x.busy)) return (error.value = 'Wait for the images to finish processing.')
  if (blockedByPlan.value) return (error.value = 'Your plan is Standard — remove the Premium items before submitting.')
  saving.value = true
  try {
    await upload(logo, 'logo')
    await upload(banner, 'banner')
    for (const p of promos.value) await upload(p, 'banner')
    const profile = { ...draft.value }
    await auth.call((t) => submitBrandingRequest(t, profile), 'Submitting branding for approval needs your password confirmed.')
    notify.ok('Sent to HelaMart for approval — shoppers will see it once approved')
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function withdraw() {
  const id = state.value?.pending?.id
  if (!id) return
  const r = await confirm({ title: 'Withdraw this request?', message: 'HelaMart will no longer review it. Your live branding stays as it is.', confirmLabel: 'Withdraw request', tone: 'danger' })
  if (!r.ok) return
  try {
    await auth.call((t) => withdrawBrandingRequest(t, id))
    notify.ok('Request withdrawn')
    await load()
  } catch (e) {
    notify.error(e)
  }
}

async function resetToLive() {
  if (state.value) await loadDraft(state.value.live)
}

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-LK', { dateStyle: 'medium', timeStyle: 'short' }) : '')
const showDecision = computed(() => {
  const d = state.value?.lastDecision
  return d && !state.value?.pending && (d.status === 'rejected' || Date.now() - Date.parse(d.reviewedAt ?? '') < 7 * 864e5) ? d : null
})
</script>

<template>
  <div>
    <AdminPageHeader title="Store branding" description="How your supermarket looks inside the HelaMart store — racks, checkout area, banners and signs. Changes go live only after HelaMart approves them." />

    <p v-if="!state" class="text-sm text-muted">Loading branding…</p>
    <template v-else>
      <!-- Status -->
      <div v-if="state.pending" class="mb-4 flex flex-wrap items-start gap-3 rounded-2xl bg-[#FFF4D6] p-4 text-sm text-[#5c4300]" role="status" data-testid="branding-pending">
        <AppIcon name="history" :size="18" class="mt-0.5 shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="font-bold">Waiting for HelaMart approval</p>
          <p class="text-xs">Submitted {{ when(state.pending.submittedAt) }} by {{ state.pending.submittedBy }}. Shoppers still see your current live branding.</p>
          <ul class="mt-1.5 list-disc pl-5 text-xs">
            <li v-for="c in state.pending.changes" :key="c">{{ c }}</li>
          </ul>
        </div>
        <button v-if="!locked" type="button" class="btn-ghost h-9 bg-white/70" @click="withdraw">Withdraw</button>
      </div>
      <div v-else-if="showDecision?.status === 'rejected'" class="mb-4 flex gap-3 rounded-2xl bg-[#FBEAEA] p-4 text-sm text-[#8A2E2E]" role="status">
        <AppIcon name="alert" :size="18" class="mt-0.5 shrink-0" />
        <div>
          <p class="font-bold">HelaMart didn’t approve your last request ({{ when(showDecision.reviewedAt) }})</p>
          <p class="text-xs">Reason: {{ showDecision.reviewNote }}</p>
        </div>
      </div>
      <div v-else-if="showDecision?.status === 'approved'" class="mb-4 flex gap-3 rounded-2xl bg-hela-green-50 p-4 text-sm text-hela-green" role="status">
        <AppIcon name="check" :size="18" class="mt-0.5 shrink-0" />
        <div>
          <p class="font-bold">Approved and live since {{ when(showDecision.reviewedAt) }}</p>
          <p v-if="showDecision.reviewNote" class="text-xs">Note from HelaMart: {{ showDecision.reviewNote }}</p>
        </div>
      </div>
      <p v-if="state.readOnly" class="mb-4 rounded-2xl bg-[#FBEAEA] p-4 text-sm text-[#8A2E2E]">Your supermarket is restricted, so branding can’t be changed right now.</p>

      <div class="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <form class="space-y-4" @submit.prevent="submit">
          <!-- Standard -->
          <section class="card space-y-4 p-5">
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-bold text-ink">Brand basics</h2>
              <span class="chip bg-hela-green-50 text-hela-green">Standard &amp; Premium</span>
            </div>

            <div class="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <div class="relative grid size-36 place-items-center overflow-hidden rounded-xl ring-1 ring-line" style="background: repeating-conic-gradient(#eeeae0 0 25%, #fff 0 50%) 0 0 / 16px 16px">
                <img v-if="logo.url" :src="logo.url" alt="Logo preview" class="absolute inset-0 size-full object-contain p-3" data-testid="logo-preview">
                <span v-else class="px-3 text-center text-xs text-muted">No logo — your initials are shown</span>
              </div>
              <div class="space-y-2 text-sm">
                <p class="field-label mb-0">Logo</p>
                <div class="flex flex-wrap gap-2">
                  <label class="btn-ghost h-9 cursor-pointer ring-1 ring-line" :class="{ 'pointer-events-none opacity-50': locked || logo.busy }">
                    <AppIcon name="plus" :size="14" />{{ logo.url ? 'Replace logo' : 'Upload logo' }}
                    <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" data-testid="logo-input" :disabled="locked" @change="choose(logo, 'logo', $event)">
                  </label>
                  <button v-if="logo.url" type="button" class="btn-ghost h-9 text-[#8A2E2E]" :disabled="locked" @click="clearImg(logo)">Remove</button>
                </div>
                <label class="flex items-center gap-2 text-xs"><input v-model="removeLogoBg" type="checkbox" class="size-4 accent-hela-green"> Remove plain white background</label>
                <p v-if="logo.busy" class="text-xs text-muted">Processing…</p>
                <p v-else-if="logo.error" class="text-xs text-[#8A2E2E]" role="alert">{{ logo.error }}</p>
                <p class="text-xs text-muted">PNG with a transparent background works best. Square or wide, at least 200 px.</p>
              </div>
            </div>

            <div class="space-y-2 text-sm">
              <p class="field-label mb-0">Main banner (1)</p>
              <div class="relative aspect-[3/1] overflow-hidden rounded-xl bg-cream ring-1 ring-line">
                <img v-if="banner.url" :src="banner.url" alt="Banner preview" class="absolute inset-0 size-full object-cover" data-testid="banner-preview">
                <span v-else class="absolute inset-0 grid place-items-center px-4 text-center text-xs text-muted">No banner — a banner is generated from your name, slogan and theme colour</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <label class="btn-ghost h-9 cursor-pointer ring-1 ring-line" :class="{ 'pointer-events-none opacity-50': locked || banner.busy }">
                  <AppIcon name="plus" :size="14" />{{ banner.url ? 'Replace banner' : 'Upload banner' }}
                  <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" data-testid="banner-input" :disabled="locked" @change="choose(banner, 'banner', $event)">
                </label>
                <button v-if="banner.url" type="button" class="btn-ghost h-9 text-[#8A2E2E]" :disabled="locked" @click="clearImg(banner)">Remove</button>
              </div>
              <p v-if="banner.busy" class="text-xs text-muted">Processing…</p>
              <p v-else-if="banner.error" class="text-xs text-[#8A2E2E]" role="alert">{{ banner.error }}</p>
              <p class="text-xs text-muted">Wide image (3:1, e.g. 1500 × 500). It’s cropped around the centre. Hung inside the entrance.</p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="field-label">Main theme colour</span>
                <span class="flex items-center gap-2">
                  <input v-model="f.primaryColor" type="color" class="h-10 w-14 rounded border-0" :disabled="locked" aria-label="Main theme colour">
                  <input v-model="f.primaryColor" class="field font-mono" maxlength="7" :disabled="locked" aria-label="Theme colour hex">
                </span>
                <span class="mt-1 block text-xs text-muted">Used on racks, checkout counters, wall trims and your signs.</span>
              </label>
              <label class="block">
                <span class="field-label">Slogan</span>
                <input v-model="f.slogan" class="field" :maxlength="SLOGAN_MAX" placeholder="e.g. Fresh from Lanka, every day" :disabled="locked" data-testid="slogan">
                <span class="mt-1 block text-right text-xs text-muted">{{ f.slogan.length }}/{{ SLOGAN_MAX }}</span>
              </label>
            </div>
          </section>

          <!-- Premium -->
          <section class="card relative space-y-4 p-5" :aria-disabled="!premium">
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-bold text-ink">More customisation</h2>
              <span class="chip bg-hela-gold-100 text-[#6d5622]"><AppIcon name="sparkle" :size="13" />Premium</span>
            </div>
            <div v-if="!premium" class="rounded-xl bg-cream p-4 text-sm">
              <p class="flex items-center gap-2 font-semibold text-ink"><AppIcon name="lock" :size="15" />Your supermarket is on the Standard plan</p>
              <p class="mt-1 text-xs text-muted">Standard includes 1 logo, 1 banner, a main theme colour and a slogan. Premium also unlocks:</p>
              <ul class="mt-2 grid gap-1 text-xs text-ink sm:grid-cols-2">
                <li v-for="p in PREMIUM_FEATURES" :key="p.key" class="flex items-center gap-1.5"><AppIcon name="check" :size="13" class="text-hela-green" />{{ p.label }}</li>
              </ul>
              <p class="mt-2 text-xs text-muted">To upgrade, contact HelaMart partner support.</p>
            </div>
            <fieldset :disabled="!premium || locked" class="space-y-4" :class="{ 'opacity-50': !premium }">
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="flex items-center gap-2 text-sm font-semibold text-ink"><input v-model="f.useAccent" type="checkbox" class="size-4 accent-hela-green"> Accent colour</label>
                  <span v-if="f.useAccent" class="mt-2 flex items-center gap-2">
                    <input v-model="f.accentColor" type="color" class="h-10 w-14 rounded border-0" aria-label="Accent colour">
                    <input v-model="f.accentColor" class="field font-mono" maxlength="7" aria-label="Accent colour hex">
                  </span>
                  <span class="mt-1 block text-xs text-muted">Counter tops, trims and stripes. Without it, a light tint of your theme colour is used.</span>
                </div>
                <label class="flex items-start gap-2 text-sm">
                  <input v-model="f.logoOnFixtures" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
                  <span><b class="text-ink">Logo on every aisle end-cap</b><span class="block text-xs text-muted">Your logo plate on both ends of each rack.</span></span>
                </label>
              </div>
              <label class="block">
                <span class="field-label">Welcome message for shoppers</span>
                <textarea v-model="f.welcomeMessage" rows="2" :maxlength="WELCOME_MAX" class="field h-auto py-2" placeholder="e.g. Ayubowan! Fresh produce arrives every morning." />
                <span class="mt-1 block text-right text-xs text-muted">{{ f.welcomeMessage.length }}/{{ WELCOME_MAX }}</span>
              </label>
              <div class="space-y-2">
                <p class="field-label mb-0">Promotional wall banners ({{ promos.length }}/{{ MAX_PROMO_BANNERS }})</p>
                <div v-for="(p, i) in promos" :key="i" class="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-line">
                  <div class="relative aspect-[3/1] w-36 shrink-0 overflow-hidden rounded-lg bg-cream">
                    <img v-if="p.url" :src="p.url" :alt="`Promotional banner ${i + 1}`" class="absolute inset-0 size-full object-cover">
                  </div>
                  <div class="min-w-0 flex-1 text-xs">
                    <label class="btn-ghost h-8 cursor-pointer px-2.5 ring-1 ring-line">
                      {{ p.url ? 'Replace' : 'Choose image' }}
                      <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="choose(p, 'banner', $event)">
                    </label>
                    <p v-if="p.busy" class="mt-1 text-muted">Processing…</p>
                    <p v-else-if="p.error" class="mt-1 text-[#8A2E2E]" role="alert">{{ p.error }}</p>
                  </div>
                  <button type="button" class="btn-ghost h-8 px-2 text-[#8A2E2E]" :aria-label="`Remove promotional banner ${i + 1}`" @click="removePromo(i)"><AppIcon name="trash" :size="14" /></button>
                </div>
                <button v-if="promos.length < MAX_PROMO_BANNERS" type="button" class="btn-ghost h-9 ring-1 ring-line" @click="addPromo"><AppIcon name="plus" :size="14" />Add promotional banner</button>
                <p class="text-xs text-muted">Hung on the side walls along the aisles. Wide 3:1 images.</p>
              </div>
            </fieldset>
          </section>

          <section class="card space-y-3 p-5">
            <h2 class="font-bold text-ink">Submit for approval</h2>
            <ul v-if="changes.length" class="list-disc space-y-0.5 pl-5 text-sm text-ink" data-testid="draft-changes">
              <li v-for="c in changes" :key="c">{{ c }}</li>
            </ul>
            <p v-else class="text-sm text-muted">No changes from your live branding yet.</p>
            <p v-if="blockedByPlan" class="rounded-lg bg-[#FBEAEA] p-2.5 text-xs text-[#8A2E2E]">Premium items in this draft: {{ premiumUsed.join(', ') }}. Remove them or upgrade.</p>
            <p class="text-xs text-muted">HelaMart checks that images are your own, appropriate and readable. HelaMart’s own look never changes — only your supermarket’s space inside the store.</p>
            <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="btn-primary h-10" :disabled="locked || saving || !changes.length || blockedByPlan">{{ saving ? 'Submitting…' : state.pending ? 'Replace pending request' : 'Submit for approval' }}</button>
              <button type="button" class="btn-ghost h-10" :disabled="saving" @click="resetToLive">Reset to live branding</button>
            </div>
          </section>
        </form>

        <!-- Preview -->
        <aside class="space-y-3 xl:sticky xl:top-4 xl:self-start">
          <section class="card space-y-3 p-5">
            <h2 class="font-bold text-ink">Preview inside the HelaMart store</h2>
            <p class="text-xs text-muted">Exactly what shoppers will see after approval.</p>
            <template v-if="preview">
              <figure>
                <img :src="preview.banner" alt="Entrance banner preview" class="w-full rounded-lg ring-1 ring-line" data-testid="preview-banner">
                <figcaption class="mt-1 text-xs text-muted">Welcome banner inside the entrance</figcaption>
              </figure>
              <figure>
                <img :src="preview.board" alt="Checkout board preview" class="w-full rounded-md ring-1 ring-line">
                <figcaption class="mt-1 text-xs text-muted">Board above the checkout lanes</figcaption>
              </figure>
              <div class="flex items-start gap-4">
                <figure v-if="draft.logoOnFixtures && premium" class="shrink-0">
                  <img :src="preview.plate" alt="End-cap logo plate" class="size-20 rounded-lg">
                  <figcaption class="mt-1 text-xs text-muted">Aisle end-caps</figcaption>
                </figure>
                <figure class="min-w-0 flex-1">
                  <div class="flex h-20 overflow-hidden rounded-lg ring-1 ring-line" aria-hidden="true">
                    <span class="flex-1" :style="{ background: draft.primaryColor }" />
                    <span class="w-1/3" :style="{ background: draft.accentColor ?? '#ffffff' }" />
                  </div>
                  <figcaption class="mt-1 text-xs text-muted">Racks, counters &amp; trims</figcaption>
                </figure>
              </div>
              <div v-if="premium && promoPreview.length" class="grid grid-cols-3 gap-2">
                <img v-for="(u, i) in promoPreview" :key="i" :src="u" :alt="`Promotional banner ${i + 1}`" class="aspect-[3/1] w-full rounded object-cover ring-1 ring-line">
              </div>
              <p v-if="premium && draft.welcomeMessage" class="rounded-lg bg-hela-green p-3 text-center text-xs text-white">
                Welcome to HelaMart · You’re shopping at <b class="text-hela-gold">{{ state.supermarketName }}</b> — {{ draft.welcomeMessage }}
              </p>
            </template>
            <div v-else class="aspect-[5/2] animate-pulse rounded-lg bg-cream" />
          </section>
        </aside>
      </div>
    </template>
  </div>
</template>
