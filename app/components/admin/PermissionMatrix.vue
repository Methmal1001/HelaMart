<script setup lang="ts">
import type { Permission, Scope } from '~/types/admin'
import { groupsFor } from '~/data/admin/permissions'

/**
 * Grouped permission checkboxes for one organisation type. Permissions the
 * current admin doesn't hold are disabled — you can never grant more than you have.
 */
const props = defineProps<{
  modelValue: Permission[]
  grantable: Set<Permission>
  scope: Scope
  locked?: Permission[]
  disabled?: boolean
  /** Chain-wide permissions that can't go to people tied to branches (shown, but off). */
  chainOnly?: Permission[]
}>()
const blocked = (p: Permission) => !props.grantable.has(p) || !!props.chainOnly?.includes(p)
const emit = defineEmits<{ 'update:modelValue': [value: Permission[]] }>()
const groups = computed(() => groupsFor(props.scope))

function toggle(p: Permission) {
  const set = new Set(props.modelValue)
  if (set.has(p)) set.delete(p)
  else set.add(p)
  emit('update:modelValue', [...set])
}

function toggleGroup(ids: Permission[], on: boolean) {
  const set = new Set(props.modelValue)
  for (const id of ids) if (!blocked(id) && !props.locked?.includes(id)) on ? set.add(id) : set.delete(id)
  emit('update:modelValue', [...set])
}
</script>

<template>
  <div class="space-y-3">
    <fieldset v-for="g in groups" :key="g.id" class="rounded-xl bg-white p-3 ring-1 ring-line" :disabled="disabled">
      <legend class="sr-only">{{ g.label }}</legend>
      <div class="mb-2 flex items-center justify-between">
        <p class="text-xs font-bold tracking-wide text-ink uppercase">{{ g.label }}</p>
        <div v-if="!disabled" class="flex gap-2 text-xs">
          <button type="button" class="font-semibold text-hela-green hover:underline" @click="toggleGroup(g.permissions.map((p) => p.id), true)">All</button>
          <button type="button" class="font-semibold text-muted hover:underline" @click="toggleGroup(g.permissions.map((p) => p.id), false)">None</button>
        </div>
      </div>
      <div class="grid gap-1.5 sm:grid-cols-2">
        <label
          v-for="p in g.permissions"
          :key="p.id"
          class="flex items-start gap-2.5 rounded-lg p-2 text-sm"
          :class="!blocked(p.id) && !disabled && !locked?.includes(p.id) ? 'cursor-pointer hover:bg-hela-green-50' : 'opacity-60'"
          :title="chainOnly?.includes(p.id) ? 'Chain-wide: stays with your supermarket admin' : !grantable.has(p.id) ? 'You can’t grant a permission you don’t have' : undefined"
        >
          <input
            type="checkbox"
            class="mt-0.5 size-4 accent-hela-green"
            :checked="(modelValue.includes(p.id) || locked?.includes(p.id)) && !chainOnly?.includes(p.id)"
            :disabled="disabled || blocked(p.id) || locked?.includes(p.id)"
            @change="toggle(p.id)"
          >
          <span>
            <span class="flex items-center gap-1.5 font-semibold text-ink">
              {{ p.label }}
              <AppIcon v-if="p.sensitive" name="shield" :size="13" class="text-hela-gold-600" />
              <span v-if="p.sensitive" class="sr-only">(sensitive)</span>
            </span>
            <span class="block text-xs text-muted">{{ p.description }}</span>
            <span v-if="chainOnly?.includes(p.id)" class="block text-[0.7rem] text-muted">Chain-wide — stays with the admin</span>
            <span v-else-if="locked?.includes(p.id)" class="block text-[0.7rem] text-hela-green">Included in role</span>
          </span>
        </label>
      </div>
    </fieldset>
  </div>
</template>
