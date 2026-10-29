<script setup lang="ts">
import type { BrandingProfile, Tenant } from '~/types/admin'
import { liveBranding } from '~/lib/branding'

/** Side-by-side "live now" vs "requested" in-store artwork for a reviewer. */
const props = defineProps<{ name: string; before: BrandingProfile; after: BrandingProfile; plan: Tenant['plan'] }>()

// What would actually be published under the supermarket's current plan.
const published = computed(() => liveBranding({ brandColor: props.after.primaryColor, plan: props.plan, branding: props.after }))
const beforeArt = useBrandPreview(() => ({ name: props.name, profile: props.before, logo: props.before.logo, banner: props.before.banner }))
const afterArt = useBrandPreview(() => ({ name: props.name, profile: published.value, logo: published.value.logo, banner: published.value.banner }))

const promoUrls = ref<string[]>([])
watch(
  () => published.value.promoBanners.join(),
  async () => {
    const { resolveImageUrl } = await import('~/services/mock/mediaStore')
    promoUrls.value = (await Promise.all(published.value.promoBanners.map((r) => resolveImageUrl(r)))).filter(Boolean) as string[]
  },
  { immediate: true },
)
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2">
    <figure v-for="col in [{ label: 'Live now', art: beforeArt, p: before }, { label: 'Requested', art: afterArt, p: published }]" :key="col.label" class="min-w-0 space-y-2">
      <figcaption class="text-xs font-bold tracking-wide text-muted uppercase">{{ col.label }}</figcaption>
      <template v-if="col.art">
        <img :src="col.art.banner" :alt="`${col.label}: entrance banner`" class="w-full rounded-lg ring-1 ring-line">
        <img :src="col.art.board" :alt="`${col.label}: checkout board`" class="w-full rounded ring-1 ring-line">
      </template>
      <div v-else class="aspect-[5/2] animate-pulse rounded-lg bg-cream" />
      <div class="flex items-center gap-2 text-xs text-muted">
        <span class="size-4 rounded ring-1 ring-line" :style="{ background: col.p.primaryColor }" />{{ col.p.primaryColor.toUpperCase() }}
        <template v-if="col.p.accentColor"><span class="size-4 rounded ring-1 ring-line" :style="{ background: col.p.accentColor }" />{{ col.p.accentColor.toUpperCase() }}</template>
        <span v-if="col.p.logoOnFixtures" class="chip bg-cream text-ink">Logo on end-caps</span>
      </div>
      <p v-if="col.p.welcomeMessage" class="text-xs text-ink">“{{ col.p.welcomeMessage }}”</p>
      <div v-if="col.label === 'Requested' && promoUrls.length" class="grid grid-cols-3 gap-1.5">
        <img v-for="(u, i) in promoUrls" :key="i" :src="u" :alt="`Promotional banner ${i + 1}`" class="aspect-[3/1] w-full rounded object-cover ring-1 ring-line">
      </div>
    </figure>
  </div>
</template>
