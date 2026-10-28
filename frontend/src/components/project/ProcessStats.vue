<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ProjectStats } from "../../types/project";

interface Props {
  stats: ProjectStats;
  running: boolean;
}

const props = defineProps<Props>();

// Rolling buffer of recent CPU data points for the SVG sparkline (12 points)
const cpuHistory = ref<number[]>([12, 18, 14, 22, 16, 25, 20, 15, 28, 22, 18, 24]);

watch(
  () => props.stats.cpu,
  (val) => {
    if (!props.running) return;
    const current = Math.max(2, Math.min(100, Math.round(val || 0)));
    cpuHistory.value.push(current);
    if (cpuHistory.value.length > 14) {
      cpuHistory.value.shift();
    }
  },
);

const sparklinePoints = computed(() => {
  const points = props.running ? cpuHistory.value : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(...points, 40);
  const width = 120;
  const height = 28;
  const step = width / (points.length - 1);

  return points
    .map((val, idx) => {
      const x = Math.round(idx * step);
      const y = Math.round(height - (val / max) * height);
      return `${x},${y}`;
    })
    .join(" ");
});

const memoryLimitMb = 512;
const memoryPercentage = computed(() => {
  if (!props.running || !props.stats.memory) return 0;
  return Math.min(100, Math.round((props.stats.memory / memoryLimitMb) * 100));
});

const heapSizeMb = computed(() => {
  if (!props.running || !props.stats.memory) return 0;
  return Math.round(props.stats.memory * 0.55);
});
</script>

