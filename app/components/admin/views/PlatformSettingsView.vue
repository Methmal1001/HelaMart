<script setup lang="ts">
import type { PlatformSettings } from '~/types/admin'
import { ROLE_IDS } from '~/data/admin/permissions'
import { getPlatformSettings, resetSampleData, updatePlatformSettings } from '~/services/admin/platformApi'

const auth = useAdminAuth()
const notify = useAdminNotify()
const { confirm } = useAdminConfirm()
const s = ref<PlatformSettings | null>(null)
const error = ref('')
const saving = ref(false)
const iAmSuper = computed(() => auth.user.value?.roleId === ROLE_IDS.superAdmin)

onMounted(async () => {
  try {
    s.value = await auth.call(getPlatformSettings)
  } catch (e) {
    notify.error(e)
  }
})

async function save() {
  if (!s.value) return
  error.value = ''
  saving.value = true
  try {
    const next: PlatformSettings = { ...s.value, defaultCommissionPercent: Number(s.value.defaultCommissionPercent), security: { ...s.value.security } }
    for (const k of Object.keys(next.security) as (keyof PlatformSettings['security'])[]) if (k !== 'require2fa') (next.security[k] as number) = Number(next.security[k])
    s.value = await auth.call((t) => updatePlatformSettings(t, next), 'Changing platform settings needs your password confirmed.')
    notify.ok('Platform settings saved')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function reset() {
  const r = await confirm({ title: 'Reset all sample data?', message: 'Every supermarket, branch, staff account, order and log returns to the original sample data. Everyone (including you) is signed out.', confirmLabel: 'Reset sample data', tone: 'danger' })
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
    <AdminPageHeader title="Platform settings" description="HelaMart-wide policy. Security rules apply to every staff account in every supermarket." />
    <form v-if="s" class="grid gap-4 xl:grid-cols-2" @submit.prevent="save">
      <section class="card space-y-3 p-5" aria-labelledby="p-h">
        <h2 id="p-h" class="font-bold text-ink">Platform & partners</h2>
        <label class="block"><span class="field-label">Platform name</span><input v-model="s.platformName" class="field" maxlength="40"></label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block"><span class="field-label">Partner support email</span><input v-model="s.supportEmail" type="email" class="field"></label>
          <label class="block"><span class="field-label">Partner hotline</span><input v-model="s.supportHotline" class="field"></label>
          <label class="block"><span class="field-label">Default commission (%)</span><input v-model.number="s.defaultCommissionPercent" type="number" step="0.5" min="0" max="20" class="field"></label>
        </div>
        <label class="flex items-start gap-2.5 text-sm">
          <input v-model="s.applicationsOpen" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
          <span>Accept new supermarket applications <span class="block text-xs text-muted">When off, the public “Register your supermarket” form is closed.</span></span>
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
