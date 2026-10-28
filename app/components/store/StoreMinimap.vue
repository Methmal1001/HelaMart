<script setup lang="ts">
import { fixtures, sections, STORE } from '~/data/storeLayout'

const xp = useStoreExperience()
const { minimapOpen, closePanel } = useStoreUi()

function go(id: string) {
  closePanel()
  xp.goToSection(id)
}

const W = STORE.maxX - STORE.minX
const D = STORE.maxZ - STORE.minZ
const mx = (x: number) => x - STORE.minX
const mz = (z: number) => z - STORE.minZ

const player = computed(() => {
  const p = xp.player.value
  if (!p) return null
  return { x: mx(p.x), y: mz(p.z), deg: (-p.yaw * 180) / Math.PI }
})

function label(id: string) {
  const s = sections.find((x) => x.id === id)
  return s ? (s.aisle ? `${s.aisle} · ${s.name}` : s.name) : ''
}

function onKey(e: KeyboardEvent, id: string) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    go(id)
  }
}
</script>

<template>
  <section class="hud-surface w-[15.5rem] overflow-hidden rounded-2xl" aria-label="Store map">
    <header class="flex items-center justify-between gap-2 px-3.5 py-2.5">
      <h2 class="flex items-center gap-2 text-xs font-bold tracking-wide text-ink uppercase">
        <AppIcon name="map" :size="15" class="text-hela-green" />
        Store map
      </h2>
      <button
        type="button"
        class="rounded-md px-1.5 py-0.5 text-xs font-semibold text-muted hover:bg-hela-green-50 hover:text-hela-green"
        :aria-expanded="minimapOpen"
        @click="minimapOpen = !minimapOpen"
      >
        {{ minimapOpen ? 'Hide' : 'Show' }}
      </button>
    </header>

    <div v-show="minimapOpen" class="px-3 pb-3">
      <svg :viewBox="`-1 -1 ${W + 2} ${D + 4}`" class="w-full rounded-xl bg-[#f3f1ea]" role="group" aria-label="Map of store sections. Select a section to go there.">
        <rect x="0" y="0" :width="W" :height="D" rx="0.8" fill="#FBFAF6" stroke="#d9ded6" stroke-width="0.3" />
        <g
          v-for="s in sections"
          :key="s.id"
          role="button"
          tabindex="0"
          class="cursor-pointer outline-none [&:focus-visible>rect]:stroke-hela-gold [&:focus-visible>rect]:[stroke-width:0.8]"
          :aria-label="`Go to ${label(s.id)}`"
          @click="go(s.id)"
          @keydown="onKey($event, s.id)"
        >
          <title>{{ label(s.id) }}</title>
          <rect
            :x="mx(s.area.x - s.area.w / 2) + 0.2"
            :y="mz(s.area.z - s.area.d / 2) + 0.2"
            :width="s.area.w - 0.4"
            :height="s.area.d - 0.4"
            rx="0.6"
            :fill="s.color"
            :fill-opacity="xp.player.value?.sectionId === s.id ? 0.42 : 0.16"
            :stroke="xp.player.value?.sectionId === s.id ? s.color : 'transparent'"
            stroke-width="0.4"
            class="transition-[fill-opacity]"
          />
        </g>
        <rect
          v-for="(f, i) in fixtures"
          :key="i"
          :x="mx(f.rect.x - f.rect.w / 2)"
          :y="mz(f.rect.z - f.rect.d / 2)"
          :width="f.rect.w"
          :height="f.rect.d"
          rx="0.2"
          fill="#174D38"
          fill-opacity="0.55"
          pointer-events="none"
        />
        <!-- Entrance -->
        <rect :x="mx(-STORE.door.width / 2)" :y="D - 0.4" :width="STORE.door.width" height="0.8" fill="#E1C987" />
        <text :x="W / 2" :y="D + 2.6" text-anchor="middle" font-size="1.7" font-weight="700" fill="#5f6f66">Entrance</text>
        <!-- You are here -->
        <g v-if="player" :transform="`translate(${player.x} ${player.y}) rotate(${player.deg})`" pointer-events="none">
          <circle r="1.6" fill="#174D38" fill-opacity="0.15" />
          <path d="M0 -1.5 L1.1 1.1 L0 0.5 L-1.1 1.1 Z" fill="#174D38" stroke="#fff" stroke-width="0.3" />
        </g>
      </svg>
      <p class="mt-2 text-[0.7rem] leading-snug text-muted">Tap a section to walk there.</p>
    </div>
  </section>
</template>
