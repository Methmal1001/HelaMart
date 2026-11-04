<script setup lang="ts">
import type { LegalDoc } from '~/data/legal'

/** A legal document: summary of the key points, contents, then the numbered sections. */
const { doc, idPrefix = 'legal' } = defineProps<{ doc: LegalDoc; idPrefix?: string }>()
const emit = defineEmits<{ jump: [id: string] }>()
</script>

<template>
  <article class="text-sm leading-relaxed text-ink" :aria-label="doc.title">
    <p class="text-xs font-semibold tracking-wide text-muted uppercase">Version {{ doc.version }} · Effective {{ doc.effective }}</p>
    <p class="mt-2 text-muted">{{ doc.intro }}</p>

    <!-- Key points first: what matters most, in plain words -->
    <section class="mt-5" :aria-labelledby="`${idPrefix}-key`">
      <h3 :id="`${idPrefix}-key`" class="text-xs font-extrabold tracking-wide text-hela-green uppercase">The key points</h3>
      <ul class="mt-2 grid gap-2 sm:grid-cols-2">
        <li v-for="k in doc.keyPoints" :key="k.title" class="flex gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-line">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-hela-green-50 text-hela-green"><AppIcon :name="k.icon" :size="18" /></span>
          <span>
            <span class="block font-bold text-ink">{{ k.title }}</span>
            <span class="mt-0.5 block text-xs text-muted">{{ k.text }}</span>
          </span>
        </li>
      </ul>
    </section>

    <!-- Contents -->
    <nav class="mt-5" :aria-label="`${doc.title} contents`">
      <h3 class="text-xs font-extrabold tracking-wide text-hela-green uppercase">Contents</h3>
      <ol class="mt-2 flex flex-wrap gap-1.5">
        <li v-for="(s, i) in doc.sections" :key="s.id">
          <a
            :href="`#${idPrefix}-${s.id}`"
            class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition"
            :class="s.important ? 'bg-hela-gold-100 text-[#5a4518] ring-hela-gold' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
            @click.prevent="emit('jump', `${idPrefix}-${s.id}`)"
          >{{ i + 1 }}. {{ s.title }}</a>
        </li>
      </ol>
    </nav>

    <!-- Sections -->
    <div class="mt-6 space-y-5">
      <section
        v-for="(s, i) in doc.sections"
        :id="`${idPrefix}-${s.id}`"
        :key="s.id"
        class="scroll-mt-4"
        :class="s.important ? 'rounded-2xl bg-hela-gold-100/70 p-4 ring-2 ring-hela-gold' : ''"
      >
        <h3 class="flex items-center gap-2 text-base font-extrabold text-ink">
          <span class="grid size-6 shrink-0 place-items-center rounded-full text-xs" :class="s.important ? 'bg-hela-gold text-hela-green-900' : 'bg-hela-green-50 text-hela-green'">{{ i + 1 }}</span>
          {{ s.title }}
          <span v-if="s.important" class="ml-auto rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-extrabold tracking-wide text-[#8A2E2E] uppercase">Please read</span>
        </h3>
        <p v-for="(p, j) in s.paragraphs" :key="j" class="mt-2" :class="s.important && j === 0 ? 'font-semibold' : 'text-[#3d4245]'">
          <span class="mr-1 text-xs font-bold text-muted tabular-nums">{{ i + 1 }}.{{ j + 1 }}</span>{{ p }}
        </p>
        <ul v-if="s.bullets" class="mt-2 space-y-1.5">
          <li v-for="b in s.bullets" :key="b" class="flex gap-2 text-[#3d4245]">
            <AppIcon name="check" :size="14" :stroke-width="3" class="mt-1 shrink-0 text-hela-green" />{{ b }}
          </li>
        </ul>
      </section>
    </div>
  </article>
</template>
