<script setup lang="ts">
import { listCashHandovers, recordCashHandover, type CashBalance, type CashHandover } from '~/services/admin/financeApi'
import { branchDirectory } from '~/services/admin/orderingApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'tenant', permission: 'finance.cash' })
useHead({ title: 'Cash handovers' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const balances = ref<CashBalance[]>([])
const recent = ref<CashHandover[]>([])
const branches = ref<{ id: string; name: string }[]>([])
const loading = ref(true)
const open = ref(false)
const saving = ref(false)
const error = ref('')
const form = reactive({ branchId: '', collectorName: '', amount: '', note: '' })
const canRecord = computed(() => !auth.readOnly.value)

async function load() {
  try {
    const view = await auth.call(listCashHandovers)
    balances.value = view.balances
    recent.value = view.recent
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await load()
  try {
    branches.value = await auth.call((t) => branchDirectory(t))
  } catch (e) {
    notify.error(e)
  }
})

function start(b?: CashBalance) {
  error.value = ''
  Object.assign(form, { branchId: b?.branchId ?? branches.value[0]?.id ?? '', collectorName: b?.collectorName ?? '', amount: b && b.outstandingCents > 0 ? (b.outstandingCents / 100).toFixed(2) : '', note: '' })
  open.value = true
}

async function save() {
  error.value = ''
  const amountCents = Math.round(Number(form.amount) * 100)
  if (!form.amount || !Number.isFinite(amountCents) || amountCents === 0) {
    error.value = 'Enter the amount handed in.'
    return
  }
  saving.value = true
  try {
    await auth.call((t) => recordCashHandover(t, { branchId: form.branchId, collectorName: form.collectorName, amountCents, note: form.note }))
    notify.ok(`${formatLKR(amountCents)} recorded for ${form.collectorName}`)
    open.value = false
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
</script>

<template>
  <div>
    <AdminPageHeader title="Cash handovers" description="Cash on delivery each rider or counter officer collected, and what they’ve handed in at the branch.">
      <button v-if="canRecord" type="button" class="btn-primary h-10" data-testid="record-handover" @click="start()"><AppIcon name="plus" :size="17" />Record handover</button>
    </AdminPageHeader>

    <section class="card overflow-x-auto p-0" aria-label="Cash not handed in yet">
      <h2 class="px-4 pt-4 font-bold text-ink">Not handed in yet</h2>
      <p v-if="loading" class="p-4 text-sm text-muted">Loading…</p>
      <p v-else-if="!balances.length" class="p-4 text-sm text-muted">Everyone’s cash is handed in.</p>
      <table v-else class="mt-3 w-full text-left text-sm">
        <thead class="bg-hela-green-50/50 text-xs text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 font-bold">Branch</th>
            <th scope="col" class="px-4 py-2 font-bold">Collected by</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Collected</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Handed in</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Not handed in</th>
            <th v-if="canRecord" scope="col" class="px-4 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in balances" :key="`${b.branchId}-${b.collectorName}`" class="border-t border-line" data-testid="cash-balance">
            <td class="px-4 py-2.5">{{ b.branchName }}</td>
            <td class="px-4 py-2.5 font-semibold text-ink">{{ b.collectorName }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ formatLKR(b.collectedCents) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ formatLKR(b.handedInCents) }}</td>
            <td class="px-4 py-2.5 text-right font-bold tabular-nums" :class="b.outstandingCents < 0 ? 'text-[#8A2E2E]' : 'text-ink'">{{ formatLKR(b.outstandingCents) }}</td>
            <td v-if="canRecord" class="px-4 py-2.5 text-right"><button type="button" class="btn-ghost h-8 px-2.5 text-xs" @click="start(b)">Record</button></td>
          </tr>
        </tbody>
      </table>
      <p class="px-4 py-3 text-xs text-muted">A negative figure means more was handed in than recorded as collected.</p>
    </section>

    <section class="card mt-4 overflow-x-auto p-0" aria-label="Recent handovers">
      <h2 class="px-4 pt-4 font-bold text-ink">Recent handovers</h2>
      <p v-if="!recent.length" class="p-4 text-sm text-muted">No handovers recorded yet.</p>
      <table v-else class="mt-3 w-full text-left text-sm">
        <thead class="bg-hela-green-50/50 text-xs text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 font-bold">When</th>
            <th scope="col" class="px-4 py-2 font-bold">Branch</th>
            <th scope="col" class="px-4 py-2 font-bold">Handed in by</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Amount</th>
            <th scope="col" class="px-4 py-2 font-bold">Recorded by</th>
            <th scope="col" class="px-4 py-2 font-bold">Note</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in recent" :key="h.id" class="border-t border-line">
            <td class="px-4 py-2.5 whitespace-nowrap">{{ fmt(h.at) }}</td>
            <td class="px-4 py-2.5">{{ h.branchName }}</td>
            <td class="px-4 py-2.5">{{ h.collectorName }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums" :class="h.amountCents < 0 ? 'text-[#8A2E2E]' : ''">{{ formatLKR(h.amountCents) }}</td>
            <td class="px-4 py-2.5">{{ h.recordedBy }}</td>
            <td class="px-4 py-2.5 text-muted">{{ h.note ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <AdminModal :open="open" title="Record a cash handover" description="Handovers can’t be edited. To fix a mistake, record a negative amount with a note." size="sm" @close="open = false">
      <form id="handover-form" class="space-y-3" @submit.prevent="save">
        <label class="block"><span class="field-label">Branch</span>
          <select v-model="form.branchId" class="field" required><option v-for="b in branches" :key="b.id" :value="b.id">{{ b.name }}</option></select>
        </label>
        <label class="block"><span class="field-label">Handed in by</span><input v-model="form.collectorName" class="field" maxlength="120" required data-autofocus data-testid="handover-collector"></label>
        <label class="block"><span class="field-label">Amount (Rs.)</span><input v-model="form.amount" class="field" inputmode="decimal" required data-testid="handover-amount"></label>
        <label class="block"><span class="field-label">Note (needed for a correction)</span><input v-model="form.note" class="field" maxlength="200"></label>
        <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="open = false">Cancel</button>
        <button type="submit" form="handover-form" class="btn-primary h-9" :disabled="saving" data-testid="handover-save">{{ saving ? 'Saving…' : 'Record handover' }}</button>
      </template>
    </AdminModal>
  </div>
</template>
