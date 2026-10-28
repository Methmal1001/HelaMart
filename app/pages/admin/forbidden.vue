<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'admin' })
useHead({ title: 'No access' })
const auth = useAdminAuth()
</script>

<template>
  <div class="card mx-auto mt-10 max-w-lg p-8 text-center">
    <div class="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-hela-gold-100 text-hela-gold-600"><AppIcon name="lock" :size="26" /></div>
    <h1 class="text-xl font-extrabold text-ink">You don’t have access to this page</h1>
    <p class="mt-2 text-sm text-muted">
      Your role (<b class="text-ink">{{ auth.user.value?.roleName }}</b>) doesn’t include this permission. Ask an Admin or Super Admin if you need it.
    </p>
    <div class="mt-6 flex justify-center gap-2">
      <NuxtLink v-if="auth.can('dashboard.view')" to="/admin" class="btn-primary">Go to dashboard</NuxtLink>
      <NuxtLink v-if="auth.can('tasks.view')" to="/admin/tasks" class="btn-ghost">My tasks</NuxtLink>
      <NuxtLink to="/admin/account" class="btn-ghost">My account</NuxtLink>
    </div>
  </div>
</template>
