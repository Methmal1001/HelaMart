<script setup lang="ts">
import { getChainSettings, updateChainSettings, type ChainSettings } from '~/services/admin/tenantApi'

const auth = useAdminAuth()
const notify = useAdminNotify()
const info = ref<Awaited<ReturnType<typeof getChainSettings>> | null>(null)
const f = reactive({ name: '', hotline: '', supportEmail: '', defaultHours: '', deliveryRs: '', minOrderRs: '', brandColor: '#174D38' })
const error = ref('')
const saving = ref(false)

onMounted(async () => {
  try {
    info.value = await auth.call(getChainSettings)
    Object.assign(f, { ...info.value, deliveryRs: (info.value.deliveryFeeCents / 100).toFixed(2), minOrderRs: (info.value.minOrderCents / 100).toFixed(2) })
  } catch (e) {
    notify.error(e)
  }
})

async function save() {
  error.value = ''
  saving.value = true
  const next: ChainSettings = {
    name: f.name, hotline: f.hotline, supportEmail: f.supportEmail, defaultHours: f.defaultHours, brandColor: f.brandColor,
    deliveryFeeCents: Math.round(Number.parseFloat(f.deliveryRs) * 100), minOrderCents: Math.round(Number.parseFloat(f.minOrderRs) * 100),
  }
  try {
    await auth.call((t) => updateChainSettings(t, next), 'Changing supermarket settings needs your password confirmed.')
    notify.ok('Settings saved')
    await auth.refreshMe()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <AdminPageHeader title="Supermarket settings" description="Your chain’s details shown to shoppers, and default delivery terms for every branch." />
    <form v-if="info" class="grid gap-4 xl:grid-cols-[1.4fr_1fr]" @submit.prevent="save">
      <section class="card space-y-3 p-5">
        <h2 class="font-bold text-ink">Store details</h2>
        <label class="block"><span class="field-label">Supermarket name (shown to shoppers)</span><input v-model="f.name" class="field" maxlength="60" :disabled="auth.readOnly.value"></label>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block"><span class="field-label">Customer hotline</span><input v-model="f.hotline" class="field" :disabled="auth.readOnly.value"></label>
          <label class="block"><span class="field-label">Support email</span><input v-model="f.supportEmail" type="email" class="field" :disabled="auth.readOnly.value"></label>
          <label class="block"><span class="field-label">Default opening hours</span><input v-model="f.defaultHours" class="field" :disabled="auth.readOnly.value"></label>
          <label class="flex items-center gap-3"><span class="field-label mb-0">Brand colour</span><input v-model="f.brandColor" type="color" class="h-9 w-14 rounded border-0" :disabled="auth.readOnly.value"></label>
          <label class="block"><span class="field-label">Delivery fee (Rs.)</span><input v-model="f.deliveryRs" class="field" inputmode="decimal" :disabled="auth.readOnly.value"></label>
          <label class="block"><span class="field-label">Minimum order (Rs.)</span><input v-model="f.minOrderRs" class="field" inputmode="decimal" :disabled="auth.readOnly.value"></label>
        </div>
        <div class="flex items-center gap-3 pt-1">
          <button type="submit" class="btn-primary h-10" :disabled="saving || auth.readOnly.value">{{ saving ? 'Saving…' : 'Save settings' }}</button>
          <p v-if="error" class="text-sm text-[#8A2E2E]" role="alert">{{ error }}</p>
        </div>
      </section>
      <section class="card space-y-2 p-5 text-sm">
        <h2 class="font-bold text-ink">Your HelaMart partnership</h2>
        <p class="flex items-center gap-2"><span class="text-muted">Status</span><AdminBadge :value="info.status" /></p>
        <p v-if="info.statusReason" class="rounded-lg bg-[#FFF4D6] p-2.5 text-xs text-[#7A5600]">{{ info.statusReason }}</p>
        <p><span class="text-muted">Partner reference</span> <b>{{ info.reference }}</b></p>
        <p><span class="text-muted">Plan</span> <b class="capitalize">{{ info.plan }}</b> · <span class="text-muted">commission</span> <b>{{ info.commissionPercent }}%</b></p>
        <p class="pt-2 text-xs text-muted">Plan, commission and account status are managed by HelaMart. Contact partner support to change them.</p>
      </section>
    </form>
    <p v-else class="text-sm text-muted">Loading settings…</p>
  </div>
</template>
