<script setup lang="ts">
import { TEST_GOOGLE_ACCOUNTS, TEST_LOGINS } from '~/data/mockUsers'
import { ApiError } from '~/services/apiError'
import { PLACES, findPlace } from '~/data/places'
import { DEFAULT_RADIUS_KM } from '~/lib/area'

type View = 'login' | 'register' | 'google'

const { open, reason, finish } = useAuthDialog()
const { login, register, loginWithGoogle, user } = useAuth()
const { show } = useToasts()

const view = ref<View>('login')
const email = ref('')
const password = ref('')
const remember = ref(false)
const showPassword = ref(false)
const busy = ref(false)
const error = ref<{ text: string; code?: string } | null>(null)
const other = reactive({ open: false, email: '', name: '' })
const hasGoogleClient = !!useRuntimeConfig().public.googleClientId

const reg = reactive({ name: '', phone: '', town: '', confirm: '', agree: false })
const { area } = useShoppingArea()
const regErrors = reactive<Record<string, string>>({})
const rules = computed(() => PASSWORD_RULES.map((r) => ({ ...r, ok: r.test(password.value) })))

watch(open, (v) => {
  if (!v) return
  view.value = 'login'
  error.value = null
  password.value = ''
  Object.assign(reg, { name: '', phone: '', town: area.value?.label ?? '', confirm: '', agree: false })
  Object.keys(regErrors).forEach((k) => delete regErrors[k])
  other.open = false
})

function switchTo(next: View) {
  view.value = next
  error.value = null
  Object.keys(regErrors).forEach((k) => delete regErrors[k])
  password.value = ''
  reg.confirm = ''
}

function fail(e: unknown) {
  error.value =
    e instanceof ApiError ? { text: e.message, code: e.code } : { text: 'Something went wrong. Please try again.' }
}

function done(isNew = false) {
  const first = user.value?.name.split(' ')[0] ?? 'there'
  show(isNew ? `Welcome to HelaMart, ${first}! Your account is ready.` : `Welcome, ${first}! You’re signed in.`, 'success')
  finish(true)
}

