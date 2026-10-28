<script setup lang="ts">
/** Touch joystick for walking; outputs x (strafe) and y (forward) in [-1, 1]. */
const emit = defineEmits<{ move: [x: number, y: number] }>()

const base = ref<HTMLElement | null>(null)
const knob = reactive({ x: 0, y: 0 })
const active = ref<number | null>(null)
const RADIUS = 48

function update(e: PointerEvent) {
  const el = base.value
  if (!el) return
  const r = el.getBoundingClientRect()
  let dx = e.clientX - (r.left + r.width / 2)
  let dy = e.clientY - (r.top + r.height / 2)
  const len = Math.hypot(dx, dy)
  if (len > RADIUS) {
    dx = (dx / len) * RADIUS
    dy = (dy / len) * RADIUS
  }
  knob.x = dx
  knob.y = dy
  // Small dead zone so resting a thumb doesn't drift.
  const nx = Math.abs(dx) < 6 ? 0 : dx / RADIUS
  const ny = Math.abs(dy) < 6 ? 0 : -dy / RADIUS
  emit('move', nx, ny)
}

function down(e: PointerEvent) {
  active.value = e.pointerId
  base.value?.setPointerCapture(e.pointerId)
  update(e)
}

function move(e: PointerEvent) {
  if (active.value === e.pointerId) update(e)
}

function up(e: PointerEvent) {
  if (active.value !== e.pointerId) return
  active.value = null
  knob.x = knob.y = 0
  emit('move', 0, 0)
}

onBeforeUnmount(() => emit('move', 0, 0))
</script>

<template>
  <div
    ref="base"
    class="relative grid size-32 touch-none place-items-center rounded-full bg-white/75 shadow-card ring-1 ring-black/5 backdrop-blur-sm select-none"
    role="application"
    aria-label="Movement joystick. Drag to walk."
    @pointerdown.prevent="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="up"
  >
    <span class="pointer-events-none absolute inset-3 rounded-full border-2 border-dashed border-hela-green/15" />
    <span
      class="pointer-events-none grid size-14 place-items-center rounded-full bg-hela-green text-hela-gold shadow-[0_6px_14px_-4px_rgb(23_77_56/0.6)]"
      :class="active === null ? 'transition-transform duration-200' : ''"
      :style="{ transform: `translate(${knob.x}px, ${knob.y}px)` }"
    >
      <svg viewBox="0 0 24 24" class="size-6" fill="currentColor" aria-hidden="true"><path d="M12 4l3 4H9zM12 20l-3-4h6zM4 12l4-3v6zM20 12l-4 3V9z" /></svg>
    </span>
  </div>
</template>
