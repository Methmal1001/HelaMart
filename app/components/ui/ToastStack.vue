<script setup lang="ts">
const { toasts, dismiss } = useToasts()
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-300 ease-[cubic-bezier(.2,.8,.2,1)]"
      leave-active-class="transition duration-200"
      enter-from-class="translate-y-3 opacity-0"
      leave-to-class="opacity-0"
    >
      <button
        v-for="t in toasts"
        :key="t.id"
        type="button"
        class="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-float"
        :class="t.tone === 'error' ? 'bg-[#8A2E2E]' : 'bg-hela-green'"
        @click="dismiss(t.id)"
      >
        <AppIcon :name="t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'" :size="18" class="text-hela-gold" />
        <span>{{ t.message }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>
