<script setup lang="ts">
import type { BrandingProfile } from '~/types/admin'

/** A supermarket's approved logo (or a store icon in its theme colour). HelaMart's own branding is untouched. */
const props = withDefaults(defineProps<{ name: string; branding?: BrandingProfile | null; color?: string; size?: string }>(), { size: 'size-9' })

const logoUrl = ref<string | null>(null)
async function load() {
  const ref_ = props.branding?.logo
  if (!ref_ || import.meta.server) {
    logoUrl.value = null
    return
  }
  const { resolveImageUrl } = await import('~/services/mock/mediaStore')
  const url = await resolveImageUrl(ref_)
  if (props.branding?.logo === ref_) logoUrl.value = url
}
onMounted(load)
watch(() => props.branding?.logo, load)
</script>

<template>
  <span
    class="relative grid shrink-0 place-items-center overflow-hidden rounded-lg"
    :class="[size, logoUrl ? 'bg-white ring-1 ring-line' : 'text-white']"
    :style="logoUrl ? undefined : { background: branding?.primaryColor ?? color }"
  >
    <img v-if="logoUrl" :src="logoUrl" :alt="`${name} logo`" class="absolute inset-0 size-full object-contain p-1">
    <AppIcon v-else name="store" :size="17" />
  </span>
</template>
