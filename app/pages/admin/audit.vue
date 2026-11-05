<script setup lang="ts">
import type { AuditEntry, TableColumn } from '~/types/admin'
import { listAudit } from '~/services/admin/common'

type Entry = AuditEntry & { tenantName: string | null }

definePageMeta({ layout: 'admin', middleware: 'admin', superAdminOnly: true, permission: { platform: 'platform.audit.view', tenant: 'audit.view' } })
useHead({ title: 'Audit log' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const entries = ref<Entry[]>([])
const org = ref('all')
const loading = ref(true)
const severity = ref<'all' | 'warning' | 'critical'>('all')
const area = ref('all')

const TECHNICAL_ACTIONS = ['auth.', 'access.denied', 'report.chat']
const businessEntries = computed(() => entries.value.filter((e) => !TECHNICAL_ACTIONS.some((prefix) => e.action.startsWith(prefix))))
const orgs = computed(() => [...new Set(businessEntries.value.map((e) => e.tenantName ?? 'HelaMart platform'))].sort())

async function load() {
  loading.value = true
  try {
    entries.value = await auth.call(listAudit)
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

const AREAS = ['tenant', 'branch', 'order', 'product', 'inventory', 'category', 'customer', 'promotion', 'task', 'staff', 'role', 'settings', 'platform', 'banner', 'branding', 'cash', 'commission', 'finance', 'media', 'report', 'review', 'workflow']
const ACTION_VERBS: Record<string, string> = {
  approve: 'approved',
  ban: 'banned',
  cancel: 'cancelled',
  complete: 'completed',
  create: 'created',
  delete: 'deleted',
  hide: 'hidden',
  reject: 'rejected',
  remove: 'removed',
  restrict: 'restricted',
  resume: 'resumed',
  show: 'made visible',
  suspend: 'suspended',
  update: 'updated',
  withdraw: 'withdrawn',
}
const ACTION_LABELS: Record<string, string> = {
  'platform.manage_start': 'Started managing supermarket',
  'platform.manage_stop': 'Stopped managing supermarket',
  'report.export': 'Exported report',
}
function actionLabel(action: string) {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const words = action.split(/[._]/)
  const last = words.pop()!
  const label = [...words, ACTION_VERBS[last] ?? last].join(' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const rows = computed(() =>
  businessEntries.value.filter(
    (e) => (severity.value === 'all' || e.severity === severity.value || (severity.value === 'warning' && e.severity === 'critical')) && (area.value === 'all' || e.action.startsWith(area.value)) &&
      (org.value === 'all' || (e.tenantName ?? 'HelaMart platform') === org.value),
  ),
)
const columns: TableColumn[] = [
  { key: 'at', label: 'When', sortable: true },
  { key: 'actorName', label: 'Who', sortable: true },
  ...(auth.isPlatform.value ? [{ key: 'tenantName', label: 'Supermarket', sortable: true, value: (e: Entry) => e.tenantName ?? 'HelaMart platform' }] : []),
  { key: 'action', label: 'Action', sortable: true },
  { key: 'target', label: 'Target' },
  { key: 'details', label: 'Details', value: (e: AuditEntry) => e.details ?? '' },
  { key: 'severity', label: 'Level', sortable: true },
]
const when = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit' })

function exportCsv() {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = ['When,Who,Action,Target,Details,Level', ...rows.value.map((e) => [e.at, e.actorName, actionLabel(e.action), e.target, e.details ?? '', e.severity].map(esc).join(','))].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `helamart-audit-${new Date().toISOString().slice(0, 10)}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div>
    <AdminPageHeader title="Business audit log" description="Business changes and operational actions by staff, with who did them and when. Entries can’t be edited or deleted.">
      <button type="button" class="btn-ghost h-10" @click="load"><AppIcon name="refresh" :size="16" />Refresh</button>
      <button type="button" class="btn-ghost h-10" :disabled="!rows.length" @click="exportCsv"><AppIcon name="copy" :size="16" />Export CSV</button>
    </AdminPageHeader>
    <AdminDataTable :rows="rows" :columns="columns" row-key="id" :loading="loading" :page-size="20" search-placeholder="Search person, action or target…" :initial-sort="{ key: 'at', dir: 'desc' }">
      <template #toolbar>
        <select v-if="auth.isPlatform.value" v-model="org" class="field w-auto" aria-label="Supermarket"><option value="all">All organisations</option><option v-for="o in orgs" :key="o" :value="o">{{ o }}</option></select>
        <select v-model="area" class="field w-auto" aria-label="Area"><option value="all">All areas</option><option v-for="a in AREAS" :key="a" :value="a">{{ a }}</option></select>
        <select v-model="severity" class="field w-auto" aria-label="Level"><option value="all">All levels</option><option value="warning">Warnings & critical</option><option value="critical">Critical only</option></select>
      </template>
      <template #cell-at="{ row }"><span class="whitespace-nowrap text-xs text-muted">{{ when(row.at) }}</span></template>
      <template #cell-actorName="{ row }"><span class="font-semibold text-ink">{{ row.actorName }}</span></template>
      <template #cell-tenantName="{ row }"><span class="text-xs text-muted">{{ row.tenantName ?? 'HelaMart platform' }}</span></template>
      <template #cell-action="{ row }"><span class="text-sm font-medium text-ink">{{ actionLabel(row.action) }}</span></template>
      <template #cell-details="{ row }"><span class="text-xs text-muted">{{ row.details }}</span></template>
      <template #cell-severity="{ row }"><AdminBadge :value="row.severity" /></template>
    </AdminDataTable>
  </div>
</template>
