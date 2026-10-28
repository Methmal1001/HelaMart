<script setup lang="ts">
/** Shows a temporary password exactly once. */
const props = defineProps<{ open: boolean; title: string; name: string; email: string; secret: string }>()
const emit = defineEmits<{ close: [] }>()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(props.secret)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <AdminModal :open="open" :title="title" size="sm" persistent @close="emit('close')">
    <p class="text-sm text-muted">Share these sign-in details with <b class="text-ink">{{ name }}</b> through a private channel.</p>
    <dl class="mt-4 space-y-2 rounded-xl bg-white p-3 text-sm ring-1 ring-line">
      <div class="flex justify-between gap-2"><dt class="text-muted">Email</dt><dd class="font-semibold">{{ email }}</dd></div>
      <div class="flex items-center justify-between gap-2">
        <dt class="text-muted">Temporary password</dt>
        <dd class="flex items-center gap-1.5">
          <code class="rounded bg-cream px-2 py-1 font-bold tracking-wide">{{ secret }}</code>
          <button type="button" class="grid size-8 place-items-center rounded-lg text-muted hover:bg-hela-green-50" :aria-label="copied ? 'Copied' : 'Copy password'" @click="copy">
            <AppIcon :name="copied ? 'check' : 'copy'" :size="15" />
          </button>
        </dd>
      </div>
    </dl>
    <ul class="mt-3 space-y-1 text-xs text-muted">
      <li>• This password is shown only once and is not stored anywhere readable.</li>
      <li>• They must choose their own password at first sign-in, and two-factor codes are always required.</li>
    </ul>
    <template #footer>
      <button type="button" class="btn-primary h-9" data-autofocus @click="emit('close')">I’ve shared it securely</button>
    </template>
  </AdminModal>
</template>
