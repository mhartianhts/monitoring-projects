<script setup lang="ts">
import { computed } from "vue";
import { useTracesStore } from "../../stores/traces.store";

const store = useTracesStore();
const stats = computed(() => store.stats);

const breakdownItems = [
  { key: "http", label: "HTTP Root", color: "bg-cyan-500", text: "text-cyan-400" },
  { key: "database", label: "Database", color: "bg-emerald-500", text: "text-emerald-400" },
  { key: "middleware", label: "Middleware", color: "bg-amber-500", text: "text-amber-400" },
  { key: "compute", label: "Compute / Crypto", color: "bg-purple-500", text: "text-purple-400" },
  { key: "cache", label: "Cache (Redis)", color: "bg-blue-500", text: "text-blue-400" },
  { key: "external", label: "External API", color: "bg-rose-500", text: "text-rose-400" },
] as const;
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    <!-- Total Requests -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Total Requests</span>
        <span class="text-xs">⚡</span>
      </div>
      <div class="mt-2">
        <span class="text-xl font-extrabold text-ink font-mono">{{ stats?.totalRequests ?? 0 }}</span>
        <span class="text-[10px] text-muted ml-1">sampled</span>
      </div>
    </div>

    <!-- Avg Latency -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Avg Latency</span>
        <span class="text-xs">⏱️</span>
      </div>
      <div class="mt-2">
        <span class="text-xl font-extrabold text-ink font-mono">{{ stats?.avgLatencyMs ?? 0 }}</span>
        <span class="text-[10px] text-muted ml-1">ms</span>
      </div>
    </div>

    <!-- p95 Latency -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">p95 Latency</span>
        <span class="text-xs">📈</span>
      </div>
      <div class="mt-2">
        <span
          class="text-xl font-extrabold font-mono"
          :class="(stats?.p95LatencyMs ?? 0) > 400 ? 'text-warn' : 'text-ink'"
        >
          {{ stats?.p95LatencyMs ?? 0 }}
        </span>
        <span class="text-[10px] text-muted ml-1">ms</span>
      </div>
    </div>

    <!-- p99 Latency -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">p99 Latency</span>
        <span class="text-xs">🎯</span>
      </div>
      <div class="mt-2">
        <span
          class="text-xl font-extrabold font-mono"
          :class="(stats?.p99LatencyMs ?? 0) > 600 ? 'text-stopped' : 'text-ink'"
        >
          {{ stats?.p99LatencyMs ?? 0 }}
        </span>
        <span class="text-[10px] text-muted ml-1">ms</span>
      </div>
    </div>

    <!-- Error Rate -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Error Rate</span>
        <span class="text-xs">🚨</span>
      </div>
      <div class="mt-2">
        <span
          class="text-xl font-extrabold font-mono"
          :class="(stats?.errorRatePct ?? 0) > 0 ? 'text-stopped' : 'text-running'"
        >
          {{ stats?.errorRatePct ?? 0 }}%
        </span>
        <span class="text-[10px] text-muted ml-1">failures</span>
      </div>
    </div>

    <!-- Layer Breakdown Overview -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Layer Hotspots</span>
        <span class="text-xs">🔥</span>
      </div>
      <!-- Stacked Mini Bar -->
      <div class="mt-2 flex h-3 w-full overflow-hidden rounded bg-base border border-line">
        <template v-for="item in breakdownItems" :key="item.key">
          <div
            v-if="(stats?.layerBreakdown?.[item.key] ?? 0) > 0"
            :class="item.color"
            :style="{ width: `${stats?.layerBreakdown?.[item.key]}%` }"
            :title="`${item.label}: ${stats?.layerBreakdown?.[item.key]}%`"
          ></div>
        </template>
      </div>
      <div class="mt-1 flex items-center justify-between text-[9px] font-mono text-muted">
        <span>DB: {{ stats?.layerBreakdown?.database ?? 0 }}%</span>
        <span>HTTP: {{ stats?.layerBreakdown?.http ?? 0 }}%</span>
      </div>
    </div>
  </div>
</template>
