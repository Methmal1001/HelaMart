<script setup lang="ts">
import type { StoreSettings } from '~/types/admin'
import { ROLE_IDS } from '~/data/admin/permissions'
import { getSettings, resetSampleData, updateSettings } from '~/services/admin/api'

definePageMeta({ layout: 'admin', middleware: 'admin', permission: 'settings.manage' })
useHead({ title: 'Settings' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const s = ref<StoreSettings | null>(null)
const feeRs = ref('')
const error = ref('')
const saving = ref(false)
const iAmSuper = computed(() => auth.user.value?.roleId === ROLE_IDS.superAdmin)

onMounted(async () => {
  try {
    s.value = await auth.call(getSettings)
    feeRs.value = (s.value.deliveryFeeCents / 100).toFixed(2)
  } catch (e) {
    notify.error(e)
  }
})

async function save() {
  if (!s.value) return
  error.value = ''
  saving.value = true
  try {
    const next = { ...s.value, deliveryFeeCents: Math.round(Number.parseFloat(feeRs.value) * 100), security: { ...s.value.security } }
    for (const k of Object.keys(next.security) as (keyof StoreSettings['security'])[]) if (k !== 'require2fa') (next.security[k] as number) = Number(next.security[k])
    s.value = await auth.call((t) => updateSettings(t, next), 'Changing settings needs your password confirmed.')
    notify.ok('Settings saved')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function reset() {
  const r = await confirm({ title: 'Reset all admin sample data?', message: 'Orders, products, staff, roles, offers, tasks and the audit log return to the original sample data. Everyone (including you) is signed out.', confirmLabel: 'Reset sample data', tone: 'danger' })
  if (!r.ok) return
  try {
    await auth.call(resetSampleData, 'Resetting data needs your password confirmed.')
    await auth.logout('Sample data was reset. Sign in again.')
  } catch (e) {
    notify.error(e)
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Settings" description="Store details and the security policy for every staff account." />
    <form v-if="s" class="grid gap-4 xl:grid-cols-2" @submit.prevent="save">
      <section class="card space-y-3 p-5" aria-labelledby="store-h">
        <h2 id="store-h" class="font-bold text-ink">Store</h2>
        <label class="block"><span class="field-label">Store name</span><input v-model="s.storeName" class="field" maxlength="60"></label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block"><span class="field-label">Hotline</span><input v-model="s.hotline" class="field" maxlength="30"></label>
          <label class="block"><span class="field-label">Support email</span><input v-model="s.supportEmail" type="email" class="field" maxlength="80"></label>
          <label class="block"><span class="field-label">Opening hours</span><input v-model="s.openingHours" class="field" maxlength="80"></label>
          <label class="block"><span class="field-label">Same-day order cut-off</span><input v-model="s.orderCutoffTime" type="time" class="field"></label>
          <label class="block"><span class="field-label">Delivery fee (Rs.)</span><input v-model="feeRs" class="field" inputmode="decimal"></label>
        </div>
        <label class="flex items-start gap-2.5 text-sm">
          <input v-model="s.maintenanceMode" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
          <span>Maintenance mode <span class="block text-xs text-muted">Shows a notice to shoppers and pauses checkout (applies once connected to the live store).</span></span>
        </label>
      </section>

      <section class="card space-y-3 p-5" aria-labelledby="sec-h">
        <h2 id="sec-h" class="flex items-center gap-2 font-bold text-ink"><AppIcon name="shield" :size="18" class="text-hela-green" />Security policy</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block"><span class="field-label">Sign out after inactivity (min)</span><input v-model.number="s.security.sessionIdleMinutes" type="number" min="5" max="60" class="field"></label>
          <label class="block"><span class="field-label">Maximum session length (hours)</span><input v-model.number="s.security.sessionMaxHours" type="number" min="1" max="24" class="field"></label>
          <label class="block"><span class="field-label">Failed sign-ins before lockout</span><input v-model.number="s.security.maxLoginAttempts" type="number" min="3" max="10" class="field"></label>
          <label class="block"><span class="field-label">Lockout duration (min)</span><input v-model.number="s.security.lockoutMinutes" type="number" min="1" max="120" class="field"></label>
          <label class="block"><span class="field-label">Minimum password length</span><input v-model.number="s.security.passwordMinLength" type="number" min="10" max="64" class="field"></label>
          <label class="block"><span class="field-label">Password expiry (days, 0 = never)</span><input v-model.number="s.security.passwordExpiryDays" type="number" min="0" max="365" class="field"></label>
        </div>
        <label class="flex items-start gap-2.5 text-sm">
          <input v-model="s.security.require2fa" type="checkbox" class="mt-0.5 size-4 accent-hela-green" :disabled="!iAmSuper">
          <span>Require two-factor sign-in for all staff <span class="block text-xs text-muted">{{ iAmSuper ? 'Strongly recommended — keep this on.' : 'Only a Super Admin can change this.' }}</span></span>
        </label>
      </section>

      <div class="flex flex-wrap items-center gap-3 xl:col-span-2">
        <button type="submit" class="btn-primary h-10" :disabled="saving">{{ saving ? 'Saving…' : 'Save settings' }}</button>
        <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
        <button v-if="iAmSuper" type="button" class="btn-ghost ml-auto h-10 text-[#8A2E2E]" @click="reset"><AppIcon name="refresh" :size="16" />Reset sample data</button>
      </div>
    </form>
    <p v-else class="text-sm text-muted">Loading settings…</p>
  </div>
</template>
