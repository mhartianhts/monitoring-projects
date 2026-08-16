<script setup lang="ts">
import { useOpenApiStore } from "../../stores/openapi.store";

const store = useOpenApiStore();

const methodBadge = (method: string) => {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "POST":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    case "PUT":
    case "PATCH":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    default:
      return "bg-gray-500/15 text-gray-400 border-gray-500/30";
  }
};
</script>

<template>
  <div class="flex h-full flex-col border-r border-line bg-panel overflow-hidden w-80 md:w-96 shrink-0">
    <!-- Filter & Search Toolbar -->
    <div class="p-3 border-b border-line space-y-2.5">
      <input
        v-model="store.search"
        type="search"
        placeholder="Filter endpoint path / summary..."
        class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs text-ink placeholder:text-muted outline-none focus:border-accent"
      />

      <!-- Tag / Resource Dropdown Filter -->
      <div class="flex items-center gap-2">
        <select
          v-model="store.selectedTag"
          class="w-full rounded-lg border border-line bg-base px-2.5 py-1 text-xs text-ink outline-none focus:border-accent"
        >
          <option value="all">Semua Resource ({{ store.specData?.endpointsCount || 0 }})</option>
          <option v-for="tag in store.availableTags" :key="tag" :value="tag">
            {{ tag }}
          </option>
        </select>
      </div>

      <!-- HTTP Method Filter Chips -->
      <div class="flex items-center gap-1 text-[10px] font-mono">
        <button
          v-for="m in ['all', 'GET', 'POST', 'PUT', 'DELETE']"
          :key="m"
          type="button"
          class="rounded px-1.5 py-0.5 transition uppercase border"
          :class="
            store.selectedMethod === m
              ? 'bg-accent/20 border-accent text-accent font-bold'
              : 'border-line text-muted hover:text-ink bg-base'
          "
          @click="store.selectedMethod = m"
        >
          {{ m }}
        </button>
      </div>
    </div>

    <!-- Grouped Endpoints Tree List -->
    <div class="flex-1 overflow-y-auto divide-y divide-line/30 p-2 space-y-3">
      <div v-if="store.loading" class="p-8 text-center text-xs text-muted animate-pulse">
        Memindai rute & menyusun OpenAPI spec...
      </div>

      <div
        v-else-if="store.filteredEndpoints.length === 0"
        class="p-8 text-center text-xs text-muted flex flex-col items-center justify-center gap-2"
      >
        <span class="text-2xl">📡</span>
        <p class="font-medium text-ink">Tidak ada endpoint yang cocok</p>
      </div>

      <template v-else>
        <div v-for="(endpoints, tag) in store.groupedEndpoints" :key="tag" class="space-y-1">
          <!-- Tag Header -->
          <div class="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted font-mono">
            <span class="flex items-center gap-1.5">
              <span>🏷️</span> {{ tag }}
            </span>
            <span class="rounded bg-elevated px-1 py-0.2 border border-line">{{ endpoints.length }}</span>
          </div>

          <!-- Endpoint Buttons -->
          <div class="space-y-1">
            <button
              v-for="ep in endpoints"
              :key="ep.id"
              type="button"
              class="w-full flex items-center justify-between gap-2 rounded-lg p-2 text-left transition hover:bg-elevated group"
              :class="store.selectedEndpointId === ep.id ? 'bg-accent/15 border border-accent/40 text-accent font-semibold shadow-xs' : 'border border-transparent text-ink'"
              @click="store.selectEndpoint(ep)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase font-mono border shrink-0"
                  :class="methodBadge(ep.method)"
                >
                  {{ ep.method }}
                </span>
                <span class="truncate text-xs font-mono group-hover:text-accent transition-colors" :title="ep.path">
                  {{ ep.path }}
                </span>
              </div>
              <span class="text-[10px] text-muted shrink-0 font-mono">➔</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
