<script setup lang="ts">
/**
 * Single-series daily bar chart (one hue, no legend — the title names it).
 * Thin bars with rounded data-ends on a zero baseline, recessive grid,
 * per-bar hover/focus tooltip, and a table view for accessibility.
 */
const props = defineProps<{ data: { date: string; cents: number; orders: number }[]; title: string; showMoney: boolean }>()

const W = 640
const H = 220
const PAD = { l: 52, r: 12, t: 12, b: 28 }
const showTable = ref(false)
const hover = ref<number | null>(null)
const hovered = computed(() => (hover.value === null ? null : props.data[hover.value] ?? null))

const metric = (d: { cents: number; orders: number }) => (props.showMoney ? d.cents / 100 : d.orders)
const max = computed(() => {
  const m = Math.max(1, ...props.data.map(metric))
  const pow = Math.pow(10, Math.floor(Math.log10(m)))
  return Math.ceil(m / pow) * pow
})
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => f * max.value))
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b
const step = computed(() => plotW / props.data.length)
const barW = computed(() => Math.min(22, step.value * 0.56))
const y = (v: number) => PAD.t + plotH - (v / max.value) * plotH
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })
const fmtTick = (v: number) => {
  if (!props.showMoney) return Number.isInteger(v) ? `${v}` : v.toFixed(1)
  return v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : `${v}`
}
const fmtVal = (d: { cents: number; orders: number }) => (props.showMoney ? formatLKR(d.cents) : `${d.orders} orders`)

function bar(i: number) {
  const d = props.data[i]!
  const x = PAD.l + step.value * i + (step.value - barW.value) / 2
  const top = y(metric(d))
  const h = Math.max(0, PAD.t + plotH - top)
  const r = Math.min(4, h, barW.value / 2)
  // Rounded top corners only (data end), square at the baseline.
  return `M${x},${PAD.t + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW.value - r} Q${x + barW.value},${top} ${x + barW.value},${top + r} V${PAD.t + plotH} Z`
}
</script>

<template>
  <section class="card p-4" :aria-label="title">
    <div class="mb-3 flex items-center justify-between gap-2">
      <h2 class="text-sm font-bold text-ink">{{ title }}</h2>
      <button type="button" class="text-xs font-semibold text-hela-green hover:underline" :aria-pressed="showTable" @click="showTable = !showTable">
        {{ showTable ? 'Show chart' : 'Show as table' }}
      </button>
    </div>

    <div v-if="!showTable" class="relative">
      <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img" :aria-label="`${title}. Use the table view for exact values.`">
        <g v-for="t in ticks" :key="t">
          <line :x1="PAD.l" :x2="W - PAD.r" :y1="y(t)" :y2="y(t)" stroke="#E2E6DF" :stroke-dasharray="t === 0 ? '' : '3 4'" stroke-width="1" />
          <text :x="PAD.l - 8" :y="y(t) + 4" text-anchor="end" font-size="11" fill="#5f6f66">{{ fmtTick(t) }}</text>
        </g>
        <g v-for="(d, i) in data" :key="d.date">
          <path :d="bar(i)" :fill="hover === i ? '#0F3526' : '#174D38'" />
          <text v-if="i % 2 === 0 || data.length <= 8" :x="PAD.l + step * i + step / 2" :y="H - 8" text-anchor="middle" font-size="10.5" fill="#5f6f66">{{ fmtDay(d.date) }}</text>
          <!-- Hit target wider than the bar. -->
          <rect
            :x="PAD.l + step * i"
            :y="PAD.t"
            :width="step"
            :height="plotH"
            fill="transparent"
            tabindex="0"
            class="cursor-pointer outline-none"
            :aria-label="`${fmtDay(d.date)}: ${fmtVal(d)}`"
            @mouseenter="hover = i"
            @mouseleave="hover = null"
            @focus="hover = i"
            @blur="hover = null"
          />
        </g>
      </svg>
      <div
        v-if="hover !== null && hovered"
        class="pointer-events-none absolute top-0 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-float"
        :style="{ left: `${((PAD.l + step * hover + step / 2) / W) * 100}%`, transform: 'translateX(-50%)' }"
      >
        <p class="font-semibold">{{ fmtDay(hovered.date) }}</p>
        <p class="tabular-nums">{{ showMoney ? ` · ` : '' }}{{ hovered.orders }} orders</p>
      </div>
    </div>

    <table v-else class="w-full text-sm">
      <thead class="text-xs text-muted">
        <tr><th class="py-1 text-left font-semibold">Date</th><th v-if="showMoney" class="py-1 text-right font-semibold">Revenue</th><th class="py-1 text-right font-semibold">Orders</th></tr>
      </thead>
      <tbody class="divide-y divide-line">
        <tr v-for="d in data" :key="d.date">
          <td class="py-1.5">{{ fmtDay(d.date) }}</td>
          <td v-if="showMoney" class="py-1.5 text-right tabular-nums">{{ formatLKR(d.cents) }}</td>
          <td class="py-1.5 text-right tabular-nums">{{ d.orders }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
