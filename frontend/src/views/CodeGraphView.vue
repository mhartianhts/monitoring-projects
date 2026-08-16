<script setup lang="ts">
import { onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import { useCodeGraphStore } from "../stores/codeGraph.store";
import type { GraphLayerType } from "../types/codeGraph.types";
import ArchitectureMetricsCards from "../components/graph/ArchitectureMetricsCards.vue";
import ArchitectureTopology from "../components/graph/ArchitectureTopology.vue";
import NodeInspectorDrawer from "../components/graph/NodeInspectorDrawer.vue";

const projectStore = useProjectStore();
const graphStore = useCodeGraphStore();
const { selectedId } = storeToRefs(projectStore);

const availableLayers: { key: GraphLayerType; label: string; icon: string }[] = [
  { key: "route", label: "Routes", icon: "🌐" },
  { key: "controller", label: "Controllers", icon: "🕹️" },
  { key: "service", label: "Services", icon: "⚙️" },
  { key: "model", label: "Models", icon: "💾" },
  { key: "middleware", label: "Middlewares", icon: "🛡️" },
  { key: "component", label: "Components", icon: "🎨" },
  { key: "store", label: "Stores", icon: "📦" },
  { key: "util", label: "Utils", icon: "🔧" },
  { key: "config", label: "Config", icon: "⚙️" },
];

const loadGraph = async () => {
  if (selectedId.value) {
    await graphStore.fetchGraph(selectedId.value);
  }
};

watch(
  () => selectedId.value,
  () => {
    void loadGraph();
  }
);

onMounted(() => {
  void loadGraph();
});
</script>

<template>
  <div class="flex h-full flex-1 flex-col overflow-hidden bg-base">
    <!-- Top Action Bar -->
    <div class="border-b border-line bg-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent text-base border border-accent/30 shadow-xs shrink-0">
          🕸️
        </div>
        <div class="min-w-0">
          <h1 class="text-sm font-extrabold text-ink leading-tight flex items-center gap-2 truncate">
            Codebase Knowledge Graph
            <span v-if="projectStore.selected" class="rounded-full bg-accent/20 text-accent px-2 py-0.5 text-[9px] font-mono font-bold border border-accent/30">
              {{ projectStore.selected.name }}
            </span>
          </h1>
          <p class="text-[11px] text-muted truncate">
            Interactive Architecture Topology, Callers, Dependencies & Dead-Code Analyzer
          </p>
        </div>
      </div>

      <!-- Controls & Search -->
      <div class="flex flex-wrap items-center gap-2">
        <!-- Search Box -->
        <input
          v-model="graphStore.search"
          type="search"
          placeholder="Filter file name..."
          class="rounded-lg border border-line bg-base px-2.5 py-1 text-xs text-ink placeholder:text-muted outline-none focus:border-accent w-36 sm:w-48"
        />

        <!-- Layout Mode Switcher -->
        <div class="flex items-center rounded-lg border border-line bg-base p-0.5">
          <button
            type="button"
            class="rounded px-2 py-0.5 text-xs font-mono font-semibold transition"
            :class="graphStore.layoutMode === 'force' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-ink'"
            @click="graphStore.layoutMode = 'force'"
          >
            ⚛️ Physics
          </button>
          <button
            type="button"
            class="rounded px-2 py-0.5 text-xs font-mono font-semibold transition"
            :class="graphStore.layoutMode === 'column' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-ink'"
            @click="graphStore.layoutMode = 'column'"
          >
            🏛️ Columns
          </button>
        </div>

        <!-- Reload / Rescan Button -->
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-line shadow-xs"
          :disabled="graphStore.loading || !selectedId"
          @click="loadGraph"
        >
          <span>🔄</span>
          <span class="hidden sm:inline">Rescan</span>
        </button>
      </div>
    </div>

    <!-- Layer Filter Chips Sub-bar -->
    <div class="border-b border-line bg-panel/60 px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
      <div class="flex flex-wrap items-center gap-1 text-[10px] font-mono">
        <span class="text-muted font-bold mr-1">LAYERS:</span>
        <button
          v-for="layer in availableLayers"
          :key="layer.key"
          type="button"
          class="rounded px-2 py-0.5 font-medium transition border"
          :class="
            graphStore.selectedLayers.has(layer.key)
              ? 'bg-accent/15 border-accent/40 text-accent font-bold shadow-xs'
              : 'border-line text-muted hover:text-ink bg-base'
          "
          @click="graphStore.toggleLayer(layer.key)"
        >
          {{ layer.icon }} {{ layer.label }}
        </button>
      </div>

      <div class="flex items-center gap-2 text-[10px] font-mono text-muted">
        <button type="button" class="hover:text-accent underline" @click="graphStore.selectCoreLayers">
          Core Layers Only
        </button>
        <span>•</span>
        <button type="button" class="hover:text-accent underline" @click="graphStore.selectAllLayers">
          Show All
        </button>
      </div>
    </div>

    <!-- Metrics Cards Bar -->
    <div class="p-3 border-b border-line bg-panel/40 shrink-0">
      <ArchitectureMetricsCards />
    </div>

    <!-- Error Banner -->
    <div
      v-if="graphStore.error"
      class="border-b border-stopped/40 bg-stopped/15 px-4 py-2 text-xs font-medium text-stopped flex items-center justify-between"
    >
      <span>⚠️ {{ graphStore.error }}</span>
      <button type="button" class="underline text-[11px] text-stopped/80 hover:text-stopped" @click="graphStore.error = null">Dismiss</button>
    </div>

    <!-- Main Workspace Split Pane -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Left / Center: Topology Canvas -->
      <div class="flex-1 h-full overflow-hidden relative">
        <div v-if="graphStore.loading" class="flex h-full items-center justify-center text-xs text-muted animate-pulse">
          Menganalisis dependensi arsitektur kode...
        </div>
        <div v-else-if="!selectedId" class="flex h-full items-center justify-center text-xs text-muted">
          Pilih project dari sidebar untuk memuat Codebase Knowledge Graph.
        </div>
        <ArchitectureTopology v-else />
      </div>

      <!-- Right: Node Inspector Drawer -->
      <NodeInspectorDrawer />
    </div>
  </div>
</template>
