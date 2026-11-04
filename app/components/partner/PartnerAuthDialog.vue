<script setup lang="ts">
import { ApiError } from '~/services/apiError'

/** Log in / register for supermarket owners — a partner account, separate from the shopper account. */
type View = 'login' | 'register'

const { dialogOpen, dialogReason, finishDialog, login, register, partner } = usePartnerAuth()
const { show } = useToasts()

const view = ref<View>('login')
const email = ref('')
const password = ref('')
const remember = ref(false)
const showPassword = ref(false)
const busy = ref(false)
const error = ref<{ text: string; code?: string } | null>(null)
const reg = reactive({ name: '', phone: '', confirm: '', agree: false })
const regErrors = reactive<Record<string, string>>({})
const rules = computed(() => PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(password.value) })))

watch(dialogOpen, (v) => {
  if (!v) return
  view.value = 'login'
  error.value = null
  password.value = ''
  Object.assign(reg, { name: '', phone: '', confirm: '', agree: false })
  Object.keys(regErrors).forEach((k) => delete regErrors[k])
})

function switchTo(next: View) {
  view.value = next
  error.value = null
  Object.keys(regErrors).forEach((k) => delete regErrors[k])
  password.value = ''
  reg.confirm = ''
}

function fail(e: unknown) {
  error.value = e instanceof ApiError ? { text: e.message, code: e.code } : { text: 'Something went wrong. Please try again.' }
}

function done(isNew: boolean) {
  const first = partner.value?.name.split(' ')[0] ?? 'there'
  show(isNew ? `Welcome, ${first}! Your partner account is ready.` : `Welcome back, ${first}!`, 'success')
  finishDialog(true)
}

