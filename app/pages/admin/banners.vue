<script setup lang="ts">
import type { ShopperLocation } from '~/types'
import type { PlatformBanner } from '~/types/admin'
import type { PublicBanner } from '~/services/bannerService'
import { BANNER_THEMES, deleteBanner, listBanners, offersForBanner, saveBanner, setBannerStatus, uploadBannerImage, type BannerInput } from '~/services/bannerService'
import { listTenants, type TenantSummary } from '~/services/admin/platformApi'
import { DISTRICTS } from '~/data/sriLanka'
import { PLACES } from '~/data/places'
import { DEFAULT_RADIUS_KM } from '~/lib/area'
import { ImageRejected, prepareBrandImage, type PreparedImage } from '~/utils/imageProcessing'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'platform', permission: 'platform.banners.manage' })
useHead({ title: 'Homepage banners' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const banners = ref<PlatformBanner[]>([])
const tenants = ref<TenantSummary[]>([])
const loading = ref(true)
const reloadKey = ref(0)

async function load() {
  loading.value = true
  try {
    ;[banners.value, tenants.value] = await Promise.all([auth.call(listBanners), auth.call(listTenants)])
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
    reloadKey.value++
  }
}
onMounted(load)

const activeTenants = computed(() => tenants.value.filter((t) => t.status === 'active'))
const tenantName = (id?: string) => tenants.value.find((t) => t.id === id)?.name ?? '—'
const live = (b: PlatformBanner) => b.status === 'active' && Date.parse(b.startsAt) <= Date.now() && Date.parse(b.endsAt) > Date.now()
const stateOf = (b: PlatformBanner) => (b.status === 'paused' ? 'paused' : Date.parse(b.endsAt) <= Date.now() ? 'expired' : Date.parse(b.startsAt) > Date.now() ? 'pending' : 'active')
const targetText = (b: PlatformBanner) => (b.target === 'all' ? 'Everyone' : b.target === 'districts' ? b.districts.join(', ') : `Where ${tenantName(b.tenantId)} delivers`)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short', year: 'numeric' })

// ---- "see it as a shopper in…" preview
const previewTown = ref('Gampaha')
const previewArea = computed<ShopperLocation | null>(() => {
  const p = PLACES.find((x) => x.name === previewTown.value)
  return p ? { label: p.name, district: p.district, lat: p.lat, lng: p.lng, radiusKm: DEFAULT_RADIUS_KM, source: 'town' } : null
})

// ---- editor
const editing = ref<PlatformBanner | 'new' | null>(null)
const f = reactive({
  title: '', subtitle: '', theme: 'green' as PlatformBanner['theme'], tenantId: '', offerId: '', cta: 'none' as PlatformBanner['cta'],
  target: 'all' as PlatformBanner['target'], districts: [] as string[], starts: '', ends: '', priority: 10, image: '' as string,
})
const offerOptions = ref<Awaited<ReturnType<typeof offersForBanner>>>([])
const pendingImage = ref<PreparedImage | null>(null)
const imageUrl = ref<string | null>(null)
const imageBusy = ref(false)
const error = ref('')
const saving = ref(false)

const toDate = (d: Date) => d.toISOString().slice(0, 10)
async function open(b: PlatformBanner | 'new') {
  editing.value = b
  error.value = ''
  if (pendingImage.value) URL.revokeObjectURL(pendingImage.value.url)
  pendingImage.value = null
  imageUrl.value = null
  if (b === 'new') {
    Object.assign(f, { title: '', subtitle: '', theme: 'green', tenantId: '', offerId: '', cta: 'none', target: 'all', districts: [], starts: toDate(new Date()), ends: toDate(new Date(Date.now() + 30 * 864e5)), priority: 10, image: '' })
  } else {
    Object.assign(f, { title: b.title, subtitle: b.subtitle, theme: b.theme, tenantId: b.tenantId ?? '', offerId: b.offerId ?? '', cta: b.cta, target: b.target, districts: [...b.districts], starts: b.startsAt.slice(0, 10), ends: b.endsAt.slice(0, 10), priority: b.priority, image: b.image ?? '' })
    if (b.image) {
      const { resolveImageUrl } = await import('~/services/mock/mediaStore')
      imageUrl.value = await resolveImageUrl(b.image)
    }
  }
}
watch(
  () => f.tenantId,
  async (id, old) => {
    if (old !== undefined && id !== old) f.offerId = ''
    offerOptions.value = id ? await auth.call((t) => offersForBanner(t, id)) : []
    if (!id) Object.assign(f, { cta: 'none', target: f.target === 'deliverable' ? 'all' : f.target })
  },
)

async function chooseImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  imageBusy.value = true
  error.value = ''
  try {
    const img = await prepareBrandImage(file, 'banner')
    if (pendingImage.value) URL.revokeObjectURL(pendingImage.value.url)
    pendingImage.value = img
    imageUrl.value = img.url
  } catch (err) {
    error.value = err instanceof ImageRejected ? err.message : 'That file could not be read as an image.'
  } finally {
    imageBusy.value = false
  }
}
function removeImage() {
  if (pendingImage.value) URL.revokeObjectURL(pendingImage.value.url)
  pendingImage.value = null
  imageUrl.value = null
  f.image = ''
}

/** Exactly how the banner will look (store + offer filled from the selections). */
const previewBanner = computed<PublicBanner>(() => {
  const t = tenants.value.find((x) => x.id === f.tenantId)
  const o = offerOptions.value.find((x) => x.id === f.offerId)
  return {
    id: 'preview', title: f.title || 'Your headline', subtitle: f.subtitle, theme: f.theme, cta: f.cta,
    store: t ? { id: t.id, name: t.name, branding: { primaryColor: t.brandColor, slogan: '', promoBanners: [], logoOnFixtures: false }, brandColor: t.brandColor } : undefined,
    offer: o ? { id: o.id, code: o.code, title: o.title, description: '', rule: o.rule, expiresAt: '2099-01-01' } : undefined,
  }
})
async function save() {
  error.value = ''
  saving.value = true
  try {
    if (pendingImage.value) {
      const { blob, width, height } = pendingImage.value
      f.image = await auth.call((t) => uploadBannerImage(t, blob, { width, height }))
    }
    const input: BannerInput = {
      title: f.title, subtitle: f.subtitle, theme: f.theme, image: f.image || undefined, tenantId: f.tenantId || undefined, offerId: f.offerId || undefined,
      cta: f.cta, target: f.target, districts: f.districts, startsAt: `${f.starts}T00:00:00+05:30`, endsAt: `${f.ends}T23:59:59+05:30`, priority: Number(f.priority),
    }
    const id = editing.value === 'new' ? undefined : editing.value?.id
    await auth.call((t) => saveBanner(t, input, id))
    notify.ok(id ? 'Banner updated' : 'Banner published to the HelaMart homepage')
    editing.value = null
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function toggle(b: PlatformBanner) {
  try {
    await auth.call((t) => setBannerStatus(t, b.id, b.status === 'active' ? 'paused' : 'active'))
    await load()
  } catch (e) {
    notify.error(e)
  }
}
async function remove(b: PlatformBanner) {
  const r = await confirm({ title: `Delete “${b.title}”?`, message: 'It disappears from the HelaMart homepage straight away.', confirmLabel: 'Delete banner', tone: 'danger' })
  if (!r.ok) return
  try {
    await auth.call((t) => deleteBanner(t, b.id), 'Deleting a homepage banner needs your password confirmed.')
    notify.ok('Banner deleted')
    await load()
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Homepage banners" description="HelaMart’s promotion banners on the shoppers’ home screen and Browse page. Only head office controls them; target them to everyone, to districts, or only where a supermarket delivers.">
      <button type="button" class="btn-primary h-10" data-testid="new-banner" @click="open('new')"><AppIcon name="plus" :size="17" />New banner</button>
    </AdminPageHeader>

    <section class="card mb-5 p-4">
      <div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <AppIcon name="eye" :size="16" class="text-hela-green" />
        <span class="font-semibold text-ink">See it as a shopper in</span>
        <select v-model="previewTown" class="field h-9 w-auto py-0" aria-label="Preview area" data-testid="preview-town">
          <option v-for="p in PLACES" :key="`${p.name}-${p.district}`" :value="p.name">{{ p.name }} ({{ p.district }})</option>
        </select>
      </div>
      <HomeBanners variant="hero" :preview-area="previewArea" :reload-key="reloadKey" />
      <p class="mt-2 text-xs text-muted">Nothing shows if no banner targets this area. Shoppers without an area see only “Everyone” banners.</p>
    </section>

    <p v-if="loading" class="text-sm text-muted">Loading banners…</p>
    <div class="grid gap-3 lg:grid-cols-2">
      <article v-for="b in banners" :key="b.id" class="card overflow-hidden" :data-testid="`admin-banner-${b.id}`">
        <div class="pointer-events-none origin-top-left">
          <BannerSlide :banner="{ id: b.id, title: b.title, subtitle: b.subtitle, theme: b.theme, cta: 'none', store: b.tenantId ? { id: b.tenantId, name: tenantName(b.tenantId), branding: { primaryColor: '#174D38', slogan: '', promoBanners: [], logoOnFixtures: false }, brandColor: '#174D38' } : undefined }" variant="floating" />
        </div>
        <div class="space-y-1.5 p-4 text-sm">
          <div class="flex items-center justify-between gap-2">
            <AdminBadge :value="stateOf(b)" :label="stateOf(b) === 'pending' ? 'Scheduled' : undefined" />
            <span class="text-xs text-muted">Priority {{ b.priority }} · {{ b.views }} views · {{ b.clicks }} clicks</span>
          </div>
          <p><span class="text-muted">Shown to:</span> <b class="text-ink">{{ targetText(b) }}</b></p>
          <p v-if="b.offerId" class="text-xs text-muted">Features offer {{ b.offerId }}</p>
          <p class="text-xs text-muted">{{ day(b.startsAt) }} → {{ day(b.endsAt) }}{{ live(b) ? ' · live now' : '' }}</p>
          <div class="flex gap-1 pt-1">
            <button type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="open(b)"><AppIcon name="edit" :size="14" />Edit</button>
            <button type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="toggle(b)">{{ b.status === 'active' ? 'Pause' : 'Resume' }}</button>
            <button type="button" class="btn-ghost h-8 px-2.5 text-xs text-[#8A2E2E]" :aria-label="`Delete ${b.title}`" @click="remove(b)"><AppIcon name="trash" :size="14" /></button>
          </div>
        </div>
      </article>
    </div>

    <AdminModal :open="!!editing" :title="editing === 'new' ? 'New homepage banner' : 'Edit banner'" size="xl" @close="editing = null">
      <div class="space-y-4">
        <BannerSlide :banner="previewBanner" variant="hero" :image-url="imageUrl" />
        <form id="banner-form" class="grid gap-3 sm:grid-cols-2" @submit.prevent="save">
          <label class="sm:col-span-2"><span class="field-label">Headline</span><input v-model="f.title" class="field" maxlength="70" placeholder="e.g. 20% off all drinks" data-autofocus data-testid="banner-title"></label>
          <label class="sm:col-span-2"><span class="field-label">Sub-text</span><input v-model="f.subtitle" class="field" maxlength="140" placeholder="One short sentence"></label>
          <div class="sm:col-span-2">
            <span class="field-label">Colour theme</span>
            <div class="flex flex-wrap gap-2">
              <label v-for="t in BANNER_THEMES" :key="t" class="cursor-pointer rounded-lg px-3 py-1.5 text-xs font-bold capitalize ring-1 transition" :class="f.theme === t ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line'">
                <input v-model="f.theme" type="radio" :value="t" class="sr-only">{{ t }}
              </label>
            </div>
          </div>
          <div class="sm:col-span-2">
            <span class="field-label">Image (optional, wide 3:1)</span>
            <div class="flex flex-wrap items-center gap-2">
              <label class="btn-ghost h-9 cursor-pointer ring-1 ring-line" :class="{ 'pointer-events-none opacity-50': imageBusy }">
                <AppIcon name="plus" :size="14" />{{ imageUrl ? 'Replace image' : 'Upload image' }}
                <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" @change="chooseImage">
              </label>
              <button v-if="imageUrl" type="button" class="btn-ghost h-9 text-[#8A2E2E]" @click="removeImage">Remove</button>
              <span class="text-xs text-muted">{{ imageBusy ? 'Processing…' : 'Without an image the colour theme is used.' }}</span>
            </div>
          </div>
          <label><span class="field-label">Promote a supermarket (optional)</span>
            <select v-model="f.tenantId" class="field" data-testid="banner-store">
              <option value="">— HelaMart announcement —</option>
              <option v-for="t in activeTenants" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label><span class="field-label">Feature one of its offers</span>
            <select v-model="f.offerId" class="field" :disabled="!f.tenantId" data-testid="banner-offer">
              <option value="">No specific offer</option>
              <option v-for="o in offerOptions" :key="o.id" :value="o.id">{{ o.headline }} — {{ o.title }} ({{ o.branches }})</option>
            </select>
          </label>
          <label><span class="field-label">Button</span>
            <select v-model="f.cta" class="field" :disabled="!f.tenantId">
              <option value="none">No button</option>
              <option value="shop">“Shop at …” (switches the shopper to that supermarket)</option>
              <option value="offers">“See the offer” (switches and opens its offers)</option>
            </select>
          </label>
          <label><span class="field-label">Priority (higher shows first)</span><input v-model.number="f.priority" type="number" min="0" max="100" class="field"></label>
          <fieldset class="sm:col-span-2">
            <legend class="field-label">Who sees it</legend>
            <div class="flex flex-wrap gap-4 text-sm">
              <label class="flex items-center gap-2"><input v-model="f.target" type="radio" value="all" class="accent-hela-green"> Everyone</label>
              <label class="flex items-center gap-2"><input v-model="f.target" type="radio" value="districts" class="accent-hela-green"> Shoppers in chosen districts</label>
              <label class="flex items-center gap-2"><input v-model="f.target" type="radio" value="deliverable" class="accent-hela-green" :disabled="!f.tenantId" data-testid="target-deliverable"> Only where this supermarket delivers</label>
            </div>
            <div v-if="f.target === 'districts'" class="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg bg-white p-2 ring-1 ring-line">
              <label v-for="d in DISTRICTS" :key="d" class="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold ring-1" :class="f.districts.includes(d) ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line'">
                <input v-model="f.districts" type="checkbox" :value="d" class="sr-only">{{ d }}
              </label>
            </div>
          </fieldset>
          <label><span class="field-label">Starts</span><input v-model="f.starts" type="date" class="field"></label>
          <label><span class="field-label">Ends</span><input v-model="f.ends" type="date" class="field"></label>
          <p v-if="error" class="text-sm text-[#8A2E2E] sm:col-span-2" role="alert">{{ error }}</p>
        </form>
      </div>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="editing = null">Cancel</button>
        <button type="submit" form="banner-form" class="btn-primary h-9" :disabled="saving" data-testid="banner-save">{{ saving ? 'Saving…' : 'Publish banner' }}</button>
      </template>
    </AdminModal>
  </div>
</template>