async function submitLogin() {
  error.value = null
  if (!EMAIL_RE.test(email.value.trim())) return (error.value = { text: 'Enter a valid email address.' })
  if (!password.value) return (error.value = { text: 'Enter your password.' })
  busy.value = true
  try {
    await login(email.value, password.value, remember.value)
    done()
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
  if (reg.phone.trim() && !isSriLankanMobile(reg.phone)) regErrors.phone = 'Enter a Sri Lankan mobile number, e.g. 077 123 4567.'
  const town = findPlace(reg.town)
  if (!town) regErrors.town = 'Choose your town from the list — we use it to show supermarkets near you.'
  if (!isStrongPassword(password.value)) regErrors.password = 'Your password doesn’t meet all the rules below.'
  if (reg.confirm !== password.value) regErrors.confirm = 'Passwords don’t match.'
  if (!reg.agree) regErrors.agree = 'Please accept the terms to continue.'
  if (Object.keys(regErrors).length) return
  busy.value = true
  try {
    // Keep a precise area the shopper already chose for this town; otherwise use the town centre.
    const location = area.value && area.value.label === town!.name ? area.value : { label: town!.name, district: town!.district, lat: town!.lat, lng: town!.lng, radiusKm: DEFAULT_RADIUS_KM, source: 'town' as const }
    await register({ name: reg.name, email: email.value, phone: reg.phone, password: password.value, location }, remember.value)
    done(true)
  } catch (e) {
    fail(e)
  } finally {
    busy.value = false
  }
}

async function google(input: { idToken: string } | { email: string; name?: string }) {
  error.value = null
  busy.value = true
  try {
    await loginWithGoogle(input, remember.value)
    done()
  } catch (e) {
    fail(e)
    view.value = 'login'
  } finally {
    busy.value = false
  }
}

function useTest(e: string, p: string) {
  email.value = e
  password.value = p
  error.value = null
}

const title = computed(() =>
  view.value === 'google' ? 'Sign in with Google' : view.value === 'register' ? 'Create your HelaMart account' : 'Log in to HelaMart',
)
const inputCls =
  'h-11 w-full rounded-xl border-0 bg-white px-3.5 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-hela-green focus:outline-none'
</script>

<template>
  <SidePanel :open="open" :title="title" width="sm:max-w-md" @close="finish(false)">
    <template #subtitle>
      <p v-if="reason" class="text-xs text-muted">{{ reason }}</p>
    </template>

    <div v-if="view !== 'google'" class="px-5 py-5">
      <!-- Log in / Create account tabs -->
      <div class="mb-5 grid grid-cols-2 rounded-xl bg-hela-green-50 p-1" role="tablist" aria-label="Account">
        <button
          v-for="t in ([['login', 'Log in'], ['register', 'Create account']] as const)"
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
          <input v-model="email" type="email" autocomplete="username" inputmode="email" data-autofocus :class="inputCls" placeholder="you@example.com">
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Password</span>
          <span class="relative block">
            <input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" :class="inputCls" class="pr-11">
            <button
              type="button"
              class="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-hela-green-50"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              <AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="17" />
            </button>
          </span>
        </label>
        <label class="flex items-start gap-2.5 text-sm text-ink">
          <input v-model="remember" type="checkbox" class="mt-0.5 size-4 accent-hela-green">
          <span>
            Keep me signed in
            <span class="block text-xs text-muted">On this device for 30 days. Otherwise you’re signed out when the browser closes.</span>
          </span>
        </label>

        <div v-if="error" class="rounded-xl bg-[#fbeaea] px-3.5 py-2.5 text-sm text-[#8A2E2E]" role="alert">
          <p class="flex items-start gap-2">
            <AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
            {{ error.text }}
          </p>
          <p v-if="error.code === 'BAD_CREDENTIALS'" class="mt-1.5 pl-6 text-xs text-ink">
            New to HelaMart?
            <button type="button" class="font-bold text-hela-green underline underline-offset-2" @click="switchTo('register')">Create an account</button>
            or continue with Google below.
          </p>
        </div>

        <button type="submit" class="btn-primary h-11 w-full" :disabled="busy">
          <span v-if="busy" class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          <AppIcon v-else name="lock" :size="17" />
          {{ busy ? 'Signing in…' : 'Log in' }}
        </button>
        <p class="text-center text-sm text-muted">
          Don’t have an account?
          <button type="button" class="font-bold text-hela-green hover:underline" @click="switchTo('register')">Register now</button>
        </p>
      </form>

      <!-- Create account -->
      <form v-else class="space-y-3.5" novalidate @submit.prevent="submitRegister">
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Full name</span>
          <input v-model="reg.name" autocomplete="name" data-autofocus :class="inputCls" placeholder="e.g. Nimal Perera" :aria-invalid="!!regErrors.name">
          <span v-if="regErrors.name" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.name }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Email</span>
          <input v-model="email" type="email" autocomplete="email" inputmode="email" :class="inputCls" placeholder="you@example.com" :aria-invalid="!!regErrors.email">
          <span v-if="regErrors.email" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.email }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Mobile number <span class="font-normal text-muted">(optional)</span></span>
          <input v-model="reg.phone" type="tel" autocomplete="tel" :class="inputCls" placeholder="077 123 4567" :aria-invalid="!!regErrors.phone">
          <span v-if="regErrors.phone" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.phone }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Your town <span class="font-normal text-muted">(to show supermarkets near you)</span></span>
          <input v-model="reg.town" list="register-towns" autocomplete="address-level2" :class="inputCls" placeholder="e.g. Negombo" :aria-invalid="!!regErrors.town" data-testid="register-town">
          <datalist id="register-towns"><option v-for="p in PLACES" :key="`${p.name}-${p.district}`" :value="p.name">{{ p.district }}</option></datalist>
          <span v-if="regErrors.town" class="mt-1 block text-xs text-[#8A2E2E]">{{ regErrors.town }}</span>
        </label>
        <label class="block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Password</span>
          <span class="relative block">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              :class="inputCls"
              class="pr-11"
              aria-describedby="pw-rules"
              :aria-invalid="!!regErrors.password"
            >
            <button
              type="button"
              class="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-hela-green-50"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              <AppIcon :name="showPassword ? 'eye-off' : 'eye'" :size="17" />
            </button>
          </span>
          <ul id="pw-rules" class="mt-2 grid gap-1 text-xs">
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
            I agree to HelaMart’s terms of use and privacy policy.
            <span v-if="regErrors.agree" class="block text-xs text-[#8A2E2E]">{{ regErrors.agree }}</span>
          </span>
        </label>

        <div v-if="error" class="rounded-xl bg-[#fbeaea] px-3.5 py-2.5 text-sm text-[#8A2E2E]" role="alert">
          <p class="flex items-start gap-2">
            <AppIcon name="alert" :size="16" class="mt-0.5 shrink-0" />
            {{ error.text }}
          </p>
          <button v-if="error.code === 'EMAIL_TAKEN'" type="button" class="mt-1.5 pl-6 text-xs font-bold text-hela-green underline underline-offset-2" @click="switchTo('login')">
            Go to log in
          </button>
        </div>

        <button type="submit" class="btn-primary h-11 w-full" :disabled="busy">
          <span v-if="busy" class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          <AppIcon v-else name="user" :size="17" />
          {{ busy ? 'Creating account…' : 'Create account' }}
        </button>
        <p class="flex items-center justify-center gap-1.5 text-xs text-hela-green">
          <AppIcon name="gift" :size="14" />
          New customers get Rs. 250 off their first order over Rs. 1,500.
        </p>
        <p class="text-center text-sm text-muted">
          Already registered?
          <button type="button" class="font-bold text-hela-green hover:underline" @click="switchTo('login')">Log in</button>
        </p>
      </form>

      <div class="my-5 flex items-center gap-3 text-xs font-semibold text-muted">
        <span class="h-px flex-1 bg-line" />or<span class="h-px flex-1 bg-line" />
      </div>
      <div :class="error?.code === 'EMAIL_GOOGLE' ? 'rounded-xl ring-2 ring-hela-gold ring-offset-2' : ''">
        <GoogleSignInButton :disabled="busy" @credential="google({ idToken: $event })" @mock="switchTo('google')" />
      </div>
      <p class="mt-2 text-center text-xs text-muted">
        {{ view === 'register' ? 'No password needed — your Google account creates your HelaMart account.' : 'New or returning — Google signs you in either way.' }}
      </p>

      <section v-if="view === 'login'" class="mt-6 rounded-2xl bg-hela-gold-100/70 p-4" aria-labelledby="test-accounts">
        <h3 id="test-accounts" class="flex items-center gap-2 text-xs font-bold tracking-wide text-[#6d5622] uppercase">
          <AppIcon name="info" :size="14" />
          Test accounts (prototype)
        </h3>
        <ul class="mt-2.5 space-y-2">
          <li v-for="t in TEST_LOGINS" :key="t.email" class="flex items-center justify-between gap-2 text-sm">
            <span class="min-w-0">
              <span class="block truncate font-semibold text-ink">{{ t.name }}</span>
              <span class="block truncate text-xs text-muted">{{ t.email }} · {{ t.offers ? `${t.offers} offers` : 'no offers' }}</span>
            </span>
            <button type="button" class="btn-ghost h-8 shrink-0 px-3 text-xs" @click="useTest(t.email, t.password)">Use</button>
          </li>
        </ul>
        <p class="mt-2.5 text-xs text-[#6d5622]">Password for all: <code class="font-bold">Password@123</code></p>
      </section>
    </div>

    <!-- Simulated Google account chooser (no client ID configured) -->
    <div v-else class="px-5 py-5">
      <div class="rounded-2xl bg-white p-5 ring-1 ring-[#dadce0]">
        <div class="text-center">
          <svg viewBox="0 0 48 48" class="mx-auto size-8" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
            <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          <p class="mt-3 text-lg font-semibold text-[#1f1f1f]">Choose an account</p>
          <p class="text-sm text-[#444746]">to continue to <span class="font-semibold text-hela-green">HelaMart</span></p>
        </div>
        <ul class="mt-5 divide-y divide-[#e8eaed] border-y border-[#e8eaed]">
          <li v-for="g in TEST_GOOGLE_ACCOUNTS" :key="g.email">
            <button
              type="button"
              class="flex w-full items-center gap-3 px-2 py-3 text-left transition hover:bg-[#f8f9fa] disabled:opacity-50"
              :disabled="busy"
              @click="google({ email: g.email, name: g.name })"
            >
              <UserAvatar :name="g.name" :color="g.avatarColor" :size="34" />
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold text-[#1f1f1f]">{{ g.name }}</span>
                <span class="block truncate text-xs text-[#444746]">{{ g.email }}</span>
              </span>
            </button>
          </li>
          <li>
            <button v-if="!other.open" type="button" class="flex w-full items-center gap-3 px-2 py-3 text-left text-sm font-semibold text-[#1f1f1f] hover:bg-[#f8f9fa]" @click="other.open = true">
              <span class="grid size-[34px] place-items-center rounded-full bg-[#f1f3f4] text-[#444746]"><AppIcon name="user" :size="17" /></span>
              Use another account
            </button>
            <form v-else class="space-y-2 px-2 py-3" @submit.prevent="google({ email: other.email, name: other.name })">
              <input v-model="other.email" type="email" required placeholder="Email (e.g. you@gmail.com)" class="h-10 w-full rounded-lg border-0 px-3 text-sm ring-1 ring-[#dadce0] focus:ring-2 focus:ring-[#1a73e8] focus:outline-none" data-autofocus>
              <input v-model="other.name" type="text" placeholder="Name (optional)" class="h-10 w-full rounded-lg border-0 px-3 text-sm ring-1 ring-[#dadce0] focus:ring-2 focus:ring-[#1a73e8] focus:outline-none">
              <button type="submit" class="h-10 w-full rounded-full bg-[#1a73e8] text-sm font-semibold text-white hover:bg-[#1765cc] disabled:opacity-50" :disabled="busy">
                {{ busy ? 'Signing in…' : 'Next' }}
              </button>
            </form>
          </li>
        </ul>
        <p v-if="busy" class="mt-4 text-center text-sm text-[#444746]">Signing in…</p>
      </div>
      <p v-if="!hasGoogleClient" class="mt-4 flex gap-2 text-xs leading-relaxed text-muted">
        <AppIcon name="info" :size="14" class="mt-px shrink-0" />
        <span>Simulated Google sign-in for testing. A new email creates an account automatically. Set <code>NUXT_PUBLIC_GOOGLE_CLIENT_ID</code> to use the real Google button.</span>
      </p>
      <button type="button" class="btn-ghost mt-4 w-full" @click="switchTo('login')">
        <AppIcon name="arrow-left" :size="16" />
        Back to email login
      </button>
    </div>
  </SidePanel>
</template>
