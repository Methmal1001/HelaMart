<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin', permission: { platform: 'platform.settings.manage', tenant: 'settings.manage' } })
useHead({ title: 'Settings' })
const auth = useAdminAuth()
</script>

<template>
  <PlatformSettingsView v-if="auth.isPlatform.value" />
  <ChainSettingsView v-else />
</template>
