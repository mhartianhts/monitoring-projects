<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import AppSidebar from "../components/layout/AppSidebar.vue";
import NotificationShowcaseModal from "../components/ui/NotificationShowcaseModal.vue";
import { notify } from "../services/notification.service";

const route = useRoute();
const store = useProjectStore();
const { error, bulkLoading, projects, selected, showProjectSidebar } = storeToRefs(store);

const isProjectScopedRoute = computed(() => {
  return ["dashboard", "git", "env", "docs", "terminal"].includes(String(route.name));
});

const pageTitle = computed(() => {
  if (route.name === "dashboard") return "Process Monitor";
  if (route.name === "git") return "Git Workspace";
  if (route.name === "env") return "Environment & Secrets";
  if (route.name === "terminal") return "Interactive Terminal";
  if (route.name === "telegram") return "Telegram Bot Controller";
  if (route.name === "webhook") return "Chatbot Webhook Inbox";
  if (route.name === "webhook-config") return "Webhook & AI Config";
  if (route.name === "docs") return "AI Documentation Suite";
  if (route.name === "converter") return "Doc Converter (gRPC)";
  if (route.name === "share") return "Local Share (P2P LAN)";
  if (route.name === "chat" || route.name === "ai") return "AI Chatbot";
  if (route.name === "claude-chat") return "Claude Code CLI";
  return "Workstation";
});

const runningCount = computed(
  () => projects.value.filter((p) => p.status === "running").length,
);
const stoppedCount = computed(
  () => projects.value.length - runningCount.value,
);
const startableCount = computed(
  () => projects.value.filter((p) => p.hasConfig && p.status === "stopped").length,
);

const copyPath = async () => {
  if (!selected.value?.path) return;
  try {
    await navigator.clipboard.writeText(selected.value.path);
    notify.toast("Path projek berhasil disalin ke clipboard", "success");
  } catch {
    notify.toast("Gagal menyalin path", "error");
  }
};

onMounted(async () => {
  store.bindSocket();
  await Promise.all([store.fetchProjects(), store.fetchEditors()]);
});
</script>

<template>
  <div class="flex h-full flex-col bg-base text-ink antialiased">
    <!-- Top Navigation Bar (h-12 / 48px) - Kernel Minimal -->
    <header
      class="flex h-12 shrink-0 items-center justify-between border-b border-line bg-panel px-4 z-40 select-none"
    >
      <!-- Left: Sidebar Toggle & Interactive Breadcrumbs -->
      <div class="flex items-center gap-3 min-w-0">
        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded border border-line bg-elevated text-muted hover:text-ink hover:border-zinc-700 transition"
          :title="showProjectSidebar ? 'Sembunyikan Sidebar (⌘B)' : 'Tampilkan Sidebar (⌘B)'"
          @click="store.toggleProjectSidebar"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <!-- Breadcrumbs Navigation -->
        <nav class="flex items-center gap-1.5 text-xs truncate font-mono">
          <span class="text-muted/70 hover:text-muted transition cursor-default">Projects</span>
          <span class="text-zinc-600">/</span>

          <template v-if="isProjectScopedRoute && selected">
            <button
              type="button"
              class="flex items-center gap-1 font-semibold text-zinc-200 hover:text-accent transition truncate max-w-[160px] md:max-w-xs"
              :title="`Klik untuk salin path: ${selected.path}`"
              @click="copyPath"
            >
              <span class="truncate">{{ selected.name }}</span>
              <svg class="h-3 w-3 shrink-0 text-muted/60 hover:text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
            <span class="text-zinc-600">/</span>
          </template>

          <span class="font-semibold text-accent font-sans text-xs truncate">{{ pageTitle }}</span>
        </nav>
      </div>

      <!-- Center & Right: Process Telemetry Chip & Execution Controls -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- Global Multi-Process Status Chip -->
        <div class="hidden sm:flex items-center gap-2 rounded border border-line bg-elevated/70 px-2.5 py-1 font-mono text-[11px]">
          <span class="flex items-center gap-1.5 text-running font-medium">
            <span class="h-1.5 w-1.5 rounded-full bg-running"></span>
            {{ runningCount }} running
          </span>
          <span class="text-zinc-700">•</span>
          <span class="text-muted font-medium">
            {{ stoppedCount }} stopped
          </span>
        </div>

        <!-- Direct Localhost Link Launcher if port available -->
        <a
          v-if="selected?.port && selected.status === 'running'"
          :href="`http://localhost:${selected.port}`"
          target="_blank"
          rel="noopener noreferrer"
          class="hidden md:inline-flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2.5 py-1 font-mono text-[11px] text-accent hover:bg-accent/20 transition group"
          :title="`Buka http://localhost:${selected.port}`"
        >
          <span>localhost:{{ selected.port }}</span>
          <svg class="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="7" y1="17" x2="17" y2="7"></line>
            <polyline points="7 7 17 7 17 17"></polyline>
          </svg>
        </a>

        <!-- Bulk Action Controls (Process Monitor View) -->
        <div v-if="route.name === 'dashboard'" class="flex items-center gap-1.5">
          <button
            type="button"
            class="h-7 items-center gap-1 rounded border border-line bg-elevated px-2.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition hidden lg:inline-flex"
            :disabled="bulkLoading || startableCount === 0"
            @click="store.runBulkAction('startAll')"
          >
            Start All
          </button>
          <button
            type="button"
            class="h-7 items-center gap-1 rounded border border-line bg-elevated px-2.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition hidden lg:inline-flex"
            :disabled="bulkLoading || runningCount === 0"
            @click="store.runBulkAction('restartAll')"
          >
            Restart All
          </button>
          <button
            type="button"
            class="h-7 items-center gap-1 rounded border border-rose-900/60 bg-rose-950/30 px-2.5 text-[11px] font-medium text-rose-300 hover:bg-rose-950/60 disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex"
            :disabled="bulkLoading || runningCount === 0"
            @click="store.runBulkAction('stopAll')"
          >
            Stop All
          </button>
        </div>

        <NotificationShowcaseModal />
      </div>
    </header>

    <!-- Error Banner -->
    <div
      v-if="error"
      class="border-b border-rose-900/60 bg-rose-950/40 px-4 py-1.5 text-xs text-rose-300 flex items-center justify-between"
    >
      <div class="flex items-center gap-2 truncate">
        <svg class="h-3.5 w-3.5 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span class="truncate font-mono">{{ error }}</span>
      </div>
      <button
        type="button"
        class="text-[11px] text-rose-400/80 hover:text-rose-200 underline shrink-0 ml-3"
        @click="store.error = null"
      >
        Dismiss
      </button>
    </div>

    <!-- Main Workspace Body: AppSidebar on Left, RouterView on Right -->
    <div class="flex min-h-0 flex-1">
      <AppSidebar v-if="showProjectSidebar && route.meta.requiresProjectSidebar !== false" />
      <RouterView />
    </div>
  </div>
</template>
