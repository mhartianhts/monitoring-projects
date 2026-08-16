<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../../stores/project.store";
import StatusDot from "../project/StatusDot.vue";

const route = useRoute();
const store = useProjectStore();
const { projects, filtered, selectedId, selected, search, loading } = storeToRefs(store);

const isCollapsed = ref(false);
const showProjectPicker = ref(false);
const statusFilter = ref<"all" | "running" | "stopped" | "favorites">("all");

const filteredProjects = computed(() => {
  let list = filtered.value;
  if (statusFilter.value === "running") {
    list = list.filter((p) => p.status === "running");
  } else if (statusFilter.value === "stopped") {
    list = list.filter((p) => p.status === "stopped");
  } else if (statusFilter.value === "favorites") {
    list = list.filter((p) => p.favorite);
  }
  return list;
});

const countRunning = computed(() => projects.value.filter((p) => p.status === "running").length);
const countStopped = computed(() => projects.value.filter((p) => p.status === "stopped").length);
const countFav = computed(() => projects.value.filter((p) => p.favorite).length);

const onSelectProject = (id: string) => {
  void store.selectProject(id);
  showProjectPicker.value = false;
};

const onToggleFavorite = (event: Event, projectId: string) => {
  event.stopPropagation();
  void store.toggleFavorite(projectId);
};

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
  if (isCollapsed.value) {
    showProjectPicker.value = false;
  }
};
</script>

