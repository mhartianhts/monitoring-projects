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
  <section class="grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-line/70 bg-base px-6 py-3">
    <!-- CPU Bento Card -->
    <div class="rounded-lg border border-line bg-panel p-3.5 flex flex-col justify-between transition hover:border-accent/40 shadow-xs">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold tracking-[0.16em] text-muted flex items-center gap-1.5">
          <span>⚙️</span> CPU Load
        </span>
        <span
          v-if="running"
          class="font-mono text-xs font-semibold px-2 py-0.5 rounded"
          :class="stats.cpu > 70 ? 'bg-stopped/20 text-stopped' : stats.cpu > 40 ? 'bg-warn/20 text-warn' : 'bg-accent/15 text-accent'"
        >
          {{ stats.cpu }}%
        </span>
      </div>
      
      <div class="mt-2.5">
        <p class="text-xl font-bold font-mono tracking-tight" :class="running ? 'text-ink' : 'text-muted/50'">
          {{ running ? `${stats.cpu}%` : '—' }}
        </p>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div
            class="h-full transition-all duration-500 ease-out rounded-full"
            :class="stats.cpu > 70 ? 'bg-stopped' : stats.cpu > 40 ? 'bg-warn' : 'bg-accent'"
            :style="{ width: running ? `${Math.min(stats.cpu, 100)}%` : '0%' }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Memory Bento Card -->
    <div class="rounded-lg border border-line bg-panel p-3.5 flex flex-col justify-between transition hover:border-accent/40 shadow-xs">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold tracking-[0.16em] text-muted flex items-center gap-1.5">
          <span>🧠</span> RAM Usage
        </span>
        <span
          v-if="running"
          class="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-accent/15 text-accent"
        >
          {{ stats.memory }} MB
        </span>
      </div>

      <div class="mt-2.5">
        <p class="text-xl font-bold font-mono tracking-tight" :class="running ? 'text-ink' : 'text-muted/50'">
          {{ running ? `${stats.memory} MB` : '—' }}
        </p>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
          <div
            class="h-full bg-running transition-all duration-500 ease-out rounded-full"
            :style="{ width: running ? `${Math.min((stats.memory / 1024) * 100, 100)}%` : '0%' }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Uptime Bento Card -->
    <div class="rounded-lg border border-line bg-panel p-3.5 flex flex-col justify-between transition hover:border-accent/40 shadow-xs">
      <div class="flex items-center justify-between">
        <span class="text-[10px] uppercase font-bold tracking-[0.16em] text-muted flex items-center gap-1.5">
          <span>⏱️</span> Process Uptime
        </span>
        <span
          class="text-[10px] font-mono uppercase font-semibold px-1.5 py-0.5 rounded"
          :class="running ? 'bg-running/20 text-running' : 'bg-stopped/20 text-stopped'"
        >
          {{ running ? 'Active' : 'Offline' }}
        </span>
      </div>

      <div class="mt-2.5">
        <p class="text-xl font-bold font-mono tracking-tight" :class="running ? 'text-running' : 'text-muted/50'">
          {{ running ? formatUptime(stats.uptime) : '—' }}
        </p>
        <p class="mt-1 text-[10px] text-muted truncate">
          {{ running ? 'Process running smoothly' : 'Start project to monitor stats' }}
        </p>
      </div>
    </div>
  </section>
</template>
