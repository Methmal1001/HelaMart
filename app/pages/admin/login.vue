<script setup lang="ts">
import { ApiError } from '~/services/apiError'
import { demoAuthenticatorCode, sessionPolicy } from '~/services/admin/auth'
import { SEED_PASSWORDS } from '~/data/admin/seed'

definePageMeta({ layout: false })
useHead({ title: 'Sign in · HelaMart Admin', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const auth = useAdminAuth()
const route = useRoute()
const demoMode = useRuntimeConfig().public.adminDemoMode

type Step = 'credentials' | 'mfa' | 'password'
const step = ref<Step>('credentials')
const email = ref('')
const password = ref('')
const code = ref('')
const newPassword = ref('')
const confirm = ref('')
const challengeId = ref('')
const busy = ref(false)
const error = ref('')
const passwordReason = ref<'new' | 'expired'>('new')
const demo = ref<{ code: string; secondsLeft: number; email: string } | null>(null)
let demoTimer: ReturnType<typeof setInterval> | null = null

const rules = computed(() => staffPasswordRules(sessionPolicy().passwordMinLength, email.value).map((r) => ({ ...r, ok: r.test(newPassword.value) })))

/** Only ever redirect inside the admin area (prevents open redirects). */
function safeRedirect() {
  const r = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  return r.startsWith('/admin') && !r.startsWith('//') && !r.startsWith('/admin/login') ? r : '/admin'
}

onMounted(async () => {
  await auth.restore()
  if (auth.isAuthenticated.value) await navigateTo(safeRedirect(), { replace: true })
})
onBeforeUnmount(() => demoTimer && clearInterval(demoTimer))

function fail(e: unknown) {
  error.value = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.'
}

async function submitCredentials() {
  error.value = ''
  if (!EMAIL_RE.test(email.value.trim()) || !password.value) {
    error.value = 'Enter your work email and password.'
    return
  }
  busy.value = true
  try {
    const r = await auth.login(email.value, password.value)
    challengeId.value = r.challengeId
    password.value = ''
    step.value = 'mfa'
    if (demoMode) {
      const tick = () => (demo.value = demoAuthenticatorCode(challengeId.value))
      tick()
      demoTimer = setInterval(tick, 1000)
    }
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

async function submitCode() {
  error.value = ''
  if (!/^\d{6}$/.test(code.value.replace(/\s/g, ''))) {
    error.value = 'Enter the 6-digit code from your authenticator app.'
    return
  }
  busy.value = true
  try {
    const r = await auth.verifyMfa(challengeId.value, code.value)
    if ('passwordChangeRequired' in r) {
      passwordReason.value = r.reason
      step.value = 'password'
    } else {
      await navigateTo(safeRedirect(), { replace: true })
    }
  } catch (e) {
    fail(e)
    code.value = ''
    if (e instanceof ApiError && e.code === 'CHALLENGE_EXPIRED') step.value = 'credentials'
  } finally {
    busy.value = false
  }
}

async function submitNewPassword() {
  error.value = ''
  if (rules.value.some((r) => !r.ok)) return (error.value = 'Your new password doesn’t meet all the rules.')
  if (newPassword.value !== confirm.value) return (error.value = 'Passwords don’t match.')
  busy.value = true
  try {
    await auth.completePasswordChange(challengeId.value, newPassword.value)
    await navigateTo(safeRedirect(), { replace: true })
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

function restart() {
  step.value = 'credentials'
  code.value = ''
  error.value = ''
  if (demoTimer) clearInterval(demoTimer)
  demo.value = null
}

const TEST = [
  { role: 'Super Admin', email: 'superadmin@helamart.test', password: SEED_PASSWORDS.superAdmin },
  { role: 'Admin', email: 'admin@helamart.test', password: SEED_PASSWORDS.admin },
  { role: 'Store Manager', email: 'manager@helamart.test', password: SEED_PASSWORDS.staff },
]
</script>

<template>
  <div class="grid min-h-dvh bg-[#F4F5F1] lg:grid-cols-[1fr_1.1fr]">
    <section class="relative hidden flex-col justify-between overflow-hidden bg-hela-green p-10 text-white lg:flex">
      <div class="flex items-center gap-3">
        <span class="grid size-11 place-items-center rounded-xl bg-hela-gold text-hela-green-900"><AppIcon name="shield" :size="22" /></span>
        <span class="leading-tight">
          <span class="block text-xl font-extrabold">HelaMart</span>
          <span class="block text-sm font-semibold text-hela-gold">Back office</span>
        </span>
      </div>
      <div>
        <h1 class="max-w-md text-4xl leading-tight font-extrabold tracking-tight">Run the store. <span class="text-hela-gold">Securely.</span></h1>
        <ul class="mt-6 space-y-3 text-sm text-white/85">
          <li class="flex gap-2"><AppIcon name="check" :size="17" class="text-hela-gold" /> Two-factor sign-in for every staff account</li>
          <li class="flex gap-2"><AppIcon name="check" :size="17" class="text-hela-gold" /> Role-based permissions — everyone sees only what they need</li>
          <li class="flex gap-2"><AppIcon name="check" :size="17" class="text-hela-gold" /> Every action recorded in the audit log</li>
        </ul>
      </div>
      <p class="text-xs text-white/60">Authorised HelaMart staff only. Activity is monitored and logged.</p>
    </section>

    <section class="flex items-center justify-center p-5 sm:p-10">
      <div class="w-full max-w-md">
        <div class="card p-6 shadow-card sm:p-8">
          <!-- Step 1 -->
          <form v-if="step === 'credentials'" class="space-y-4" novalidate @submit.prevent="submitCredentials">
            <div>
              <h2 class="text-2xl font-extrabold tracking-tight text-ink">Staff sign in</h2>
              <p class="mt-1 text-sm text-muted">Use your HelaMart work account.</p>
            </div>
            <p v-if="auth.signedOutReason.value && !error" class="rounded-lg bg-hela-gold-100/70 px-3 py-2 text-sm text-[#6d5622]" role="status">{{ auth.signedOutReason.value }}</p>
            <label class="block">
              <span class="field-label">Work email</span>
              <input v-model="email" type="email" autocomplete="username" class="field h-11" data-autofocus>
            </label>
            <label class="block">
              <span class="field-label">Password</span>
              <input v-model="password" type="password" autocomplete="current-password" class="field h-11">
            </label>
            <p v-if="error" class="flex gap-2 rounded-lg bg-[#FBEAEA] px-3 py-2 text-sm text-[#8A2E2E]" role="alert"><AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />{{ error }}</p>
            <button type="submit" class="btn-primary h-11 w-full" :disabled="busy">{{ busy ? 'Checking…' : 'Continue' }}</button>
          </form>

          <!-- Step 2 -->
          <form v-else-if="step === 'mfa'" class="space-y-4" novalidate @submit.prevent="submitCode">
            <div>
              <h2 class="text-2xl font-extrabold tracking-tight text-ink">Two-factor check</h2>
              <p class="mt-1 text-sm text-muted">Enter the 6-digit code from your authenticator app.</p>
            </div>
            <label class="block">
              <span class="field-label">Authentication code</span>
              <input
                v-model="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="7"
                class="field h-12 text-center text-2xl font-bold tracking-[0.4em]"
                placeholder="••••••"
                data-autofocus
              >
            </label>
            <div v-if="demoMode && demo" class="rounded-xl border border-dashed border-hela-gold-600 bg-hela-gold-100/60 p-3 text-sm">
              <p class="text-xs font-bold tracking-wide text-[#6d5622] uppercase">Prototype authenticator</p>
              <p class="mt-1 text-[#6d5622]">
                Code for {{ demo.email }}: <button type="button" class="font-mono text-lg font-extrabold tracking-widest text-ink underline-offset-4 hover:underline" @click="code = demo.code">{{ demo.code }}</button>
                <span class="text-xs">(changes in {{ demo.secondsLeft }}s)</span>
              </p>
              <p class="mt-1 text-xs text-[#6d5622]">Stands in for a phone app during testing. Disabled when <code>NUXT_PUBLIC_ADMIN_DEMO_MODE=false</code>.</p>
            </div>
            <p v-if="error" class="flex gap-2 rounded-lg bg-[#FBEAEA] px-3 py-2 text-sm text-[#8A2E2E]" role="alert"><AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />{{ error }}</p>
            <button type="submit" class="btn-primary h-11 w-full" :disabled="busy">{{ busy ? 'Verifying…' : 'Verify and sign in' }}</button>
            <button type="button" class="w-full text-sm font-semibold text-muted hover:text-ink" @click="restart">Use a different account</button>
          </form>

          <!-- Step 3 -->
          <form v-else class="space-y-4" novalidate @submit.prevent="submitNewPassword">
            <div>
              <h2 class="text-2xl font-extrabold tracking-tight text-ink">Choose a new password</h2>
              <p class="mt-1 text-sm text-muted">
                {{ passwordReason === 'new' ? 'You signed in with a temporary password. Set your own to continue.' : 'Your password has expired. Choose a new one to continue.' }}
              </p>
            </div>
            <label class="block">
              <span class="field-label">New password</span>
              <input v-model="newPassword" type="password" autocomplete="new-password" class="field h-11" data-autofocus>
            </label>
            <ul class="grid gap-1 text-xs">
              <li v-for="r in rules" :key="r.id" class="flex items-center gap-1.5" :class="r.ok ? 'text-hela-green' : 'text-muted'">
                <AppIcon :name="r.ok ? 'check' : 'minus'" :size="13" :stroke-width="3" />{{ r.label }}
              </li>
            </ul>
            <label class="block">
              <span class="field-label">Confirm new password</span>
              <input v-model="confirm" type="password" autocomplete="new-password" class="field h-11">
            </label>
            <p v-if="error" class="flex gap-2 rounded-lg bg-[#FBEAEA] px-3 py-2 text-sm text-[#8A2E2E]" role="alert"><AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />{{ error }}</p>
            <button type="submit" class="btn-primary h-11 w-full" :disabled="busy">{{ busy ? 'Saving…' : 'Save and sign in' }}</button>
          </form>
        </div>

        <details v-if="demoMode && step === 'credentials'" class="mt-4 rounded-xl bg-white/70 p-4 text-sm ring-1 ring-line">
          <summary class="cursor-pointer font-semibold text-ink">Prototype test accounts</summary>
          <ul class="mt-3 space-y-2">
            <li v-for="t in TEST" :key="t.email" class="flex items-center justify-between gap-2">
              <span class="min-w-0">
                <span class="block font-semibold text-ink">{{ t.role }}</span>
                <span class="block truncate text-xs text-muted">{{ t.email }} · <code>{{ t.password }}</code></span>
              </span>
              <button type="button" class="btn-ghost h-8 shrink-0 px-3 text-xs" @click="(email = t.email), (password = t.password)">Use</button>
            </li>
          </ul>
        </details>
        <p class="mt-4 text-center text-xs text-muted"><NuxtLink to="/" class="hover:underline">← Back to the HelaMart store</NuxtLink></p>
      </div>
    </section>
  </div>
</template>
