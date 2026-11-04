<script setup lang="ts">
import { listCommission, recordCommissionPayment, type CommissionBalance, type CommissionPayment } from '~/services/admin/financeApi'

definePageMeta({ layout: 'admin', middleware: 'admin', scope: 'platform', permission: 'platform.finance' })
useHead({ title: 'Commission' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const balances = ref<CommissionBalance[]>([])
const recent = ref<CommissionPayment[]>([])
const loading = ref(true)
const paying = ref<CommissionBalance | null>(null)
const saving = ref(false)
const error = ref('')
const form = reactive({ paidOn: '', amount: '', reference: '', note: '' })
const totalDue = computed(() => balances.value.reduce((n, b) => n + b.dueCents, 0))
const totalOutstanding = computed(() => balances.value.reduce((n, b) => n + b.outstandingCents, 0))

async function load() {
  try {
    const view = await auth.call(listCommission)
    balances.value = view.balances
    recent.value = view.recent
  } catch (e) {
    notify.error(e)
  } finally {
    loading.value = false
  }
}
onMounted(load)

function pay(b: CommissionBalance) {
  error.value = ''
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  Object.assign(form, { paidOn: today, amount: b.dueCents > 0 ? (b.dueCents / 100).toFixed(2) : '', reference: '', note: '' })
  paying.value = b
}

async function save() {
  const b = paying.value
  if (!b) return
  error.value = ''
  const amountCents = Math.round(Number(form.amount) * 100)
  if (!form.amount || !Number.isFinite(amountCents) || amountCents === 0) {
    error.value = 'Enter the amount paid.'
    return
  }
  saving.value = true
  try {
    await auth.call((t) => recordCommissionPayment(t, { tenantId: b.tenantId, paidOn: form.paidOn, amountCents, reference: form.reference, note: form.note }), 'Recording a commission payment needs your password confirmed.')
    notify.ok(`${formatLKR(amountCents)} recorded for ${b.tenantName}`)
    paying.value = null
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Commission" description="What each supermarket owes HelaMart. Commission uses the rate saved on each order, and is reversed when an order is cancelled or refunded." />

    <div class="mb-4 grid gap-3 sm:grid-cols-2">
      <div class="card p-4"><p class="text-xs text-muted">Overdue (finished months)</p><p class="text-xl font-extrabold text-ink" data-testid="total-due">{{ formatLKR(totalDue) }}</p></div>
      <div class="card p-4"><p class="text-xs text-muted">Outstanding (including this month)</p><p class="text-xl font-extrabold text-ink">{{ formatLKR(totalOutstanding) }}</p></div>
    </div>

    <section class="card overflow-x-auto p-0" aria-label="Commission by supermarket">
      <p v-if="loading" class="p-4 text-sm text-muted">Loading…</p>
      <p v-else-if="!balances.length" class="p-4 text-sm text-muted">No commission yet.</p>
      <table v-else class="w-full text-left text-sm">
        <thead class="bg-hela-green-50/50 text-xs text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 font-bold">Supermarket</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Rate now</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Commission to date</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Paid</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Outstanding</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Overdue</th>
            <th scope="col" class="px-4 py-2 font-bold">Last payment</th>
            <th scope="col" class="px-4 py-2"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in balances" :key="b.tenantId" class="border-t border-line" data-testid="commission-row">
            <td class="px-4 py-2.5 font-semibold text-ink">{{ b.tenantName }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ b.commissionPercent }}%</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ formatLKR(b.chargedCents - b.reversedCents) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ formatLKR(b.paidCents) }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums">{{ formatLKR(b.outstandingCents) }}</td>
            <td class="px-4 py-2.5 text-right font-bold tabular-nums" :class="b.dueCents > 0 ? 'text-[#8A2E2E]' : 'text-ink'">{{ formatLKR(b.dueCents) }}</td>
            <td class="px-4 py-2.5 whitespace-nowrap text-muted">{{ b.lastPaidOn ? `${b.lastPaidOn} · ${b.lastReference}` : '—' }}</td>
            <td class="px-4 py-2.5 text-right"><button type="button" class="btn-ghost h-8 px-2.5 text-xs" :data-testid="`pay-${b.tenantId}`" @click="pay(b)">Record payment</button></td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="card mt-4 overflow-x-auto p-0" aria-label="Recent payments">
      <h2 class="px-4 pt-4 font-bold text-ink">Recent payments</h2>
      <p v-if="!recent.length" class="p-4 text-sm text-muted">No payments recorded yet.</p>
      <table v-else class="mt-3 w-full text-left text-sm">
        <thead class="bg-hela-green-50/50 text-xs text-muted">
          <tr>
            <th scope="col" class="px-4 py-2 font-bold">Paid on</th>
            <th scope="col" class="px-4 py-2 font-bold">Supermarket</th>
            <th scope="col" class="px-4 py-2 text-right font-bold">Amount</th>
            <th scope="col" class="px-4 py-2 font-bold">Reference</th>
            <th scope="col" class="px-4 py-2 font-bold">Recorded by</th>
            <th scope="col" class="px-4 py-2 font-bold">Note</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in recent" :key="p.id" class="border-t border-line">
            <td class="px-4 py-2.5 whitespace-nowrap">{{ p.paidOn }}</td>
            <td class="px-4 py-2.5">{{ p.tenantName }}</td>
            <td class="px-4 py-2.5 text-right tabular-nums" :class="p.amountCents < 0 ? 'text-[#8A2E2E]' : ''">{{ formatLKR(p.amountCents) }}</td>
            <td class="px-4 py-2.5">{{ p.reference }}</td>
            <td class="px-4 py-2.5">{{ p.recordedBy }}</td>
            <td class="px-4 py-2.5 text-muted">{{ p.note ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <AdminModal :open="!!paying" :title="`Record a payment — ${paying?.tenantName ?? ''}`" description="Payments can’t be edited. To fix a mistake, record a negative amount with a note." size="sm" @close="paying = null">
      <form id="payment-form" class="space-y-3" @submit.prevent="save">
        <label class="block"><span class="field-label">Paid on</span><input v-model="form.paidOn" type="date" class="field" required></label>
        <label class="block"><span class="field-label">Amount (Rs.)</span><input v-model="form.amount" class="field" inputmode="decimal" required data-testid="payment-amount"></label>
        <label class="block"><span class="field-label">Payment reference</span><input v-model="form.reference" class="field" maxlength="60" required data-testid="payment-reference"></label>
        <label class="block"><span class="field-label">Note (needed for a correction)</span><input v-model="form.note" class="field" maxlength="200"></label>
        <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn-ghost h-9" @click="paying = null">Cancel</button>
        <button type="submit" form="payment-form" class="btn-primary h-9" :disabled="saving" data-testid="payment-save">{{ saving ? 'Saving…' : 'Record payment' }}</button>
      </template>
    </AdminModal>
  </div>
</template>
