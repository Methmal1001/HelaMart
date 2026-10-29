<script setup lang="ts">
const { panel, closePanel } = useStoreUi()
const { user, logout, sessionInfo, isAuthenticated } = useAuth()
const { offers, loading } = useOffers()
const { show } = useToasts()
const { openFinder } = useShoppingArea()

function changeArea() {
  closePanel()
  openFinder()
}

const open = computed(() => panel.value === 'account' && isAuthenticated.value)
const info = ref<ReturnType<typeof sessionInfo>>(null)
watch(open, (v) => v && (info.value = sessionInfo()), { immediate: true })

const dateFmt = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium' })
const timeFmt = new Intl.DateTimeFormat('en-LK', { dateStyle: 'medium', timeStyle: 'short' })

async function signOut() {
  closePanel()
  await logout()
  show('You’ve been signed out.')
}
</script>

<template>
  <SidePanel :open="open" title="Your account" @close="closePanel">
    <div v-if="user" class="space-y-6 px-5 py-5">
      <section class="flex items-center gap-4">
        <UserAvatar :name="user.name" :color="user.avatarColor" :picture="user.pictureUrl" :size="56" />
        <div class="min-w-0">
          <p class="truncate text-lg font-extrabold tracking-tight text-ink">{{ user.name }}</p>
          <p class="truncate text-sm text-muted">{{ user.email }}</p>
          <span class="chip mt-1.5 bg-hela-green-50 text-hela-green">
            {{ user.provider === 'google' ? 'Signed in with Google' : 'Email & password' }}
          </span>
        </div>
      </section>

      <section aria-labelledby="area-h" class="rounded-xl bg-white p-4 ring-1 ring-line">
        <h3 id="area-h" class="mb-1 flex items-center gap-2 text-sm font-bold text-ink">
          <AppIcon name="pin" :size="16" class="text-hela-green" />
          Your shopping area
        </h3>
        <p v-if="user.preferredLocation" class="text-sm text-ink" data-testid="account-area">
          {{ user.preferredLocation.label }}, {{ user.preferredLocation.district }}
          <span class="text-muted">· supermarkets within {{ user.preferredLocation.radiusKm }} km</span>
        </p>
        <p v-else class="text-sm text-muted">Not set yet.</p>
        <button type="button" class="mt-2 text-sm font-bold text-hela-green hover:underline" @click="changeArea">{{ user.preferredLocation ? 'Change area' : 'Set your area' }}</button>
      </section>

      <section aria-labelledby="offers-h">
        <h3 id="offers-h" class="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
          <AppIcon name="gift" :size="16" class="text-hela-green" />
          Your offers
        </h3>
        <p v-if="loading" class="text-sm text-muted">Loading offers…</p>
        <p v-else-if="!offers.length" class="rounded-xl bg-white p-4 text-sm text-muted ring-1 ring-line">No offers on your account right now.</p>
        <ul v-else class="space-y-2">
          <li
            v-for="o in offers"
            :key="o.id"
            class="rounded-xl bg-white p-3.5 ring-1 ring-line"
            :class="isOfferActive(o) ? '' : 'opacity-55'"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-bold text-ink">{{ o.title }}</p>
              <span class="shrink-0 rounded-md border border-dashed border-hela-gold-600 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-hela-gold-600">{{ o.code }}</span>
            </div>
            <p class="mt-1 text-xs text-muted">{{ o.description }}</p>
            <p class="mt-1.5 text-[0.7rem] font-semibold" :class="isOfferActive(o) ? 'text-hela-green' : 'text-[#8A2E2E]'">
              {{ isOfferActive(o) ? `Applied automatically · valid until ${dateFmt.format(new Date(o.expiresAt))}` : `Expired ${dateFmt.format(new Date(o.expiresAt))}` }}
            </p>
          </li>
        </ul>
      </section>

      <section v-if="info" aria-labelledby="session-h" class="rounded-xl bg-white p-4 text-sm ring-1 ring-line">
        <h3 id="session-h" class="mb-2 flex items-center gap-2 font-bold text-ink">
          <AppIcon name="lock" :size="15" class="text-hela-green" />
          Session
        </h3>
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt class="text-muted">Stay signed in</dt>
          <dd class="text-ink">{{ info.remember ? 'Yes, on this device' : 'Until the browser closes' }}</dd>
          <dt class="text-muted">Session ends</dt>
          <dd class="text-ink">{{ timeFmt.format(new Date(info.refreshExpiresAt)) }}</dd>
          <dt class="text-muted">Access token</dt>
          <dd class="text-ink">Renews automatically every 15 minutes</dd>
        </dl>
      </section>

      <button type="button" class="btn-ghost w-full" @click="signOut">
        <AppIcon name="logout" :size="17" />
        Sign out
      </button>
    </div>
  </SidePanel>
</template>
