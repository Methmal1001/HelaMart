<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin', permission: { platform: 'customers.all.view', tenant: 'customers.view' } })
useHead({ title: 'Customers' })
const auth = useAdminAuth()
</script>

<template>
  <PlatformCustomersView v-if="auth.isPlatform.value" />
  <TenantCustomersView v-else />
</template>
