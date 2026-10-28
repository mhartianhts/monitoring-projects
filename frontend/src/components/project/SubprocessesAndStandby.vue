<script setup lang="ts">
import { computed } from "vue";
import type { Project } from "../../types/project";
import { useProjectStore } from "../../stores/project.store";
import StatusDot from "./StatusDot.vue";

const store = useProjectStore();

const standbyProjects = computed(() => {
  return store.projects.filter(
    (p) => p.id !== store.selectedId && p.status === "stopped",
  );
});

const runningOtherProjects = computed(() => {
  return store.projects.filter(
    (p) => p.id !== store.selectedId && p.status === "running",
  );
});

const onSelectStandby = (project: Project) => {
  void store.selectProject(project.id);
};

const onStartStandby = async (project: Project) => {
  await store.selectProject(project.id);
  await store.runAction("start");
};
</script>

<template>
  <div class="flex flex-col gap-4 font-sans select-none">
    <!-- 1. Managed Subprocesses Card -->
    <div class="rounded-md border border-line bg-panel p-3.5 space-y-3">
      <div class="flex items-center justify-between border-b border-line pb-2">
        <div class="flex items-center gap-2">
          <svg class="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <span class="text-xs font-semibold text-white">Subprocesses & Daemons</span>
        </div>
        <span class="font-mono text-[10px] text-zinc-500">
          {{ store.selected?.status === 'running' ? '2 active' : '0 active' }}
        </span>
      </div>

      <div v-if="store.selected?.status === 'running'" class="space-y-2">
        <!-- Subprocess 1: Web Watcher / Bundler -->
        <div class="rounded border border-line bg-base p-2.5 flex items-center justify-between gap-2 text-xs">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 font-mono font-medium text-zinc-200">
              <span class="h-1.5 w-1.5 rounded-full bg-running"></span>
              <span class="truncate">vite-server (bundler)</span>
            </div>
            <p class="font-mono text-[10px] text-zinc-500 mt-0.5">
              PID {{ (store.selected.pid || 12000) + 1 }} • :{{ store.selected.port || 3000 }} • 92 MB
            </p>
          </div>
          <span class="rounded bg-emerald-950/50 text-emerald-400 font-mono text-[10px] px-1.5 py-0.5 border border-emerald-900/50">
            HMR Live
          </span>
        </div>

        <!-- Subprocess 2: Type Checker -->
        <div class="rounded border border-line bg-base p-2.5 flex items-center justify-between gap-2 text-xs">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 font-mono font-medium text-zinc-200">
              <span class="h-1.5 w-1.5 rounded-full bg-running"></span>
              <span class="truncate">tsc --watch (typecheck)</span>
            </div>
            <p class="font-mono text-[10px] text-zinc-500 mt-0.5">
              PID {{ (store.selected.pid || 12000) + 2 }} • Exit 0 • 42 MB
            </p>
          </div>
          <span class="rounded bg-zinc-800 text-zinc-400 font-mono text-[10px] px-1.5 py-0.5 border border-line">
            Watching
          </span>
        </div>
      </div>

      <div v-else class="py-4 text-center text-xs text-zinc-500 font-mono">
        Tidak ada subprocess aktif saat ini.
      </div>
    </div>

    <!-- 2. Standby Projects in Workspace Panel -->
    <div class="rounded-md border border-line bg-panel p-3.5 space-y-3">
      <div class="flex items-center justify-between border-b border-line pb-2">
        <div class="flex items-center gap-2">
          <svg class="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
          </svg>
          <span class="text-xs font-semibold text-white">Standby Services</span>
        </div>
        <span class="font-mono text-[10px] text-zinc-500">
          {{ standbyProjects.length }} idle
        </span>
      </div>

      <div v-if="standbyProjects.length > 0" class="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
        <div
          v-for="project in standbyProjects"
          :key="project.id"
          class="rounded border border-line bg-base p-2 flex items-center justify-between gap-2 text-xs transition hover:border-zinc-700"
        >
          <button
            type="button"
            class="min-w-0 text-left flex-1 group"
            :title="`Beralih ke ${project.name}`"
            @click="onSelectStandby(project)"
          >
            <div class="flex items-center gap-1.5">
              <StatusDot :status="project.status" />
              <span class="truncate font-medium text-zinc-300 group-hover:text-accent transition">
                {{ project.name }}
              </span>
            </div>
            <p class="font-mono text-[10px] text-zinc-500 mt-0.5 truncate">
              {{ project.type }} · {{ project.port ? `:${project.port}` : 'no port' }}
            </p>
          </button>

          <button
            type="button"
            class="h-6 inline-flex items-center gap-1 rounded bg-zinc-800 text-zinc-300 px-2 text-[10px] font-mono hover:bg-emerald-950/60 hover:text-emerald-400 hover:border-emerald-900/60 border border-line transition shrink-0"
            :disabled="!project.hasConfig"
            :title="`Start service ${project.name}`"
            @click="onStartStandby(project)"
          >
            <span>Start</span>
          </button>
        </div>
      </div>

      <p v-else class="py-4 text-center text-xs text-zinc-500 font-mono">
        Semua service workspace sedang berjalan.
      </p>

      <!-- Active Other Services (if any) -->
      <div v-if="runningOtherProjects.length > 0" class="pt-2 border-t border-line">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">Other Running</span>
          <span class="font-mono text-[10px] text-emerald-400">{{ runningOtherProjects.length }}</span>
        </div>
        <div class="space-y-1">
          <button
            v-for="item in runningOtherProjects"
            :key="item.id"
            type="button"
            class="w-full rounded bg-base/60 border border-line/60 px-2 py-1 flex items-center justify-between text-xs text-left hover:border-zinc-700 transition"
            @click="onSelectStandby(item)"
          >
            <span class="truncate font-medium text-zinc-300">{{ item.name }}</span>
            <span class="font-mono text-[10px] text-emerald-400 shrink-0">
              {{ item.port ? `:${item.port}` : 'PID ' + (item.pid || '-') }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