async function submitLogin() {
  error.value = null
  if (!EMAIL_RE.test(email.value.trim())) return (error.value = { text: 'Enter a valid email address.' })
  if (!password.value) return (error.value = { text: 'Enter your password.' })
  busy.value = true
  try {
    await login(email.value, password.value, remember.value)
    done(false)
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

async function submitRegister() {
  error.value = null
  Object.keys(regErrors).forEach((k) => delete regErrors[k])
  if (reg.name.trim().length < 3) regErrors.name = 'Enter your full name.'
  if (!EMAIL_RE.test(email.value.trim())) regErrors.email = 'Enter a valid email address.'
  if (!isSriLankanMobile(reg.phone)) regErrors.phone = 'Enter your Sri Lankan mobile number, e.g. 077 123 4567.'
  if (!isStrongPassword(password.value)) regErrors.password = 'Your password doesn’t meet all the rules below.'
  if (reg.confirm !== password.value) regErrors.confirm = 'Passwords don’t match.'
  if (!reg.agree) regErrors.agree = 'Please accept the partner terms to continue.'
  if (Object.keys(regErrors).length) return
  busy.value = true
  try {
    await register({ name: reg.name, email: email.value, phone: reg.phone, password: password.value }, remember.value)
    done(true)
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

const title = computed(() => (view.value === 'register' ? 'Create your partner account' : 'Partner log in'))
const inputCls = 'h-11 w-full rounded-xl border-0 bg-white px-3.5 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-hela-green focus:outline-none'
</script>

<template>
  <SidePanel :open="dialogOpen" :title="title" width="sm:max-w-md" @close="finishDialog(false)">
    <template #subtitle>
      <p class="text-xs text-muted">{{ dialogReason || 'For supermarket owners selling on HelaMart.' }}</p>
    </template>

    <div class="px-5 py-5" data-testid="partner-auth">
      <p class="mb-4 flex items-start gap-2 rounded-xl bg-hela-gold-100 px-3.5 py-2.5 text-xs text-[#5a4518] ring-1 ring-hela-gold">
        <AppIcon name="store" :size="15" class="mt-px shrink-0" />
        This is your HelaMart partner account, separate from a shopping account. Use it to apply and follow your supermarket’s application.
      </p>

      <div class="mb-5 grid grid-cols-2 rounded-xl bg-hela-green-50 p-1" role="tablist" aria-label="Partner account">
        <button
          v-for="t in ([['login', 'Log in'], ['register', 'Register']] as const)"
          :key="t[0]"
          type="button"
          role="tab"
          :aria-selected="view === t[0]"
          class="h-9 rounded-lg text-sm font-semibold transition"
          :class="view === t[0] ? 'bg-white text-hela-green shadow-card' : 'text-muted hover:text-ink'"
          @click="switchTo(t[0])"
        >
          {{ t[1] }}
        </button>
      </div>

      <!-- Log in -->
      <form v-if="view === 'login'" class="space-y-4" novalidate @submit.prevent="submitLogin">
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Email</span>
          <input v-model="email" type="email" autocomplete="username" inputmode="email" data-autofocus :class="inputCls" placeholder="owner@yoursupermarket.lk">
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Password</span>
          <span class="relative block">
            <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" :class="inputCls" class="pr-11">
            <button type="button" class="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-hela-green-50" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
              <AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="17" />
            </button>
          </span>
        </label>
        <label class="flex items-start gap-2.5 text-sm text-ink">
          <input v-model="remember" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
          <span>Keep me signed in <span class="block text-xs text-muted">On this device for 30 days.</span></span>
        </label>

        <div v-if="error" class="rounded-xl bg-[#fbeaea] px-3.5 py-2.5 text-sm text-[#8A2E2E]" role="alert">
          <p class="flex items-start gap-2"><AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />{{ error.text }}</p>
          <p v-if="error.code === 'BAD_CREDENTIALS'" class="mt-1.5 pl-6 text-xs text-ink">
            New partner?
            <button type="button" class="font-bold text-hela-green underline underline-offset-2" @click="switchTo('register')">Register a partner account</button>
          </p>
        </div>

        <button type="submit" class="btn-primary h-11 w-full" :disabled="busy">
          <span v-if="busy" class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          <AppIcon v-else name="lock" :size="17" />
          {{ busy ? 'Signing in…' : 'Log in' }}
        </button>
        <p class="text-center text-sm text-muted">
          No partner account yet?
          <button type="button" class="font-bold text-hela-green hover:underline" @click="switchTo('register')">Register now</button>
        </p>
      </form>

      <!-- Register -->
      <form v-else class="space-y-3.5" novalidate @submit.prevent="submitRegister">
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Owner’s full name</span>
          <input v-model="reg.name" autocomplete="name" data-autofocus :class="inputCls" placeholder="e.g. Sunil Fernando" :aria-invalid="!!regErrors.name">
          <span v-if="regErrors.name" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.name }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Email</span>
          <input v-model="email" type="email" autocomplete="email" inputmode="email" :class="inputCls" placeholder="owner@yoursupermarket.lk" :aria-invalid="!!regErrors.email">
          <span v-if="regErrors.email" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.email }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Mobile number</span>
          <input v-model="reg.phone" type="tel" autocomplete="tel" :class="inputCls" placeholder="077 123 4567" :aria-invalid="!!regErrors.phone">
          <span v-if="regErrors.phone" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.phone }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Password</span>
          <span class="relative block">
            <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" :class="inputCls" class="pr-11" aria-describedby="partner-pw-rules" :aria-invalid="!!regErrors.password">
            <button type="button" class="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-hela-green-50" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
              <AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="17" />
            </button>
          </span>
          <ul id="partner-pw-rules" class="mt-2 grid gap-1 text-xs">
            <li v-for="r in rules" :key="r.id" class="flex items-center gap-1.5" :class="r.ok ? 'text-hela-green' : 'text-muted'">
              <AppIcon :name="r.ok ? 'check' : 'minus'" :size="13" :stroke-width="3" />
              {{ r.label }}
            </li>
          </ul>
          <span v-if="regErrors.password" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.password }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Confirm password</span>
          <input v-model="reg.confirm" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" :class="inputCls" :aria-invalid="!!regErrors.confirm">
          <span v-if="regErrors.confirm" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.confirm }}</span>
        </label>
        <label class="flex items-start gap-2.5 text-sm text-ink">
          <input v-model="remember" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
          Keep me signed in on this device
        </label>
        <label class="flex items-start gap-2.5 text-sm text-ink">
          <input v-model="reg.agree" type="checkbox" class="mt-0.5 size-4 accent-hela-green" :aria-invalid="!!regErrors.agree">
          <span>
            I agree to HelaMart’s partner terms and privacy policy.
            <span v-if="regErrors.agree" class="block text-xs text-[#8A2E2E]">{{ regErrors.agree }}</span>
          </span>
        </label>

        <div v-if="error" class="rounded-xl bg-[#fbeaea] px-3.5 py-2.5 text-sm text-[#8A2E2E]" role="alert">
          <p class="flex items-start gap-2"><AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />{{ error.text }}</p>
          <button v-if="error.code === 'EMAIL_TAKEN'" type="button" class="mt-1.5 pl-6 text-xs font-bold text-hela-green underline underline-offset-2" @click="switchTo('login')">Go to log in</button>
        </div>

        <button type="submit" class="btn-primary h-11 w-full" :disabled="busy">
          <span v-if="busy" class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          <AppIcon v-else name="store" :size="17" />
          {{ busy ? 'Creating account…' : 'Create partner account' }}
        </button>
        <p class="text-center text-sm text-muted">
          Already registered?
          <button type="button" class="font-bold text-hela-green hover:underline" @click="switchTo('login')">Log in</button>
        </p>
      </form>
    </div>
  </SidePanel>
</template>
