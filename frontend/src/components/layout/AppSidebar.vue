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
    class="relative flex h-full shrink-0 flex-col border-r border-line bg-panel transition-all duration-200 ease-out z-30 select-none font-sans"
    :class="isCollapsed ? 'w-16' : 'w-64'"
  >
    <!-- Sidebar Header: App Logo Mark & Collapse Toggle -->
    <div class="flex h-12 items-center justify-between border-b border-line px-3">
      <div v-if="!isCollapsed" class="flex items-center gap-2.5 min-w-0">
        <div class="flex h-7 w-7 items-center justify-center rounded border border-teal-500/30 bg-teal-500/10 text-accent font-mono font-bold text-xs shadow-xs">
          <svg class="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold tracking-tight text-white uppercase">DevPulse</span>
            <span class="rounded bg-zinc-800 px-1 py-0.2 font-mono text-[9px] text-zinc-400">v2.4.1</span>
          </div>
          <p class="text-[10px] font-mono text-zinc-500 truncate leading-none mt-0.5">Local Workstation</p>
        </div>
      </div>

      <div v-else class="mx-auto">
        <div class="flex h-7 w-7 items-center justify-center rounded border border-teal-500/30 bg-teal-500/10 text-accent font-mono font-bold text-xs">
          <svg class="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
        </div>
      </div>

      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded border border-line bg-elevated text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition"
        :title="isCollapsed ? 'Expand Sidebar (⌘B)' : 'Collapse Sidebar (⌘B)'"
        @click="toggleCollapse"
      >
        <svg v-if="!isCollapsed" class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        <svg v-else class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>

    <!-- Active Project Switcher Card -->
    <div class="border-b border-line p-2 relative">
      <button
        type="button"
        class="w-full flex items-center justify-between rounded-md border border-line bg-base p-2 text-left transition hover:border-zinc-700 hover:bg-zinc-900 group"
        :title="selected ? `Project: ${selected.name} (${selected.status})` : 'Pilih Project'"
        @click="showProjectPicker = !showProjectPicker"
      >
        <template v-if="selected">
          <div class="flex items-center gap-2 min-w-0">
            <StatusDot :status="selected.status" />
            <div v-if="!isCollapsed" class="min-w-0">
              <span class="block truncate text-xs font-semibold text-zinc-200 group-hover:text-accent transition-colors">
                {{ selected.name }}
              </span>
              <span class="block truncate font-mono text-[10px] text-zinc-500">
                {{ selected.type }} · {{ selected.port ? `:${selected.port}` : selected.id }}
              </span>
            </div>
          </div>
          <svg v-if="!isCollapsed" class="h-3 w-3 text-zinc-500 group-hover:text-zinc-300 transition shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </template>
        <template v-else>
          <div class="flex items-center gap-2 text-xs text-zinc-400">
            <svg class="h-3.5 w-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span v-if="!isCollapsed" class="text-xs">Pilih Project...</span>
          </div>
          <svg v-if="!isCollapsed" class="h-3 w-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </template>
      </button>

      <!-- Project Picker Popover Dropdown -->
      <div
        v-if="showProjectPicker && !isCollapsed"
        class="absolute left-2 right-2 top-full mt-1.5 z-50 rounded-lg border border-line bg-panel p-2 shadow-2xl space-y-2 max-h-96 flex flex-col"
      >
        <div class="flex items-center justify-between border-b border-line pb-1.5 px-1">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Workspace Projects</span>
          <button type="button" class="text-xs text-zinc-500 hover:text-zinc-300 font-bold" @click="showProjectPicker = false">✕</button>
        </div>

        <input
          v-model="search"
          type="search"
          placeholder="Cari nama projek..."
          class="w-full rounded border border-line bg-base px-2.5 py-1 text-xs text-ink outline-none placeholder:text-zinc-600 focus:border-accent font-mono"
        />

        <!-- Filter Chips -->
        <div class="flex items-center gap-1 text-[10px] border-b border-line pb-1.5 overflow-x-auto font-mono">
          <button
            type="button"
            class="rounded px-1.5 py-0.5 transition"
            :class="statusFilter === 'all' ? 'bg-zinc-800 text-accent font-semibold' : 'text-zinc-500 hover:text-zinc-300'"
            @click="statusFilter = 'all'"
          >
            All ({{ projects.length }})
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5 transition"
            :class="statusFilter === 'running' ? 'bg-emerald-950/60 text-running font-semibold' : 'text-zinc-500 hover:text-zinc-300'"
            @click="statusFilter = 'running'"
          >
            Run ({{ countRunning }})
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5 transition"
            :class="statusFilter === 'stopped' ? 'bg-rose-950/40 text-rose-300 font-semibold' : 'text-zinc-500 hover:text-zinc-300'"
            @click="statusFilter = 'stopped'"
          >
            Stop ({{ countStopped }})
          </button>
          <button
            type="button"
            class="rounded px-1.5 py-0.5 transition"
            :class="statusFilter === 'favorites' ? 'bg-amber-950/40 text-amber-300 font-semibold' : 'text-zinc-500 hover:text-zinc-300'"
            @click="statusFilter = 'favorites'"
          >
            ★ ({{ countFav }})
          </button>
        </div>

        <!-- Project Items List -->
        <div class="flex-1 overflow-y-auto space-y-1 max-h-56 pr-0.5">
          <p v-if="loading" class="text-xs text-zinc-500 text-center py-2 animate-pulse font-mono">Memuat...</p>
          <p v-else-if="filteredProjects.length === 0" class="text-xs text-zinc-500 text-center py-2 font-mono">Tidak ditemukan</p>
          <template v-else>
            <button
              v-for="proj in filteredProjects"
              :key="proj.id"
              type="button"
              class="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-elevated text-xs"
              :class="selectedId === proj.id ? 'bg-teal-500/10 border border-teal-500/30 text-teal-300 font-medium' : 'text-zinc-300'"
              @click="onSelectProject(proj.id)"
            >
              <StatusDot :status="proj.status" />
              <span class="truncate flex-1">{{ proj.name }}</span>
              <span
                role="button"
                tabindex="0"
                class="shrink-0 text-xs transition hover:scale-125"
                :class="proj.favorite ? 'text-amber-400' : 'text-zinc-600 hover:text-amber-400'"
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
            class="w-full flex items-center justify-center gap-1.5 rounded border border-line bg-elevated py-1.5 text-xs font-medium text-accent hover:bg-zinc-800 transition"
            @click="showManagerModal = true; showProjectPicker = false"
          >
            <span>+ Kelola & Pilih Projek</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Navigation Sections -->
    <div class="flex-1 overflow-y-auto px-2 py-2 space-y-4">
      <!-- Section 1: Project Tools (Project-Scoped Context) -->
      <div>
        <div v-if="!isCollapsed" class="px-2 pb-1 flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Project Tools</span>
          <span class="text-[9px] font-mono text-zinc-600">Scoped</span>
        </div>

        <div class="space-y-0.5">
          <RouterLink
            :to="{ name: 'dashboard' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'dashboard'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Process Monitor' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span v-if="!isCollapsed" class="truncate flex-1">Process Monitor</span>
            <span v-if="!isCollapsed && selected?.status === 'running'" class="h-1.5 w-1.5 rounded-full bg-running"></span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'terminal' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'terminal'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Terminal Sessions' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Terminal Sessions</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'git' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'git'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Git & AI Commits' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="6" y1="3" x2="6" y2="15"></line>
              <circle cx="18" cy="6" r="3"></circle>
              <circle cx="6" cy="18" r="3"></circle>
              <path d="M18 9a9 9 0 0 1-9 9"></path>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Git & AI Commits</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'env' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'env'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Environment Variables' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Environment & Secrets</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'docs' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'docs'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'AI Documentation' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span v-if="!isCollapsed" class="truncate">AI Documentation</span>
          </RouterLink>
        </div>
      </div>

      <!-- Section 2: Independent Utilities (Global Context) -->
      <div>
        <div v-if="!isCollapsed" class="px-2 pb-1 flex items-center justify-between">
          <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Utilities</span>
          <span class="text-[9px] font-mono text-zinc-600">Global</span>
        </div>

        <div class="space-y-0.5">
          <RouterLink
            :to="{ name: 'chat' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'chat'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'AI Chatbot' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-teal-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span v-if="!isCollapsed" class="truncate">AI Chatbot</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'claude-chat' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'claude-chat'
                ? 'bg-amber-950/30 text-amber-300 border border-amber-900/40 font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Claude Code CLI' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Claude Code CLI</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'webhook' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'webhook'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'WhatsApp Webhooks' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            <span v-if="!isCollapsed" class="truncate">WhatsApp Webhook</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'webhook-config' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'webhook-config'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Webhook & AI Config' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Webhook Config</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'telegram' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'telegram'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Telegram Bot' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Telegram Bot</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'converter' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'converter'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Doc Converter' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Doc Converter</span>
          </RouterLink>

          <RouterLink
            :to="{ name: 'share' }"
            class="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition"
            :class="
              route.name === 'share'
                ? 'bg-zinc-800 text-white font-semibold'
                : 'text-zinc-400 hover:bg-elevated hover:text-zinc-200'
            "
            :title="isCollapsed ? 'Local Share' : undefined"
          >
            <svg class="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            <span v-if="!isCollapsed" class="truncate">Local Share</span>
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- System Footer: Persistent Telemetry & Quick Utilities -->
    <div class="border-t border-line p-2 text-xs text-zinc-400">
      <div v-if="!isCollapsed" class="space-y-1.5 px-1 py-1 font-mono text-[10px] text-zinc-500">
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            <span>Local Node</span>
          </span>
          <span class="text-zinc-400 font-medium">v20.12.x</span>
        </div>
        <div class="flex items-center justify-between">
          <span>Projects</span>
          <span class="text-zinc-400 font-medium">{{ projects.length }} active</span>
        </div>
      </div>

      <div class="flex items-center justify-between pt-1 border-t border-line/60">
        <button
          type="button"
          class="rounded p-1 text-zinc-400 hover:text-zinc-200 hover:bg-elevated transition"
          title="Rescan project status"
          @click="store.fetchProjects()"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
        </button>

        <button
          v-if="!isCollapsed"
          type="button"
          class="flex items-center gap-1 text-[11px] text-accent hover:underline font-medium transition"
          @click="showManagerModal = true"
        >
          <span>Kelola Projek</span>
          <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
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
