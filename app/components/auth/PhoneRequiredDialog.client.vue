<script setup lang="ts">
import { ApiError } from '~/services/apiError'

/**
 * Every signed-in customer needs a mobile number (delivery calls, order
 * updates; supermarkets see it). Accounts without one — e.g. a first Google
 * sign-in — are asked for it before they continue.
 */
const { user, status, savePhone, logout } = useAuth()
const { show } = useToasts()
const route = useRoute()

const phone = ref('')
const error = ref('')
const busy = ref(false)
const open = computed(() => status.value === 'authenticated' && !!user.value && !user.value.phone && !route.path.startsWith('/admin'))

watch(open, (v) => {
  if (v) {
    phone.value = ''
    error.value = ''
  }
})

async function save() {
  error.value = ''
  if (!isSriLankanMobile(phone.value)) {
    error.value = 'Enter your Sri Lankan mobile number, e.g. 077 123 4567.'
    return
  }
  busy.value = true
  try {
    const u = await savePhone(phone.value)
    show(`Thanks — ${u.phone} is saved to your account.`, 'success')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Couldn’t save your number. Try again.'
  } finally {
    busy.value = false
  }
}

async function signOut() {
  await logout()
  show('You’ve been signed out.')
}
</script>

<template>
  <Transition enter-active-class="transition duration-200" enter-from-class="opacity-0" leave-active-class="transition duration-150" leave-to-class="opacity-0">
    <div v-if="open" class="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="phone-title" data-testid="phone-required">
      <form class="w-full max-w-sm rounded-3xl bg-warm-white p-6 shadow-float" @submit.prevent="save">
        <span class="grid size-12 place-items-center rounded-2xl bg-hela-green text-hela-gold"><AppIcon name="user" :size="22" /></span>
        <h2 id="phone-title" class="mt-4 text-xl font-extrabold tracking-tight text-ink">Add your mobile number</h2>
        <p class="mt-1 text-sm text-muted">Hi {{ user?.name.split(' ')[0] }} — every HelaMart account needs a mobile number so your supermarket can reach you about deliveries and orders.</p>
        <label class="mt-4 block">
          <span class="mb-1.5 block text-sm font-semibold text-ink">Mobile number</span>
          <input
            v-model="phone"
            type="tel"
            autocomplete="tel"
            inputmode="tel"
            placeholder="077 123 4567"
            class="h-12 w-full rounded-xl border-0 bg-white px-4 text-base text-ink ring-1 ring-line focus:ring-2 focus:ring-hela-green focus:outline-none"
            :aria-invalid="!!error"
            data-autofocus
            data-testid="phone-input"
          >
          <span v-if="error" class="mt-1.5 block text-xs text-[#8A2E2E]" role="alert">{{ error }}</span>
        </label>
        <button type="submit" class="btn-primary mt-4 h-12 w-full" :disabled="busy" data-testid="phone-save">{{ busy ? 'Saving…' : 'Save and continue' }}</button>
        <button type="button" class="mt-3 w-full text-center text-xs font-semibold text-muted hover:text-ink" @click="signOut">Not now — sign out</button>
      </form>
    </div>
  </Transition>
</template>
