<script setup lang="ts">
import type { AdminSessionInfo } from '~/types/admin'
import { PERMISSION_GROUPS } from '~/data/admin/permissions'
import { changeOwnPassword, mySessions, revokeMySession, sessionPolicy } from '~/services/admin/auth'

definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'My account' })

const auth = useAdminAuth()
const notify = useAdminNotify()
const sessions = ref<AdminSessionInfo[]>([])
const pw = reactive({ current: '', next: '', confirm: '' })
const pwError = ref('')
const saving = ref(false)
const rules = computed(() => staffPasswordRules(sessionPolicy().passwordMinLength, auth.user.value?.email).map((r) => ({ ...r, ok: r.test(pw.next) })))

async function loadSessions() {
  try {
    sessions.value = await auth.call(mySessions)
  } catch (e) {
    notify.error(e)
  }
}
onMounted(loadSessions)

async function changePassword() {
  pwError.value = ''
  if (rules.value.some((r) => !r.ok)) return (pwError.value = 'Your new password doesn’t meet all the rules.')
  if (pw.next !== pw.confirm) return (pwError.value = 'Passwords don’t match.')
  saving.value = true
  try {
    await auth.call((t) => changeOwnPassword(t, pw.current, pw.next))
    Object.assign(pw, { current: '', next: '', confirm: '' })
    notify.ok('Password changed. Other devices have been signed out.')
    await loadSessions()
  } catch (e) {
    pwError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

async function revoke(id: string) {
  try {
    await auth.call((t) => revokeMySession(t, id))
    await loadSessions()
  } catch (e) {
    notify.error(e)
  }
}
const when = (iso: string) => new Date(iso).toLocaleString('en-LK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const browser = (ua: string) => (/Edg\//.test(ua) ? 'Microsoft Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser') + (/Windows/.test(ua) ? ' on Windows' : /Mac OS/.test(ua) ? ' on macOS' : /Android/.test(ua) ? ' on Android' : /iPhone|iPad/.test(ua) ? ' on iOS' : '')
</script>

<template>
  <div v-if="auth.user.value">
    <AdminPageHeader title="My account" description="Your profile, access and sign-in security." />
    <div class="grid gap-4 xl:grid-cols-2">
      <section class="card p-5">
        <div class="flex items-center gap-4">
          <UserAvatar :name="auth.user.value.name" :color="auth.user.value.avatarColor" :size="56" />
          <div>
            <p class="text-lg font-extrabold text-ink">{{ auth.user.value.name }}</p>
            <p class="text-sm text-muted">{{ auth.user.value.title }} · {{ auth.user.value.email }}</p>
            <span class="chip mt-1 bg-hela-green text-hela-gold">{{ auth.user.value.roleName }}</span>
          </div>
        </div>
        <h2 class="mt-5 mb-2 text-sm font-bold text-ink">What you can do</h2>
        <ul class="space-y-2 text-sm">
          <li v-for="g in PERMISSION_GROUPS" :key="g.id">
            <p class="text-xs font-bold tracking-wide text-muted uppercase">{{ g.label }}</p>
            <p class="text-ink">
              {{ g.permissions.filter((p) => auth.can(p.id)).map((p) => p.label).join(' · ') || '—' }}
            </p>
          </li>
        </ul>
      </section>

      <div class="space-y-4">
        <section class="card p-5" aria-labelledby="pw-h">
          <h2 id="pw-h" class="mb-3 font-bold text-ink">Change password</h2>
          <form class="space-y-3" @submit.prevent="changePassword">
            <label class="block"><span class="field-label">Current password</span><input v-model="pw.current" type="password" autocomplete="current-password" class="field"></label>
            <label class="block"><span class="field-label">New password</span><input v-model="pw.next" type="password" autocomplete="new-password" class="field"></label>
            <ul class="grid gap-1 text-xs sm:grid-cols-2">
              <li v-for="r in rules" :key="r.id" class="flex items-center gap-1.5" :class="r.ok ? 'text-hela-green' : 'text-muted'"><AppIcon :name="r.ok ? 'check' : 'minus'" :size="13" :stroke-width="3" />{{ r.label }}</li>
            </ul>
            <label class="block"><span class="field-label">Confirm new password</span><input v-model="pw.confirm" type="password" autocomplete="new-password" class="field"></label>
            <p v-if="pwError" class="text-sm text-[#8A2E2E]" role="alert">{{ pwError }}</p>
            <button type="submit" class="btn-primary h-10" :disabled="saving || !pw.current">{{ saving ? 'Saving…' : 'Change password' }}</button>
          </form>
        </section>

        <section class="card p-5" aria-labelledby="sess-h">
          <h2 id="sess-h" class="mb-1 font-bold text-ink">Signed-in sessions</h2>
          <p class="mb-3 text-xs text-muted">Two-factor sign-in is on for your account. Sessions end after {{ sessionPolicy().idleMinutes }} minutes of inactivity.</p>
          <ul class="divide-y divide-line">
            <li v-for="s in sessions" :key="s.id" class="flex items-center justify-between gap-2 py-2.5 text-sm">
              <span>
                <span class="block font-semibold text-ink">{{ browser(s.userAgent) }} <span v-if="s.current" class="chip ml-1 bg-hela-green-50 text-hela-green">This device</span></span>
                <span class="block text-xs text-muted">Signed in {{ when(s.createdAt) }} · last active {{ when(s.lastSeenAt) }}</span>
              </span>
              <button v-if="!s.current" type="button" class="btn-ghost h-8 px-3 text-xs" @click="revoke(s.id)">Sign out</button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
