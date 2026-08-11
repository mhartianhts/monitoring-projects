<script setup lang="ts">
interface Props {
  status: 'running' | 'stopped';
}

defineProps<Props>();
</script>

<template>
  <span
    class="inline-block h-2.5 w-2.5 rounded-full"
    :class="status === 'running' ? 'bg-running animate-pulse' : 'bg-stopped'"
    :title="status"
  />
</template>
