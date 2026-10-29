<script setup lang="ts">
import type { Branch } from '~/types/admin'
import type { CoverageMap } from '~/lib/maps/coverageMap'
import { PLACES, findPlace, locateBranch } from '~/data/places'
import { COVERAGE_LIMITS, cleanPlaces, coverageProblems, townsInside } from '~/lib/coverage'
import { circlePolygon, pointInPolygon, polygonAreaKm2, type LatLng } from '~/lib/geo'
import { saveBranchCoverage } from '~/services/admin/tenantApi'

/**
 * Draw a branch's home-delivery area on a map and list the cities / villages
 * inside it. Shoppers outside this area can't choose the branch.
 */
const props = defineProps<{ branch: Branch; readOnly?: boolean }>()
const emit = defineEmits<{ saved: [branch: Branch]; cancel: [] }>()

const auth = useAdminAuth()
const notify = useAdminNotify()
const googleKey = useRuntimeConfig().public.googleMapsApiKey as string

const pin = computed(() => locateBranch(props.branch))
const polygon = ref<LatLng[]>(props.branch.coverage?.polygon.map(([a, b]) => [a, b] as LatLng) ?? [])
const places = ref<string[]>([...(props.branch.coverage?.places ?? [])])
const newPlace = ref('')
const startRadius = ref(5)
const saving = ref(false)
const error = ref('')
const mapEl = ref<HTMLElement | null>(null)
const provider = ref<'google' | 'osm' | null>(null)
let map: CoverageMap | null = null
const history: LatLng[][] = []

const area = computed(() => polygonAreaKm2(polygon.value))
const branchInside = computed(() => polygon.value.length >= 3 && pointInPolygon(pin.value.lat, pin.value.lng, polygon.value))
const suggestions = computed(() => townsInside(polygon.value).filter((t) => !places.value.some((p) => p.toLowerCase() === t.toLowerCase())))
const problems = computed(() => coverageProblems(polygon.value, places.value, pin.value))
const nearbyTowns = computed(() => PLACES.filter((p) => Math.abs(p.lat - pin.value.lat) < 0.45 && Math.abs(p.lng - pin.value.lng) < 0.45))

function onMapChange(next: LatLng[]) {
  history.push(polygon.value)
  polygon.value = next
}
function setShape(next: LatLng[]) {
  history.push(polygon.value)
  polygon.value = next
  map?.setPolygon(next, true)
}
function startCircle() {
  setShape(circlePolygon(pin.value.lat, pin.value.lng, startRadius.value, 12))
}
function undo() {
  const prev = history.pop()
  if (!prev) return
  polygon.value = prev
  map?.setPolygon(prev)
}
function clearShape() {
  setShape([])
}

function addPlace(name = newPlace.value) {
  const next = cleanPlaces([...places.value, name])
  if (next.length === places.value.length) {
    if (name.trim()) error.value = name.trim().length < 2 ? 'Enter a city or village name.' : `${name.trim()} is already listed.`
    return
  }
  if (next.length > COVERAGE_LIMITS.maxPlaces) return
  error.value = ''
  places.value = next
  newPlace.value = ''
}
function addSuggested() {
  places.value = cleanPlaces([...places.value, ...suggestions.value])
}
function removePlace(name: string) {
  places.value = places.value.filter((p) => p !== name)
}
/** Is a named place outside the drawn shape? (known towns only — villages can't be checked) */
function placeOutside(name: string) {
  const t = findPlace(name)
  return !!t && polygon.value.length >= 3 && !pointInPolygon(t.lat, t.lng, polygon.value)
}

watch([polygon, places], () => map?.setTowns(nearbyTowns.value.map((t) => ({ ...t, included: places.value.includes(t.name) }))), { deep: true })

onMounted(async () => {
  if (!mapEl.value) return
  const { createCoverageMap } = await import('~/lib/maps/coverageMap')
  map = await createCoverageMap(mapEl.value, {
    center: pin.value,
    branchName: props.branch.name,
    polygon: polygon.value,
    color: '#174D38',
    googleKey: googleKey || undefined,
    onChange: onMapChange,
  })
  provider.value = map.provider
  map.setTowns(nearbyTowns.value.map((t) => ({ ...t, included: places.value.includes(t.name) })))
})
onBeforeUnmount(() => map?.destroy())

