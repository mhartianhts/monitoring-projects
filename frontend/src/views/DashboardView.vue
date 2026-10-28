<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import ProjectHeader from "../components/project/ProjectHeader.vue";
import ProcessStats from "../components/project/ProcessStats.vue";
import LogViewer from "../components/log/LogViewer.vue";
import SubprocessesAndStandby from "../components/project/SubprocessesAndStandby.vue";
import StatusDot from "../components/project/StatusDot.vue";

const store = useProjectStore();
const { selected, logs, actionLoading, availableEditors, gitStatus, projects } = storeToRefs(store);

const onSelectProject = (id: string) => {
  void store.selectProject(id);
};

const onStartProject = async (id: string) => {
  await store.selectProject(id);
  await store.runAction("start");
};
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col bg-base overflow-hidden">
    <!-- Active Project Monitor State -->
    <template v-if="selected">
      <!-- 1. Active Process Banner & Execution Controls -->
      <ProjectHeader
        :project="selected"
        :busy="actionLoading"
        :editors="availableEditors"
        :git-status="gitStatus"
        @start="store.runAction('start')"
        @stop="store.runAction('stop')"
        @restart="store.runAction('restart')"
        @open-folder="store.openFolder()"
        @open-browser="store.openBrowser()"
        @open-editor="store.openEditor"
      />

      <!-- 2. Real-Time Resource Telemetry Strip (4 Columns) -->
      <ProcessStats
        :stats="selected.stats"
        :running="selected.status === 'running'"
      />

      <!-- 3. Workstation Split: Left Log Stream (65%) + Right Subprocesses & Standby (35%) -->
      <div class="flex min-h-0 flex-1 flex-col xl:flex-row gap-3 p-3.5 overflow-hidden">
        <!-- Left: Live Log Viewer & Terminal Stream -->
        <div class="flex min-h-0 flex-1 flex-col">
          <LogViewer
            :logs="logs"
            :project-name="selected.name"
            @clear="store.clearLogs()"
          />
        </div>

        <!-- Right: Managed Subprocesses & Standby Services -->
        <div class="w-full xl:w-96 shrink-0 overflow-y-auto pr-0.5">
          <SubprocessesAndStandby />
        </div>
      </div>
    </template>

    <!-- Empty State: Workstation Projects Quick Launcher Grid -->
    <div v-else class="flex flex-1 flex-col p-6 overflow-y-auto select-none font-sans">
      <div class="max-w-4xl mx-auto w-full space-y-6 my-auto">
        <!-- Workstation Welcome Banner -->
        <div class="border border-line bg-panel rounded-lg p-6 space-y-2">
          <div class="flex items-center gap-2.5">
            <div class="flex h-8 w-8 items-center justify-center rounded border border-teal-500/30 bg-teal-500/10 text-accent font-mono font-bold text-sm">
              <svg class="h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </div>
            <div>
              <h2 class="text-base font-bold text-white tracking-tight">DevPulse Workstation</h2>
              <p class="text-xs text-zinc-400">Pilih projek dari daftar di bawah untuk memantau proses, telemetry CPU/RAM, dan live terminal stream.</p>
            </div>
          </div>
        </div>

        <!-- Workspace Projects Cards Grid -->
        <div class="space-y-3">
          <div class="flex items-center justify-between text-xs font-mono text-zinc-400 px-1">
            <span>Daftar Projek Terdeteksi ({{ projects.length }})</span>
            <span>Localhost Dashboard</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="proj in projects"
              :key="proj.id"
              class="border border-line bg-panel rounded-lg p-4 flex flex-col justify-between hover:border-zinc-700 transition space-y-3 group"
            >
              <div>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <StatusDot :status="proj.status" />
                    <span class="font-semibold text-sm text-zinc-200 group-hover:text-accent transition truncate">
                      {{ proj.name }}
                    </span>
                  </div>
                  <span
                    class="font-mono text-[10px] uppercase px-1.5 py-0.2 rounded border"
                    :class="
                      proj.status === 'running'
                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900/50'
                        : 'bg-elevated text-zinc-500 border-line'
                    "
                  >
                    {{ proj.status }}
                  </span>
                </div>

                <p class="font-mono text-[11px] text-zinc-500 mt-2 truncate">
                  {{ proj.type }} · {{ proj.port ? `:${proj.port}` : 'no port' }}
                </p>
                <p class="font-mono text-[10px] text-zinc-600 truncate mt-0.5">
                  {{ proj.path }}
                </p>
              </div>

              <div class="flex items-center gap-2 pt-2 border-t border-line/60">
                <button
                  type="button"
                  class="flex-1 rounded bg-zinc-800 text-zinc-200 py-1.5 text-xs font-medium hover:bg-zinc-700 hover:text-white transition"
                  @click="onSelectProject(proj.id)"
                >
                  Buka Monitor
                </button>
                <button
                  v-if="proj.status === 'stopped' && proj.hasConfig"
                  type="button"
                  class="rounded bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 px-2.5 py-1.5 text-xs font-medium hover:bg-emerald-950/80 transition"
                  @click="onStartProject(proj.id)"
                >
                  Start
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
