<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useTracesStore } from "../stores/traces.store";
import TraceStatsCards from "../components/traces/TraceStatsCards.vue";
import TraceList from "../components/traces/TraceList.vue";
import TraceWaterfall from "../components/traces/TraceWaterfall.vue";
import TraceFlamegraph from "../components/traces/TraceFlamegraph.vue";

const store = useTracesStore();
const activeTab = ref<"waterfall" | "flamegraph">("waterfall");

onMounted(async () => {
  store.bindSocket();
  await Promise.all([store.fetchTraces(), store.fetchStats()]);
});
</script>

<template>
  <div class="flex h-full flex-1 flex-col overflow-hidden bg-base">
    <!-- Top Action Bar -->
    <div class="border-b border-line bg-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div class="flex items-center gap-3">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent text-base border border-accent/30 shadow-xs">
          📊
        </div>
        <div>
          <h1 class="text-sm font-extrabold text-ink leading-tight flex items-center gap-2">
            Distributed Tracing & APM
            <span class="rounded-full bg-running/20 text-running px-2 py-0.5 text-[9px] font-mono font-bold uppercase border border-running/30">
              Live Realtime
            </span>
          </h1>
          <p class="text-[11px] text-muted">
            Request Waterfall, Database Query Latency, and Flamegraph Bottleneck Profiler
          </p>
        </div>
      </div>

      <!-- Quick Action Toolbar -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Live Stream Toggle -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition shadow-xs"
          :class="
            store.isAutoRefresh
              ? 'border-running/40 bg-running/10 text-running'
              : 'border-line bg-elevated text-muted hover:text-ink'
          "
          @click="store.isAutoRefresh = !store.isAutoRefresh"
        >
          <span class="h-2 w-2 rounded-full" :class="store.isAutoRefresh ? 'bg-running animate-ping' : 'bg-muted'"></span>
          <span>{{ store.isAutoRefresh ? 'Live Stream: ON' : 'Paused' }}</span>
        </button>

        <!-- Generate Demo Button -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-bold text-accent transition hover:bg-accent/25 shadow-xs"
          :disabled="store.actionLoading"
          @click="store.generateDemo(6)"
        >
          <span>⚡</span>
          <span>Generate Demo Traffic</span>
        </button>

        <!-- Refresh Button -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-line shadow-xs"
          :disabled="store.loading"
          @click="store.fetchTraces(); store.fetchStats();"
        >
          <span>🔄</span>
          <span class="hidden sm:inline">Refresh</span>
        </button>

        <!-- Clear Button -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-stopped/30 bg-stopped/10 px-2.5 py-1 text-xs font-semibold text-stopped transition hover:bg-stopped/20 shadow-xs"
          :disabled="store.actionLoading || store.traces.length === 0"
          @click="store.clearAllTraces()"
        >
          <span>🗑️</span>
          <span class="hidden sm:inline">Clear</span>
        </button>
      </div>
    </div>

    <!-- Error Banner -->
    <div
      v-if="store.error"
      class="border-b border-stopped/40 bg-stopped/15 px-4 py-2 text-xs font-medium text-stopped flex items-center justify-between"
    >
      <span>⚠️ {{ store.error }}</span>
      <button type="button" class="underline text-[11px] text-stopped/80 hover:text-stopped" @click="store.error = null">Dismiss</button>
    </div>

    <!-- Metrics Summary Cards -->
    <div class="p-4 border-b border-line bg-panel/50 shrink-0">
      <TraceStatsCards />
    </div>

    <!-- Main Workspace Split Pane -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Left Column: Request Feed (320px -> 380px) -->
      <div class="w-80 md:w-96 shrink-0 h-full flex flex-col overflow-hidden">
        <TraceList />
      </div>

      <!-- Right Column: Visualizer View (Waterfall / Flamegraph) -->
      <div class="flex-1 flex flex-col h-full overflow-hidden bg-base">
        <!-- Visualizer Subheader with Tab Selector -->
        <div class="border-b border-line bg-panel px-4 py-2 flex items-center justify-between gap-2 shrink-0">
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition font-mono"
              :class="
                activeTab === 'waterfall'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-muted hover:bg-elevated hover:text-ink'
              "
              @click="activeTab = 'waterfall'"
            >
              <span>📊</span>
              <span>Waterfall Timeline</span>
            </button>

            <button
              type="button"
              class="flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition font-mono"
              :class="
                activeTab === 'flamegraph'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-muted hover:bg-elevated hover:text-ink'
              "
              @click="activeTab = 'flamegraph'"
            >
              <span>🔥</span>
              <span>Flamegraph & Bottlenecks</span>
            </button>
          </div>

          <div v-if="store.selectedTrace" class="hidden sm:flex items-center gap-2 text-[11px] font-mono text-muted">
            <span>Viewing: <b class="text-ink">{{ store.selectedTrace.method }} {{ store.selectedTrace.path }}</b></span>
          </div>
        </div>

        <!-- Visualizer Content Pane -->
        <div class="flex-1 overflow-hidden">
          <TraceWaterfall v-if="activeTab === 'waterfall'" :trace="store.selectedTrace" />
          <TraceFlamegraph v-else :trace="store.selectedTrace" />
        </div>
      </div>
    </div>
  </div>
</template>
