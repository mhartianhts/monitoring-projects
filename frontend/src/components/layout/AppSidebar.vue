<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../../stores/project.store";
import StatusDot from "../project/StatusDot.vue";
import ProjectManagerModal from "../project/ProjectManagerModal.vue";

const route = useRoute();
const store = useProjectStore();
const { projects, filtered, selectedId, selected, search, loading } = storeToRefs(store);

const isCollapsed = ref(false);
const showProjectPicker = ref(false);
const showManagerModal = ref(false);
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

        <!-- Tombol Buka Project Manager Modal -->
        <div class="border-t border-line pt-2">
          <button
            type="button"
            class="w-full flex items-center justify-center gap-1.5 rounded-lg border border-line bg-elevated/80 py-1.5 text-xs font-semibold text-accent hover:bg-elevated hover:border-accent/40 transition"
            @click="showManagerModal = true; showProjectPicker = false"
          >
            <span>⚙️</span>
            <span>Kelola & Pilih Projek</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Navigation Menu Links (Middle Section) -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <!-- Section 1: Fitur Berhubungan dengan Projek -->
      <div v-if="!isCollapsed" class="px-2.5 pt-1.5 pb-1 flex items-center justify-between">
        <span class="text-[9px] font-bold uppercase tracking-[0.16em] text-accent">Fitur Projek</span>
        <span class="text-[9px] font-mono text-muted/60">Scoped</span>
      </div>

      <RouterLink
        :to="{ name: 'dashboard' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
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
        :to="{ name: 'terminal' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'terminal'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Interactive Web Terminal (PowerShell / PTY)' : undefined"
      >
        <span class="text-base shrink-0">💻</span>
        <span v-if="!isCollapsed" class="truncate">Web Terminal</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'git' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
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
        :to="{ name: 'env' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'env'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Env & Secrets Manager' : undefined"
      >
        <span class="text-base shrink-0">🔐</span>
        <span v-if="!isCollapsed" class="truncate">Env & Secrets</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'docs' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'docs'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'AI Documentation' : undefined"
      >
        <span class="text-base shrink-0">📄</span>
        <span v-if="!isCollapsed" class="truncate">AI Documentation</span>
      </RouterLink>

      <!-- Divider Pemisah Antar Section -->
      <div class="my-2.5 border-t border-line/70"></div>

      <!-- Section 2: Fitur Bebas / Alat Independen -->
      <div v-if="!isCollapsed" class="px-2.5 pt-1 pb-1 flex items-center justify-between">
        <span class="text-[9px] font-bold uppercase tracking-[0.16em] text-muted">Alat Independen</span>
        <span class="text-[9px] font-mono text-muted/60">Global</span>
      </div>

      <RouterLink
        :to="{ name: 'chat' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'chat'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'AI Chatbot (Markdown)' : undefined"
      >
        <span class="text-base shrink-0">✨</span>
        <span v-if="!isCollapsed" class="truncate">AI Chatbot</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'webhook' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'webhook'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Chatbot Inbox (WhatsApp Webhook)' : undefined"
      >
        <span class="text-base shrink-0">💬</span>
        <span v-if="!isCollapsed" class="truncate">Chatbot Inbox</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'telegram' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'telegram'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Telegram Bot & Commands' : undefined"
      >
        <span class="text-base shrink-0">🤖</span>
        <span v-if="!isCollapsed" class="truncate">Telegram Bot</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'converter' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'converter'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Doc Converter (gRPC)' : undefined"
      >
        <span class="text-base shrink-0">🔄</span>
        <span v-if="!isCollapsed" class="truncate">Doc Converter</span>
      </RouterLink>

      <RouterLink
        :to="{ name: 'share' }"
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition"
        :class="
          route.name === 'share'
            ? 'bg-accent/15 text-accent border border-accent/30 shadow-xs'
            : 'text-muted hover:bg-elevated hover:text-ink'
        "
        :title="isCollapsed ? 'Local Share (AirDrop)' : undefined"
      >
        <span class="text-base shrink-0">📱</span>
        <span v-if="!isCollapsed" class="truncate">Local Share</span>
      </RouterLink>
    </div>

    <!-- Sidebar Footer -->
    <div class="border-t border-line p-2 text-[11px] text-muted flex items-center justify-between gap-1">
      <span v-if="!isCollapsed" class="font-mono text-[10px] text-muted pl-1 truncate">
        {{ projects.length }} Project(s)
      </span>
      <div class="flex items-center gap-1 ml-auto">
        <button
          type="button"
          class="rounded p-1.5 text-accent hover:bg-elevated hover:underline font-medium flex items-center gap-1 transition"
          title="Kelola & Pilih Projek"
          @click="showManagerModal = true"
        >
          <span>⚙️</span>
          <span v-if="!isCollapsed" class="text-xs">Kelola</span>
        </button>

        <button
          type="button"
          class="rounded p-1.5 text-muted hover:text-ink hover:bg-elevated transition"
          title="Rescan project status"
          @click="store.fetchProjects()"
        >
          <span>🔄</span>
        </button>
      </div>
    </div>

    <!-- Project Manager Modal -->
    <ProjectManagerModal
      :show="showManagerModal"
      @close="showManagerModal = false"
      @updated="store.fetchProjects()"
    />
  </aside>
</template>

