<script setup lang="ts">
import { ApiError } from '~/services/apiError'

/** Global admin dialogs: confirmations, password step-up and the inactivity warning. */
const { current, settle } = useAdminConfirm()
const auth = useAdminAuth()

// ---- confirm
const reason = ref('')
watch(current, () => (reason.value = ''))
function ok() {
  if (current.value?.reasonLabel && !reason.value.trim()) return
  settle(true, reason.value.trim())
}

// ---- step-up
const password = ref('')
const stepError = ref('')
const stepBusy = ref(false)
watch(auth.stepUp, (v) => {
  password.value = ''
  stepError.value = ''
  void v
})
async function confirmPassword() {
  if (!password.value) return
  stepBusy.value = true
  stepError.value = ''
  try {
    await auth.confirmStepUp(password.value)
  } catch (e) {
    stepError.value = e instanceof ApiError ? e.message : 'Could not confirm your password.'
  } finally {
    stepBusy.value = false
    password.value = ''
  }
}
</script>

<template>
  <AdminModal :open="!!current" :title="current?.title ?? ''" size="sm" @close="settle(false)">
    <p class="text-sm text-muted">{{ current?.message }}</p>
    <label v-if="current?.reasonLabel" class="mt-4 block">
      <span class="field-label">{{ current.reasonLabel }}</span>
      <textarea v-model="reason" rows="3" maxlength="200" class="field h-auto py-2" data-autofocus />
      <span class="mt-1 block text-xs text-muted">Saved in the audit log.</span>
    </label>
    <template #footer>
      <button type="button" class="btn-ghost h-9" @click="settle(false)">Cancel</button>
      <button
        type="button"
        class="btn h-9 text-white"
        :class="current?.tone === 'danger' ? 'bg-[#8A2E2E] hover:bg-[#6f2424]' : 'bg-hela-green hover:bg-hela-green-900'"
        :disabled="!!current?.reasonLabel && !reason.trim()"
        @click="ok"
      >
        {{ current?.confirmLabel ?? 'Confirm' }}
      </button>
    </template>
  </AdminModal>

  <AdminModal :open="!!auth.stepUp.value" title="Confirm it’s you" :description="auth.stepUp.value?.reason" size="sm" @close="auth.cancelStepUp()">
    <form id="stepup-form" class="space-y-3" @submit.prevent="confirmPassword">
      <p class="flex gap-2 rounded-lg bg-hela-gold-100/70 p-3 text-xs text-[#6d5622]">
        <AppIcon name="shield" :size="16" class="shrink-0" />
        This is a sensitive action. Re-enter your password — it stays confirmed for 5 minutes.
      </p>
      <label class="block">
        <span class="field-label">Password</span>
        <input v-model="password" type="password" autocomplete="current-password" class="field" data-autofocus>
      </label>
      <p v-if="stepError" class="text-xs text-[#8A2E2E]" role="alert">{{ stepError }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn-ghost h-9" @click="auth.cancelStepUp()">Cancel</button>
      <button type="submit" form="stepup-form" class="btn-primary h-9" :disabled="stepBusy || !password">{{ stepBusy ? 'Checking…' : 'Confirm' }}</button>
    </template>
  </AdminModal>

  <AdminModal :open="auth.idleWarning.value !== null" title="Are you still there?" size="sm" persistent @close="auth.stayActive()">
    <p class="text-sm text-muted">
      For security you’ll be signed out in <b class="text-ink tabular-nums">{{ auth.idleWarning.value }}</b> seconds because of inactivity.
    </p>
    <template #footer>
      <button type="button" class="btn-ghost h-9" @click="auth.logout('You signed out.')">Sign out now</button>
      <button type="button" class="btn-primary h-9" data-autofocus @click="auth.stayActive()">Stay signed in</button>
    </template>
  </AdminModal>
</template>