async function save() {
  error.value = ''
  if (problems.value.length) return (error.value = problems.value[0]!)
  saving.value = true
  try {
    const payload = { polygon: polygon.value.map(([a, b]) => [a, b] as [number, number]), places: [...places.value] }
    const b = await auth.call((t) => saveBranchCoverage(t, props.branch.id, payload))
    notify.ok(`${b.name}: delivery area saved — ${b.coverage!.places.length} places, ${b.coverage!.areaKm2} km²`)
    emit('saved', b)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
    <div class="min-w-0">
      <div class="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span class="text-muted">Start from a circle of</span>
        <select v-model.number="startRadius" class="field h-8 w-auto py-0 text-xs" aria-label="Circle radius" :disabled="readOnly">
          <option v-for="r in [2, 3, 5, 8, 10, 15]" :key="r" :value="r">{{ r }} km</option>
        </select>
        <button type="button" class="btn-ghost h-8 px-2.5 text-xs ring-1 ring-line" :disabled="readOnly" data-testid="cov-circle" @click="startCircle">Use circle</button>
        <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :disabled="readOnly || !history.length" @click="undo">Undo</button>
        <button type="button" class="btn-ghost h-8 px-2.5 text-xs text-[#8A2E2E]" :disabled="readOnly || !polygon.length" @click="clearShape">Clear</button>
      </div>
      <div ref="mapEl" class="relative z-0 h-[22rem] overflow-hidden rounded-xl bg-cream ring-1 ring-line sm:h-[26rem]" data-testid="coverage-map" />
      <p class="mt-1.5 text-xs text-muted">
        Click the map to add corners · drag a corner to move it · right-click a corner to delete it{{ provider === 'osm' ? ' · click a dashed dot to add a corner between two' : '' }}.
        <span class="whitespace-nowrap">Map: {{ provider === 'google' ? 'Google Maps' : provider === 'osm' ? 'OpenStreetMap' : 'loading…' }}</span>
      </p>
      <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span><b class="text-ink">{{ area ? area.toFixed(1) : 0 }} km²</b> <span class="text-muted">area</span></span>
        <span><b class="text-ink">{{ polygon.length }}</b> <span class="text-muted">corners</span></span>
        <span :class="branchInside ? 'text-hela-green' : 'text-[#7A5600]'">{{ branchInside ? '✓ Branch is inside the area' : 'Branch is outside the area' }}</span>
      </div>
    </div>

    <div class="flex min-w-0 flex-col">
      <p class="field-label">Cities &amp; villages you deliver to ({{ places.length }})</p>
      <form class="flex gap-2" @submit.prevent="addPlace()">
        <input v-model="newPlace" class="field h-9" list="coverage-places" placeholder="Add a city or village" maxlength="60" :disabled="readOnly" data-testid="cov-place-input">
        <datalist id="coverage-places"><option v-for="t in nearbyTowns" :key="t.name" :value="t.name" /></datalist>
        <button type="submit" class="btn-ghost h-9 px-3 ring-1 ring-line" :disabled="readOnly || !newPlace.trim()">Add</button>
      </form>
      <button v-if="suggestions.length && !readOnly" type="button" class="mt-2 self-start text-xs font-bold text-hela-green hover:underline" data-testid="cov-suggest" @click="addSuggested">
        + Add {{ suggestions.length }} town{{ suggestions.length === 1 ? '' : 's' }} inside the area ({{ suggestions.slice(0, 3).join(', ') }}{{ suggestions.length > 3 ? '…' : '' }})
      </button>
      <ul class="mt-2 flex max-h-56 flex-wrap content-start gap-1.5 overflow-y-auto" data-testid="cov-places">
        <li v-for="p in places" :key="p" class="inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-xs font-semibold ring-1" :class="placeOutside(p) ? 'bg-[#FFF4D6] text-[#7A5600] ring-[#F0D79A]' : 'bg-hela-green-50 text-hela-green ring-transparent'" :title="placeOutside(p) ? 'This town is outside the drawn area — it will still be served by name' : ''">
          {{ p }}
          <button v-if="!readOnly" type="button" class="grid size-5 place-items-center rounded-full hover:bg-white" :aria-label="`Remove ${p}`" @click="removePlace(p)"><AppIcon name="close" :size="11" /></button>
        </li>
        <li v-if="!places.length" class="text-xs text-muted">No places yet — add the cities and villages your riders cover.</li>
      </ul>
      <p class="mt-2 text-xs text-muted">Shoppers whose area is inside the shape, or whose town is listed here, can order from this branch. Everyone else won’t see it as available.</p>

      <ul v-if="problems.length && (polygon.length || places.length)" class="mt-3 space-y-1 rounded-lg bg-[#FFF4D6] p-2.5 text-xs text-[#7A5600]">
        <li v-for="p in problems" :key="p">• {{ p }}</li>
      </ul>
      <p v-if="error" class="mt-2 text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
      <div class="mt-auto flex gap-2 pt-4">
        <button type="button" class="btn-ghost h-10" @click="emit('cancel')">Cancel</button>
        <button type="button" class="btn-primary h-10 flex-1" :disabled="readOnly || saving || problems.length > 0" data-testid="cov-save" @click="save">{{ saving ? 'Saving…' : 'Save delivery area' }}</button>
      </div>
    </div>
  </div>
</template>
