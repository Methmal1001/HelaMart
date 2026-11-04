<script setup lang="ts">
import { LEGAL, type LegalKey } from '~/data/legal'

/** /legal/terms · /legal/privacy — the full documents, always available to read and print. */
const route = useRoute()
const key = computed(() => route.params.doc as LegalKey)
const doc = computed(() => LEGAL[key.value])
if (!doc.value) throw createError({ statusCode: 404, statusMessage: 'Page not found' })
useHead(() => ({ title: doc.value?.title ?? 'Legal' }))

const printPage = () => window.print()

function jump(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="min-h-dvh bg-warm-white">
    <SiteHeader />
    <main v-if="doc" class="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6">
      <p class="eyebrow">HelaMart legal</p>
      <h1 class="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-hela-green sm:text-4xl">{{ doc.title }}</h1>
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <NuxtLink
          v-for="d in [LEGAL.terms, LEGAL.privacy]"
          :key="d.key"
          :to="`/legal/${d.key}`"
          class="rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition"
          :class="d.key === key ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
        >{{ d.title }}</NuxtLink>
        <button type="button" class="btn-ghost ml-auto h-9 print:hidden" @click="printPage"><AppIcon name="printer" :size="15" />Print</button>
      </div>
      <div class="card mt-6 p-5 sm:p-8">
        <LegalDocument :doc="doc" :id-prefix="`page-${doc.key}`" @jump="jump" />
      </div>
    </main>
  </div>
</template>
