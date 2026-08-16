<script setup lang="ts">
import { computed } from "vue";
import { useCodeGraphStore } from "../../stores/codeGraph.store";

const store = useCodeGraphStore();
const stats = computed(() => store.graphData?.stats);

const layerChips = [
  { key: "route", label: "Routes", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  { key: "controller", label: "Controllers", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { key: "service", label: "Services", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { key: "model", label: "Models", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { key: "middleware", label: "Middlewares", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { key: "component", label: "Components", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
] as const;
</script>

<template>
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
    <!-- Health Score -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Architecture Health</span>
        <span class="text-xs">🛡️</span>
      </div>
      <div class="mt-2 flex items-baseline gap-1">
        <span
          class="text-xl font-extrabold font-mono"
          :class="
            (stats?.healthScore ?? 100) >= 80
              ? 'text-running'
              : (stats?.healthScore ?? 100) >= 60
              ? 'text-warn'
              : 'text-stopped'
          "
        >
          {{ stats?.healthScore ?? 100 }}
        </span>
        <span class="text-[10px] text-muted">/ 100</span>
      </div>
    </div>

    <!-- Total Files & LOC -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Total Source Files</span>
        <span class="text-xs">📁</span>
      </div>
      <div class="mt-2">
        <span class="text-xl font-extrabold text-ink font-mono">{{ stats?.totalFiles ?? 0 }}</span>
        <span class="text-[10px] text-muted ml-1">({{ stats?.totalLines ?? 0 }} LOC)</span>
      </div>
    </div>

    <!-- Total Connections / Edges -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Import Edges</span>
        <span class="text-xs">🔗</span>
      </div>
      <div class="mt-2">
        <span class="text-xl font-extrabold text-ink font-mono">{{ stats?.totalConnections ?? 0 }}</span>
        <span class="text-[10px] text-muted ml-1">connections</span>
      </div>
    </div>

    <!-- Circular Dependencies -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Circular Cycles</span>
        <span class="text-xs">🔄</span>
      </div>
      <div class="mt-2">
        <span
          class="text-xl font-extrabold font-mono"
          :class="(stats?.circularCyclesCount ?? 0) > 0 ? 'text-stopped' : 'text-running'"
        >
          {{ stats?.circularCyclesCount ?? 0 }}
        </span>
        <span class="text-[10px] text-muted ml-1">cycles</span>
      </div>
    </div>

    <!-- Orphan Files -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Orphan Files</span>
        <span class="text-xs">👻</span>
      </div>
      <div class="mt-2">
        <span
          class="text-xl font-extrabold font-mono"
          :class="(stats?.orphanCount ?? 0) > 0 ? 'text-warn' : 'text-ink'"
        >
          {{ stats?.orphanCount ?? 0 }}
        </span>
        <span class="text-[10px] text-muted ml-1">unreferenced</span>
      </div>
    </div>

    <!-- Layer Quick Stats -->
    <div class="rounded-xl border border-line bg-panel p-3.5 shadow-xs flex flex-col justify-between">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-bold uppercase tracking-wider text-muted font-mono">Layer Stack</span>
        <span class="text-xs">🏗️</span>
      </div>
      <div class="mt-1 flex flex-wrap gap-1">
        <span
          v-for="chip in layerChips"
          :key="chip.key"
          class="rounded px-1.5 py-0.5 text-[9px] font-bold font-mono border"
          :class="chip.color"
        >
          {{ stats?.layerCounts?.[chip.key] ?? 0 }} {{ chip.key.slice(0, 3) }}
        </span>
      </div>
    </div>
  </div>
</template>
