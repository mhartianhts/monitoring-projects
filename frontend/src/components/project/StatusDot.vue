<script setup lang="ts">
interface Props {
  status: 'running' | 'stopped';
}

defineProps<Props>();
</script>

<template>
  <span class="relative flex h-2 w-2 shrink-0">
    <span
      v-if="status === 'running'"
      class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"
    ></span>
    <span
      class="relative inline-flex rounded-full h-2 w-2"
      :class="status === 'running' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-zinc-600'"
      :title="status"
    ></span>
  </span>
</template>
