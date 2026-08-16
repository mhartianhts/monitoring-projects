<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import { useOpenApiStore } from "../stores/openapi.store";
import EndpointList from "../components/openapi/EndpointList.vue";
import ApiTesterPanel from "../components/openapi/ApiTesterPanel.vue";
import OpenApiDocViewer from "../components/openapi/OpenApiDocViewer.vue";

const projectStore = useProjectStore();
const openApiStore = useOpenApiStore();
const { selectedId } = storeToRefs(projectStore);

const activeViewTab = ref<"tester" | "spec">("tester");

const loadSpec = async () => {
  if (selectedId.value) {
    await openApiStore.fetchSpec(selectedId.value);
  }
};

watch(
  () => selectedId.value,
  () => {
    void loadSpec();
  }
);

onMounted(() => {
  void loadSpec();
});
</script>

<template>
  <div class="flex h-full flex-1 flex-col overflow-hidden bg-base">
    <!-- Top Header & Toolbar -->
    <div class="border-b border-line bg-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent text-base border border-accent/30 shadow-xs shrink-0">
          ⚡
        </div>
        <div class="min-w-0">
          <h1 class="text-sm font-extrabold text-ink leading-tight flex items-center gap-2 truncate">
            OpenAPI 3.0 & API Workspace
            <span v-if="projectStore.selected" class="rounded-full bg-accent/20 text-accent px-2 py-0.5 text-[9px] font-mono font-bold border border-accent/30">
              {{ projectStore.selected.name }}
            </span>
            <span v-if="openApiStore.specData" class="rounded-full bg-running/20 text-running px-2 py-0.5 text-[9px] font-mono font-bold border border-running/30">
              {{ openApiStore.specData.endpointsCount }} Endpoints
            </span>
          </h1>
          <p class="text-[11px] text-muted truncate">
            Dynamic Route Discovery, Schema Inference, and In-Dashboard API Request Tester
          </p>
        </div>
      </div>

      <!-- Tab Switcher & Rescan Toolbar -->
      <div class="flex items-center gap-2">
        <div class="flex items-center rounded-lg border border-line bg-base p-0.5">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded px-3 py-1 text-xs font-mono font-semibold transition"
            :class="activeViewTab === 'tester' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-ink'"
            @click="activeViewTab = 'tester'"
          >
            <span>⚡</span>
            <span>API Tester</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded px-3 py-1 text-xs font-mono font-semibold transition"
            :class="activeViewTab === 'spec' ? 'bg-accent text-white shadow-xs' : 'text-muted hover:text-ink'"
            @click="activeViewTab = 'spec'"
          >
            <span>📜</span>
            <span>OpenAPI Spec</span>
          </button>
        </div>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-line shadow-xs"
          :disabled="openApiStore.loading || !selectedId"
          @click="loadSpec"
        >
          <span>🔄</span>
          <span class="hidden sm:inline">Rescan</span>
        </button>
      </div>
    </div>

    <!-- Error Banner -->
    <div
      v-if="openApiStore.error"
      class="border-b border-stopped/40 bg-stopped/15 px-4 py-2 text-xs font-medium text-stopped flex items-center justify-between"
    >
      <span>⚠️ {{ openApiStore.error }}</span>
      <button type="button" class="underline text-[11px] text-stopped/80 hover:text-stopped" @click="openApiStore.error = null">Dismiss</button>
    </div>

    <!-- Main Workspace Split Pane -->
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <!-- Left Column: Endpoint List (visible only when in tester mode) -->
      <EndpointList v-if="activeViewTab === 'tester'" />

      <!-- Right Column: Tester Panel or OpenAPI Doc Viewer -->
      <ApiTesterPanel v-if="activeViewTab === 'tester'" />
      <OpenApiDocViewer v-else />
    </div>
  </div>
</template>
