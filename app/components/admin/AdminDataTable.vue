<script setup lang="ts" generic="T extends Record<string, any>">
/** Searchable, sortable, paginated table with per-cell slots (`#cell-<key>`). */
import type { TableColumn as Column } from '~/types/admin'

const props = withDefaults(
  defineProps<{
    rows: T[]
    columns: Column[]
    rowKey: string
    searchPlaceholder?: string
    pageSize?: number
    loading?: boolean
    emptyText?: string
    clickable?: boolean
    initialSort?: { key: string; dir: 'asc' | 'desc' }
  }>(),
  { searchPlaceholder: 'Search…', pageSize: 12, loading: false, emptyText: 'Nothing here yet.', clickable: false },
)
const emit = defineEmits<{ rowClick: [row: T] }>()

const query = ref('')
const sort = ref(props.initialSort ?? null)
const page = ref(1)

const valueOf = (row: T, col: Column) => (col.value ? col.value(row) : row[col.key])

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  let list = props.rows
  if (q) list = list.filter((r) => props.columns.some((c) => String(valueOf(r, c) ?? '').toLowerCase().includes(q)))
  if (sort.value) {
    const col = props.columns.find((c) => c.key === sort.value!.key)
    if (col) {
      const dir = sort.value.dir === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        const x = valueOf(a, col)
        const y = valueOf(b, col)
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir
      })
    }
  }
  return list
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / props.pageSize)))
const visible = computed(() => filtered.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize))
watch([query, () => props.rows.length], () => (page.value = 1))

function toggleSort(col: Column) {
  if (!col.sortable) return
  sort.value = sort.value?.key === col.key ? { key: col.key, dir: sort.value.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="flex flex-wrap items-center gap-2 border-b border-line p-3">
      <label class="relative min-w-52 flex-1">
        <span class="sr-only">{{ searchPlaceholder }}</span>
        <AppIcon name="search" :size="16" class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <input v-model="query" type="search" class="field pl-9" :placeholder="searchPlaceholder">
      </label>
      <slot name="toolbar" />
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="bg-cream/70 text-xs text-muted">
          <tr>
            <th
              v-for="c in columns"
              :key="c.key"
              scope="col"
              class="px-4 py-2.5 font-semibold whitespace-nowrap"
              :class="[c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '', c.class]"
              :aria-sort="sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined"
            >
              <button v-if="c.sortable" type="button" class="inline-flex items-center gap-1 hover:text-ink" @click="toggleSort(c)">
                {{ c.label }}
                <span aria-hidden="true" class="text-[0.6rem]">{{ sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕' }}</span>
              </button>
              <template v-else>{{ c.label }}</template>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <tr v-if="loading">
            <td :colspan="columns.length" class="px-4 py-10 text-center text-muted">Loading…</td>
          </tr>
          <tr v-else-if="!visible.length">
            <td :colspan="columns.length" class="px-4 py-10 text-center text-muted">{{ query ? `No results for “${query}”.` : emptyText }}</td>
          </tr>
          <tr
            v-for="row in visible"
            v-else
            :key="row[rowKey]"
            class="transition"
            :class="clickable ? 'cursor-pointer hover:bg-hela-green-50/60' : ''"
            :tabindex="clickable ? 0 : undefined"
            @click="clickable && emit('rowClick', row)"
            @keydown.enter="clickable && emit('rowClick', row)"
          >
            <td v-for="c in columns" :key="c.key" class="px-4 py-3 align-middle" :class="[c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : '', c.class]">
              <slot :name="`cell-${c.key}`" :row="row">{{ row[c.key] }}</slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-muted">
      <span>{{ filtered.length }} {{ filtered.length === 1 ? 'record' : 'records' }}</span>
      <div v-if="pages > 1" class="flex items-center gap-1">
        <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :disabled="page === 1" aria-label="Previous page" @click="page--">
          <AppIcon name="arrow-left" :size="14" />
        </button>
        <span class="px-2 tabular-nums">Page {{ page }} of {{ pages }}</span>
        <button type="button" class="btn-ghost h-8 px-2.5 text-xs" :disabled="page === pages" aria-label="Next page" @click="page++">
          <AppIcon name="arrow-right" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>
