<script setup lang="ts">
import type { QualityLevel } from '~/types'
import { AVATAR_OPTIONS } from '~/composables/useAvatar'

const { panel, closePanel } = useStoreUi()
const xp = useStoreExperience()
const { avatar, select } = useAvatar()
const { show } = useToasts()

const open = computed(() => panel.value === 'settings' || panel.value === 'help')

const QUALITY: { id: QualityLevel; label: string; hint: string }[] = [
  { id: 'low', label: 'Battery saver', hint: 'No shadows, fewer products. Best for older phones.' },
  { id: 'balanced', label: 'Balanced', hint: 'Soft shadows and full shelves.' },
  { id: 'high', label: 'High detail', hint: 'Sharpest image and densest shelves.' },
]

function exitStore() {
  closePanel()
  xp.returnToEntrance()
}

function changeAvatar(kind: (typeof AVATAR_OPTIONS)[number]['kind']) {
  select(kind)
  show(`Now shopping as the ${kind} avatar`)
}

const isTouch = ref(false)
onMounted(() => (isTouch.value = isCoarsePointer()))
</script>

<template>
  <SidePanel :open="open" :title="panel === 'help' ? 'How to move around' : 'Store settings'" @close="closePanel">
    <div class="space-y-7 px-5 py-5">
      <section aria-labelledby="controls-h">
        <h3 id="controls-h" class="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <AppIcon name="keyboard" :size="16" class="text-hela-green" />
          Controls
        </h3>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
          <template v-if="!isTouch">
            <dt><kbd class="kbd">W A S D</kbd> / <kbd class="kbd">↑ ↓</kbd></dt>
            <dd class="text-muted">Walk forward, back and sideways</dd>
            <dt><kbd class="kbd">← →</kbd> / <kbd class="kbd">Q E</kbd></dt>
            <dd class="text-muted">Turn left or right</dd>
            <dt><kbd class="kbd">Shift</kbd></dt>
            <dd class="text-muted">Walk faster</dd>
            <dt>Drag mouse</dt>
            <dd class="text-muted">Look around</dd>
            <dt><kbd class="kbd">L</kbd></dt>
            <dd class="text-muted">Mouse-look mode (press <kbd class="kbd">Esc</kbd> to release)</dd>
            <dt><kbd class="kbd">V</kbd></dt>
            <dd class="text-muted">Switch first / third-person view</dd>
            <dt>Click</dt>
            <dd class="text-muted">Open a product to see price and add to cart</dd>
          </template>
          <template v-else>
            <dt>Joystick</dt>
            <dd class="text-muted">Walk (push fully to walk faster)</dd>
            <dt>Drag screen</dt>
            <dd class="text-muted">Look around</dd>
            <dt>Tap</dt>
            <dd class="text-muted">Open a product</dd>
          </template>
          <dt>Map</dt>
          <dd class="text-muted">Select a section to jump straight there</dd>
        </dl>
      </section>

      <section aria-labelledby="view-h">
        <h3 id="view-h" class="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <AppIcon name="eye" :size="16" class="text-hela-green" />
          Camera view
        </h3>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="v in (['third', 'first'] as const)"
            :key="v"
            type="button"
            class="rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition"
            :class="xp.viewMode.value === v ? 'bg-hela-green text-white ring-hela-green' : 'bg-white text-ink ring-line hover:bg-hela-green-50'"
            :aria-pressed="xp.viewMode.value === v"
            @click="xp.viewMode.value !== v && xp.toggleView()"
          >
            {{ v === 'third' ? 'Behind avatar' : 'First person' }}
          </button>
        </div>
      </section>

      <section aria-labelledby="quality-h">
        <h3 id="quality-h" class="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <AppIcon name="settings" :size="16" class="text-hela-green" />
          Graphics quality
        </h3>
        <div class="space-y-2" role="radiogroup" aria-labelledby="quality-h">
          <button
            v-for="q in QUALITY"
            :key="q.id"
            type="button"
            role="radio"
            class="flex w-full items-start gap-3 rounded-xl bg-white p-3 text-left ring-1 transition"
            :class="xp.quality.value === q.id ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
            :aria-checked="xp.quality.value === q.id"
            @click="xp.setQuality(q.id)"
          >
            <span
              class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ring-2"
              :class="xp.quality.value === q.id ? 'ring-hela-green' : 'ring-line'"
            >
              <span v-if="xp.quality.value === q.id" class="size-2 rounded-full bg-hela-green" />
            </span>
            <span>
              <span class="block text-sm font-semibold text-ink">{{ q.label }}</span>
              <span class="block text-xs text-muted">{{ q.hint }}</span>
            </span>
          </button>
        </div>
      </section>

      <section aria-labelledby="avatar-h">
        <h3 id="avatar-h" class="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <AppIcon name="user" :size="16" class="text-hela-green" />
          Avatar
        </h3>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="o in AVATAR_OPTIONS"
            :key="o.kind"
            type="button"
            class="flex items-center gap-2 rounded-xl bg-white p-2 text-left text-sm font-semibold ring-1 transition"
            :class="avatar === o.kind ? 'ring-2 ring-hela-green' : 'ring-line hover:bg-hela-green-50'"
            :aria-pressed="avatar === o.kind"
            @click="changeAvatar(o.kind)"
          >
            <img v-if="xp.portraits.value[o.kind]" :src="xp.portraits.value[o.kind]" alt="" class="h-12 w-10 rounded-lg bg-hela-green-50 object-contain">
            {{ o.label }}
          </button>
        </div>
      </section>

      <button type="button" class="btn-ghost w-full" @click="exitStore">
        <AppIcon name="door" :size="18" />
        Walk back to the entrance
      </button>
    </div>
  </SidePanel>
</template>

<style scoped>
.kbd {
  display: inline-block;
  min-width: 1.6rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.4rem;
  background: #fff;
  box-shadow: inset 0 -1px 0 #d9ded6, 0 0 0 1px #e2e6df;
  font-size: 0.72rem;
  font-weight: 700;
  text-align: center;
  color: #17352a;
  white-space: nowrap;
}
</style>
