<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin', permission: { platform: 'platform.dashboard', tenant: 'dashboard.view' } })
useHead({ title: 'Dashboard' })
const auth = useAdminAuth()
</script>

<template>
  <PlatformDashboardView v-if="auth.isPlatform.value" />
  <TenantDashboardView v-else />
</template>