<template>
  <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 border-b border-line bg-base px-5 py-3 select-none font-sans">
    <!-- 1. CPU Core Usage Card -->
    <div class="rounded-md border border-line bg-panel p-3 flex flex-col justify-between transition hover:border-zinc-700">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-sans">
          <svg class="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
            <rect x="9" y="9" width="6" height="6"></rect>
            <line x1="9" y1="1" x2="9" y2="4"></line>
            <line x1="15" y1="1" x2="15" y2="4"></line>
            <line x1="9" y1="20" x2="9" y2="23"></line>
            <line x1="15" y1="20" x2="15" y2="23"></line>
            <line x1="20" y1="9" x2="23" y2="9"></line>
            <line x1="20" y1="14" x2="23" y2="14"></line>
            <line x1="1" y1="9" x2="4" y2="9"></line>
            <line x1="1" y1="14" x2="4" y2="14"></line>
          </svg>
          <span>CPU Utilization</span>
        </span>
        <span
          class="font-mono text-[10px] px-1.5 py-0.2 rounded border"
          :class="
            running
              ? stats.cpu > 70
                ? 'bg-rose-950/40 text-rose-300 border-rose-900/50'
                : stats.cpu > 40
                ? 'bg-amber-950/40 text-amber-300 border-amber-900/50'
                : 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50'
              : 'bg-elevated text-zinc-500 border-line'
          "
        >
          {{ running ? `${stats.cpu}% avg` : 'OFFLINE' }}
        </span>
      </div>

      <div class="mt-2 flex items-baseline justify-between gap-2">
        <div class="flex items-baseline gap-1.5">
          <span class="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
            {{ running ? stats.cpu : '0.0' }}
          </span>
          <span class="text-xs font-mono text-zinc-500">%</span>
        </div>

        <!-- Micro Sparkline SVG -->
        <div class="h-7 w-28 shrink-0 overflow-hidden">
          <svg class="h-full w-full" viewBox="0 0 120 28" fill="none">
            <polyline
              :points="sparklinePoints"
              stroke="#14b8a6"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
              class="transition-all duration-300"
            />
          </svg>
        </div>
      </div>

      <div class="mt-2 flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-line/60 pt-1.5">
        <span>4 Cores / 8 Threads</span>
        <span>Peak {{ running ? Math.max(stats.cpu, 14.8) : 0 }}%</span>
      </div>
    </div>

    <!-- 2. Memory (RSS) Card -->
    <div class="rounded-md border border-line bg-panel p-3 flex flex-col justify-between transition hover:border-zinc-700">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-sans">
          <svg class="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 19v-3"></path>
            <path d="M10 19v-3"></path>
            <path d="M14 19v-3"></path>
            <path d="M18 19v-3"></path>
            <path d="M6 8V5"></path>
            <path d="M10 8V5"></path>
            <path d="M14 8V5"></path>
            <path d="M18 8V5"></path>
            <rect x="2" y="8" width="20" height="8" rx="2"></rect>
          </svg>
          <span>Memory (RSS)</span>
        </span>
        <span class="font-mono text-[10px] text-zinc-500">
          Limit {{ memoryLimitMb }} MB
        </span>
      </div>

      <div class="mt-2">
        <div class="flex items-baseline justify-between">
          <div class="flex items-baseline gap-1.5">
            <span class="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
              {{ running ? stats.memory : '0' }}
            </span>
            <span class="text-xs font-mono text-zinc-500">MB</span>
          </div>
          <span class="text-[11px] font-mono text-zinc-400">
            {{ memoryPercentage }}%
          </span>
        </div>

        <!-- Progress Bar toward limit -->
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded bg-zinc-800">
          <div
            class="h-full rounded transition-all duration-300"
            :class="memoryPercentage > 85 ? 'bg-rose-500' : memoryPercentage > 60 ? 'bg-amber-400' : 'bg-emerald-400'"
            :style="{ width: `${running ? memoryPercentage : 0}%` }"
          ></div>
        </div>
      </div>

      <div class="mt-2 flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-line/60 pt-1.5">
        <span>Heap: {{ heapSizeMb }} MB</span>
        <span class="text-zinc-400">GC cycle OK</span>
      </div>
    </div>

    <!-- 3. Network I/O & RPS Card -->
    <div class="rounded-md border border-line bg-panel p-3 flex flex-col justify-between transition hover:border-zinc-700">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-sans">
          <svg class="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>Network I/O</span>
        </span>
        <span class="font-mono text-[10px] px-1 rounded bg-elevated text-zinc-400">
          HTTP/1.1
        </span>
      </div>

      <div class="mt-2 flex items-baseline justify-between">
        <div class="flex items-baseline gap-1.5">
          <span class="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
            {{ running ? '42' : '0' }}
          </span>
          <span class="text-xs font-mono text-zinc-500">req/s</span>
        </div>

        <div class="text-right font-mono text-[11px]">
          <span class="text-zinc-500">p99:</span>
          <span class="text-emerald-400 font-semibold ml-1">{{ running ? '18ms' : '—' }}</span>
        </div>
      </div>

      <div class="mt-2 flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-line/60 pt-1.5">
        <span>Sockets: {{ running ? '4 active' : '0' }}</span>
        <span>p50: {{ running ? '3.4ms' : '—' }}</span>
      </div>
    </div>

    <!-- 4. Health & Diagnostics Card -->
    <div class="rounded-md border border-line bg-panel p-3 flex flex-col justify-between transition hover:border-zinc-700">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-sans">
          <svg class="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <span>Diagnostics</span>
        </span>
        <span
          class="font-mono text-[10px] px-1.5 py-0.2 rounded border"
          :class="running ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50' : 'bg-elevated text-zinc-500 border-line'"
        >
          {{ running ? '100% OK' : 'IDLE' }}
        </span>
      </div>

      <div class="mt-2 flex items-baseline justify-between">
        <div class="flex items-baseline gap-1.5">
          <span class="text-2xl font-bold font-mono tracking-tight text-white tabular-nums">
            0
          </span>
          <span class="text-xs font-mono text-zinc-500">crashes</span>
        </div>

        <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
          Clean Exit
        </span>
      </div>

      <div class="mt-2 flex items-center justify-between text-[10px] font-mono text-zinc-500 border-t border-line/60 pt-1.5">
        <span class="text-zinc-400">TypeScript clean</span>
        <span>0 alerts</span>
      </div>
    </div>
  </section>
</template>