<template>
  <aside
    class="relative flex h-full shrink-0 flex-col border-r border-line bg-panel transition-all duration-300 ease-in-out z-30"
    :class="isCollapsed ? 'w-16' : 'w-64'"
  >
    <!-- Sidebar Header: App Logo & Collapse Button -->
    <div class="flex items-center justify-between border-b border-line px-3 py-3">
      <div v-if="!isCollapsed" class="flex items-center gap-2 min-w-0">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-dim text-base shadow-sm shrink-0">
          ⚡
        </div>
        <div class="min-w-0">
          <p class="text-xs font-bold uppercase tracking-[0.18em] text-ink leading-tight">Local PM</p>
          <p class="text-[9px] font-mono text-accent">v1.4 Pro</p>
        </div>
      </div>
      <div v-else class="mx-auto">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-dim text-base shadow-sm">
          ⚡
        </div>
      </div>

      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-elevated text-muted hover:text-ink hover:bg-line transition"
        :title="isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'"
        @click="toggleCollapse"
      >
        <span class="text-xs">{{ isCollapsed ? '➔' : '⬅' }}</span>
      </button>
    </div>

    <!-- Active Project Selector Card / Dropdown Trigger -->
    <div class="border-b border-line p-2 relative">
      <button
        type="button"
        class="w-full flex items-center justify-between rounded-lg border border-line bg-base p-2.5 text-left transition hover:border-accent/40 group"
        :title="selected ? `Project Aktif: ${selected.name}` : 'Pilih Project'"
        @click="showProjectPicker = !showProjectPicker"
      >
        <template v-if="selected">
          <div class="flex items-center gap-2 min-w-0">
            <StatusDot :status="selected.status" />
            <div v-if="!isCollapsed" class="min-w-0">
              <span class="block truncate text-xs font-bold text-ink group-hover:text-accent transition-colors">
                {{ selected.name }}
              </span>
              <span class="block truncate font-mono text-[10px] text-muted">
                {{ selected.type }} · {{ selected.port ? `:${selected.port}` : selected.id }}
              </span>
            </div>
          </div>
          <span v-if="!isCollapsed" class="text-xs text-muted group-hover:text-ink">
            {{ showProjectPicker ? '▲' : '▼' }}
          </span>
        </template>
        <template v-else>
          <div class="flex items-center gap-2 text-xs text-muted">
            <span>📦</span>
            <span v-if="!isCollapsed">Pilih Project...</span>
          </div>
          <span v-if="!isCollapsed" class="text-xs text-muted">▼</span>
        </template>
      </button>

      <!-- Project Picker Dropdown Popover Overlay -->
      <div
        v-if="showProjectPicker && !isCollapsed"
        class="absolute left-2 right-2 top-full mt-1.5 z-50 rounded-lg border border-line bg-panel p-2 shadow-2xl space-y-2 max-h-96 flex flex-col"
      >
        <div class="flex items-center justify-between border-b border-line pb-2 px-1">
          <span class="text-[10px] font-bold uppercase tracking-wider text-muted">Select Active Project</span>
          <button type="button" class="text-xs text-muted hover:text-ink font-bold" @click="showProjectPicker = false">✕</button>
        </div>

        <input
          v-model="search"
          type="search"
          placeholder="Filter project..."
          class="w-full rounded border border-line bg-base px-2.5 py-1.5 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
        />

        <!-- Filter Chips -->
        <div class="flex items-center gap-1 text-[10px] border-b border-line pb-1.5 overflow-x-auto">
          <button
            type="button"
            class="rounded px-1.5 py-0.5 font-medium transition"
            :class="statusFilter === 'all' ? 'bg-accent/20 text-accent font-bold' : 'text-muted hover:text-ink'"
            @click="statusFilter = 'all'"
          >
            All ({{ projects.length }})
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5 font-medium transition"
            :class="statusFilter === 'running' ? 'bg-running/20 text-running font-bold' : 'text-muted hover:text-ink'"
            @click="statusFilter = 'running'"
          >
            Run ({{ countRunning }})
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5 font-medium transition"
            :class="statusFilter === 'stopped' ? 'bg-stopped/20 text-stopped font-bold' : 'text-muted hover:text-ink'"
            @click="statusFilter = 'stopped'"
          >
            Stop ({{ countStopped }})
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5 font-medium transition"
            :class="statusFilter === 'favorites' ? 'bg-warn/20 text-warn font-bold' : 'text-muted hover:text-ink'"
            @click="statusFilter = 'favorites'"
          >
            ★ ({{ countFav }})
          </button>
        </div>

        <!-- Project Items List inside Popover -->
        <div class="flex-1 overflow-y-auto space-y-1 max-h-56 pr-0.5">
          <p v-if="loading" class="text-xs text-muted text-center py-2 animate-pulse">Memuat...</p>
          <p v-else-if="filteredProjects.length === 0" class="text-xs text-muted text-center py-2">Tidak ditemukan</p>
          <template v-else>
            <button
              v-for="proj in filteredProjects"
              :key="proj.id"
              type="button"
              class="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-elevated text-xs"
              :class="selectedId === proj.id ? 'bg-accent/15 border border-accent/30 text-accent font-semibold' : 'text-ink'"
              @click="onSelectProject(proj.id)"
            >
              <StatusDot :status="proj.status" />
              <span class="truncate flex-1 font-medium">{{ proj.name }}</span>
              <span
                role="button"
                tabindex="0"
                class="shrink-0 text-xs transition hover:scale-125"
                :class="proj.favorite ? 'text-warn' : 'text-muted/30 hover:text-warn'"
                @click="onToggleFavorite($event, proj.id)"
              >
                {{ proj.favorite ? '★' : '☆' }}
              </span>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Main Navigation Menu Links (Middle Section) -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
      <div v-if="!isCollapsed" class="px-2 pt-1 pb-1">
        <span class="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Feature Navigation</span>
      </div>

      <RouterLink
        :to="{ name: 'dashboard' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition"
        :class="
          route.name === 'dashboard'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Process Monitor' : undefined"
      >
        <span class="text-base shrink-0">🖥️</span>
        <span v-if="!isCollapsed" class="truncate">Process Monitor</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'git' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition"
        :class="
          route.name === 'git'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Git Workspace' : undefined"
      >
        <span class="text-base shrink-0">🌿</span>
        <span v-if="!isCollapsed" class="truncate">Git Workspace</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'traces' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition"
        :class="
          route.name === 'traces'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Tracing & APM' : undefined"
      >
        <span class="text-base shrink-0">📊</span>
        <span v-if="!isCollapsed" class="truncate">Tracing & APM</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'graph' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition"
        :class="
          route.name === 'graph'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Code Graph' : undefined"
      >
        <span class="text-base shrink-0">🕸️</span>
        <span v-if="!isCollapsed" class="truncate">Code Graph</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'api-docs' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition"
        :class="
          route.name === 'api-docs'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'API & Swagger' : undefined"
      >
        <span class="text-base shrink-0">⚡</span>
        <span v-if="!isCollapsed" class="truncate">API & Swagger</span>
      </RouterLink>
    </div>

    <!-- Sidebar Footer -->
    <div class="border-t border-line p-2 text-[11px] text-muted flex items-center justify-between">
      <span v-if="!isCollapsed" class="font-mono text-[10px] text-muted pl-1">{{ projects.length }} Project(s)</span>
      <button
        type="button"
        class="rounded p-1.5 text-accent hover:bg-elevated hover:underline font-medium flex items-center gap-1.5 transition ml-auto"
        :title="'Rescan projects folder'"
        @click="store.fetchProjects()"
      >
        <span>🔄</span>
        <span v-if="!isCollapsed" class="text-xs">Rescan</span>
      </button>
    </div>
  </aside>
</template>

