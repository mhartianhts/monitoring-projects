<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import AppSidebar from "../components/layout/AppSidebar.vue";
import IconButton from "../components/ui/IconButton.vue";
import NotificationShowcaseModal from "../components/ui/NotificationShowcaseModal.vue";

const route = useRoute();
const store = useProjectStore();
const { error, bulkLoading, projects, selected, showProjectSidebar } = storeToRefs(store);

const isProjectScopedRoute = computed(() => {
  return ['dashboard', 'git', 'env', 'docs', 'terminal'].includes(String(route.name));
});

const pageTitle = computed(() => {
  if (route.name === 'dashboard') return 'Process Monitor';
  if (route.name === 'git') return 'Git Workspace';
  if (route.name === 'env') return 'Environment & Secrets Manager';
  if (route.name === 'terminal') return 'Interactive Web Terminal';
  if (route.name === 'telegram') return 'Telegram Bot & Commands';
  if (route.name === 'webhook') return 'Chatbot Inbox';
  if (route.name === 'docs') return 'AI Documentation Suite';
  if (route.name === 'converter') return 'Document Converter (gRPC)';
  if (route.name === 'share') return 'Instant Local Share';
  if (route.name === 'agent') return 'AI Agent Workspace';
  if (route.name === 'chat' || route.name === 'ai') return 'AI Chatbot';
  return 'Workspace';
});

const runningCount = computed(
  () => projects.value.filter((p) => p.status === "running").length,
);
const startableCount = computed(
  () =>
    projects.value.filter((p) => p.hasConfig && p.status === "stopped").length,
);

onMounted(async () => {
  store.bindSocket();
  await Promise.all([store.fetchProjects(), store.fetchEditors()]);
});
</script>

<template>
  <div class="flex h-full flex-col bg-base">
    <!-- Glassmorphism Top Header Bar -->
    <nav
      class="flex items-center justify-between gap-4 border-b border-line/70 bg-panel/90 backdrop-blur-md px-4 py-2.5 z-40"
    >
      <!-- Left: Sidebar Toggle & Breadcrumb Title -->
      <div class="flex items-center gap-3 min-w-0">
        <button
          type="button"
          class="flex h-8 items-center gap-1.5 rounded-md border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-line hover:text-accent shadow-xs shrink-0"
          :title="showProjectSidebar ? 'Sembunyikan Sidebar Menu' : 'Tampilkan Sidebar Menu'"
          @click="store.toggleProjectSidebar"
        >
          <span>☰</span>
          <span class="hidden sm:inline font-mono text-[11px]">{{ showProjectSidebar ? 'Hide Menu' : 'Menu' }}</span>
        </button>

        <!-- Breadcrumbs Navigation -->
        <div class="flex items-center gap-2 text-xs truncate">
          <span class="font-bold text-ink uppercase tracking-wider font-mono text-[11px] hidden sm:inline">Local PM</span>
          <span class="text-muted/40 hidden sm:inline">/</span>
          <template v-if="isProjectScopedRoute && selected">
            <span class="font-semibold text-accent truncate max-w-[150px] md:max-w-xs font-mono">
              {{ selected.name }}
            </span>
            <span class="text-muted/40">/</span>
          </template>
          <span class="font-bold text-ink truncate">{{ pageTitle }}</span>
        </div>
      </div>

      <!-- Center/Right: Status Pill & Bulk Actions -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- Workspace Summary Status Pill -->
        <div class="hidden md:flex items-center gap-2 rounded-full border border-line bg-elevated/50 px-3 py-1 text-xs">
          <span class="flex items-center gap-1.5 text-running font-medium">
            <span class="h-2 w-2 rounded-full bg-running animate-pulse-subtle"></span>
            {{ runningCount }} Running
          </span>
          <span class="text-muted/40">|</span>
          <span class="text-stopped font-medium">
            {{ projects.length - runningCount }} Stopped
          </span>
        </div>

        <!-- Action Buttons & Notification Modal -->
        <div class="flex items-center gap-2">
          <NotificationShowcaseModal />
          <div
            v-if="route.name === 'dashboard'"
            class="flex flex-wrap items-center gap-2"
          >
            <IconButton
              label="Start All"
              variant="accent"
              :disabled="bulkLoading || startableCount === 0"
              @click="store.runBulkAction('startAll')"
            />
            <IconButton
              label="Stop All"
              variant="danger"
              :disabled="bulkLoading || runningCount === 0"
              @click="store.runBulkAction('stopAll')"
            />
            <IconButton
              label="Restart All"
              :disabled="bulkLoading || runningCount === 0"
              @click="store.runBulkAction('restartAll')"
            />
          </div>
        </div>
      </div>
    </nav>

    <!-- Error Banner -->
    <div
      v-if="error"
      class="border-b border-stopped/40 bg-stopped/15 px-6 py-2 text-xs font-medium text-stopped flex items-center justify-between"
    >
      <span>⚠️ {{ error }}</span>
      <button type="button" class="underline text-[11px] text-stopped/80 hover:text-stopped" @click="store.error = null">Dismiss</button>
    </div>

    <!-- Main Workspace Body: AppSidebar on Left, RouterView on Right -->
    <div class="flex min-h-0 flex-1">
      <AppSidebar v-if="showProjectSidebar && route.meta.requiresProjectSidebar !== false" />
      <RouterView />
    </div>
  </div>
</template>
