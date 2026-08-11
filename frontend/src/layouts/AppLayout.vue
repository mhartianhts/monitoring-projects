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
const { error, bulkLoading, projects } = storeToRefs(store);

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
  <div class="flex h-full flex-col">
    <nav
      class="flex items-center justify-between gap-4 border-b border-line bg-panel px-4 py-2"
    >
      <div class="flex items-center gap-6">
        <div class="flex items-center gap-2">
          <p class="text-xs uppercase tracking-[0.2em] text-muted">Local PM</p>
          <span
            class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
            >v1.4</span
          >
        </div>
        <div class="flex items-center gap-1">
          <RouterLink
            :to="{ name: 'dashboard' }"
            class="rounded-md px-3 py-1.5 text-sm transition"
            :class="
              route.name === 'dashboard'
                ? 'bg-elevated text-ink'
                : 'text-muted hover:bg-elevated/60 hover:text-ink'
            "
          >
            Process
          </RouterLink>
          <RouterLink
            :to="{ name: 'git' }"
            class="rounded-md px-3 py-1.5 text-sm transition"
            :class="
              route.name === 'git'
                ? 'bg-elevated text-ink'
                : 'text-muted hover:bg-elevated/60 hover:text-ink'
            "
          >
            Git
          </RouterLink>
          <RouterLink
            :to="{ name: 'agent' }"
            class="rounded-md px-3 py-1.5 text-sm transition font-medium flex items-center gap-1.5"
            :class="
              route.name === 'agent'
                ? 'bg-accent/20 text-accent font-semibold'
                : 'text-muted hover:bg-elevated/60 hover:text-ink'
            "
          >
            <span>Agent</span>
            <span class="rounded bg-accent/20 px-1 py-0.2 text-[9px] uppercase tracking-wider text-accent font-mono">New</span>
          </RouterLink>
          <RouterLink
            :to="{ name: 'ai' }"
            class="rounded-md px-3 py-1.5 text-sm transition"
            :class="
              route.name === 'ai'
                ? 'bg-elevated text-ink'
                : 'text-muted hover:bg-elevated/60 hover:text-ink'
            "
          >
            AI Chat
          </RouterLink>
        </div>
      </div>

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
    </nav>

    <div
      v-if="error"
      class="border-b border-stopped/40 bg-stopped/10 px-6 py-2 text-sm text-stopped"
    >
      {{ error }}
    </div>

    <div class="flex min-h-0 flex-1">
      <AppSidebar />
      <RouterView />
    </div>
  </div>
</template>
