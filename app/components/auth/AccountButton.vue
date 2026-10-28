<script setup lang="ts">
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false })
const { user, status, isAuthenticated } = useAuth()
const { requestLogin } = useAuthDialog()
const { openPanel } = useStoreUi()
const { activeOffers } = useOffers()
</script>

<template>
  <span v-if="status === 'unknown'" class="btn-icon hud-surface animate-pulse" aria-hidden="true" />
  <button
    v-else-if="isAuthenticated && user"
    type="button"
    class="hud-surface relative flex h-11 items-center gap-2 rounded-xl pr-1.5 pl-1.5 transition hover:bg-hela-green-50"
    :class="compact ? '' : 'sm:pr-3'"
    :aria-label="`Account: ${user.name}`"
    @click="openPanel('account')"
  >
    <UserAvatar :name="user.name" :color="user.avatarColor" :picture="user.pictureUrl" :size="32" />
    <span v-if="!compact" class="hidden max-w-28 truncate text-sm font-semibold text-ink sm:block">{{ user.name.split(' ')[0] }}</span>
    <span
      v-if="activeOffers.length"
      class="absolute -top-1.5 -left-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-hela-gold px-1 text-[0.65rem] font-extrabold text-hela-green-900 ring-2 ring-white"
      :title="`${activeOffers.length} offers available`"
    >{{ activeOffers.length }}</span>
  </button>
  <button v-else type="button" class="btn-ghost hud-surface h-11 px-3.5" @click="requestLogin()">
    <AppIcon name="user" :size="18" />
    <span :class="compact ? 'sr-only' : 'hidden sm:inline'">Log in</span>
  </button>
</template>
