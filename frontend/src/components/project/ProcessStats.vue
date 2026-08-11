<script setup lang="ts">
import type { ProjectStats } from '../../types/project';

interface Props {
  stats: ProjectStats;
  running: boolean;
}

defineProps<Props>();

const formatUptime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};
</script>

<template>
  <section class="grid grid-cols-3 gap-3 border-b border-line bg-base px-6 py-3">
    <div class="rounded-md border border-line bg-panel px-4 py-3">
      <p class="text-xs uppercase tracking-wide text-muted">CPU</p>
      <p class="mt-1 text-lg font-semibold text-accent">
        {{ running ? `${stats.cpu}%` : '—' }}
      </p>
    </div>
    <div class="rounded-md border border-line bg-panel px-4 py-3">
      <p class="text-xs uppercase tracking-wide text-muted">Memory</p>
      <p class="mt-1 text-lg font-semibold text-accent">
        {{ running ? `${stats.memory} MB` : '—' }}
      </p>
    </div>
    <div class="rounded-md border border-line bg-panel px-4 py-3">
      <p class="text-xs uppercase tracking-wide text-muted">Uptime</p>
      <p class="mt-1 text-lg font-semibold text-accent">
        {{ running ? formatUptime(stats.uptime) : '—' }}
      </p>
    </div>
  </section>
</template>
