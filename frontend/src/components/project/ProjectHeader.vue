<script setup lang="ts">
import { computed } from "vue";
import type { EditorInfo, Project, GitStatus } from "../../types/project";
import StatusDot from "./StatusDot.vue";

interface Props {
  project: Project;
  busy: boolean;
  editors?: EditorInfo[];
  gitStatus?: GitStatus | null;
}

const props = withDefaults(defineProps<Props>(), {
  editors: () => [],
  gitStatus: null,
});

const emit = defineEmits<{
  (e: "start"): void;
  (e: "stop"): void;
  (e: "restart"): void;
  (e: "openFolder"): void;
  (e: "openBrowser"): void;
  (e: "openEditor", editorId: string): void;
  (e: "reloadHmr"): void;
}>();

const canStart = () =>
  props.project.hasConfig &&
  props.project.status === "stopped" &&
  !props.busy;
const canStop = () => props.project.status === "running" && !props.busy;
const canRestart = () => props.project.hasConfig && !props.busy;

const formatUptime = (seconds?: number) => {
  if (!seconds || seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const gitBranchDisplay = computed(() => {
  if (!props.gitStatus?.isRepo) return null;
  const branch = props.gitStatus.branch || "main";
  const ahead = props.gitStatus.ahead ? `+${props.gitStatus.ahead}` : "";
  const dirty = props.gitStatus.dirty ? " *" : "";
  return `${branch}${ahead}${dirty}`;
});
</script>

<template>
  <header class="border-b border-line bg-panel px-5 py-3 select-none font-sans">
    <div class="flex flex-col gap-3">
      <!-- Top Row: Active Process Banner & Primary Execution Strip -->
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Process Name, Status Badge, Uptime & Git Branch -->
        <div class="flex items-center gap-3 min-w-0">
          <StatusDot :status="project.status" />

          <div class="flex items-center gap-2 min-w-0">
            <h1 class="text-base font-bold text-white tracking-tight truncate font-sans">
              {{ project.name }}
            </h1>

            <span
              class="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] uppercase font-mono font-semibold tracking-wider border"
              :class="
                project.status === 'running'
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : 'bg-rose-950/40 text-rose-300 border-rose-900/60'
              "
            >
              {{ project.status === 'running' ? '● RUNNING' : '○ STOPPED' }}
            </span>

            <span
              v-if="project.status === 'running'"
              class="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 bg-elevated px-2 py-0.5 rounded border border-line"
              title="Process Uptime"
            >
              <span class="text-zinc-500">UP:</span>
              <span class="text-zinc-200">{{ formatUptime(project.stats?.uptime) }}</span>
            </span>

            <span
              v-if="gitBranchDisplay"
              class="hidden md:inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 bg-elevated px-2 py-0.5 rounded border border-line truncate max-w-[180px]"
              :title="`Git Branch: ${gitBranchDisplay}`"
            >
              <svg class="h-3 w-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="6" y1="3" x2="6" y2="15"></line>
                <circle cx="18" cy="6" r="3"></circle>
                <circle cx="6" cy="18" r="3"></circle>
                <path d="M18 9a9 9 0 0 1-9 9"></path>
              </svg>
              <span class="truncate text-zinc-300">{{ gitBranchDisplay }}</span>
            </span>
          </div>
        </div>

        <!-- Primary Execution Strip (Tactile Buttons) -->
        <div class="flex items-center gap-1.5 shrink-0 flex-wrap">
          <!-- Start Button -->
          <button
            v-if="project.status === 'stopped'"
            type="button"
            class="h-8 inline-flex items-center gap-1.5 rounded bg-emerald-500 text-zinc-950 px-3 text-xs font-semibold hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
            :disabled="!canStart()"
            @click="emit('start')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            <span>Start</span>
            <span class="text-[10px] font-mono opacity-70">⌘S</span>
          </button>

          <!-- Stop Button -->
          <button
            v-if="project.status === 'running'"
            type="button"
            class="h-8 inline-flex items-center gap-1.5 rounded border border-rose-900/60 bg-rose-950/30 text-rose-300 px-3 text-xs font-semibold hover:bg-rose-950/60 disabled:opacity-40 disabled:cursor-not-allowed transition"
            :disabled="!canStop()"
            @click="emit('stop')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12"></rect>
            </svg>
            <span>Stop</span>
            <span class="text-[10px] font-mono text-rose-400/70">⌘.</span>
          </button>

          <!-- Restart Button -->
          <button
            type="button"
            class="h-8 inline-flex items-center gap-1.5 rounded border border-line bg-elevated text-zinc-200 px-3 text-xs font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            :disabled="!canRestart()"
            @click="emit('restart')"
          >
            <svg class="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Restart</span>
            <span class="text-[10px] font-mono text-zinc-500">⌘R</span>
          </button>

          <!-- Open Browser if Port Available -->
          <button
            v-if="project.port"
            type="button"
            class="h-8 inline-flex items-center gap-1.5 rounded border border-line bg-elevated text-zinc-300 px-2.5 text-xs font-medium hover:bg-zinc-800 hover:text-white transition"
            title="Buka di Browser"
            @click="emit('openBrowser')"
          >
            <svg class="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span class="hidden sm:inline">Browser</span>
          </button>

          <!-- Open Folder -->
          <button
            type="button"
            class="h-8 inline-flex items-center gap-1.5 rounded border border-line bg-elevated text-zinc-300 px-2.5 text-xs font-medium hover:bg-zinc-800 hover:text-white transition"
            title="Buka direktori projek di File Explorer"
            @click="emit('openFolder')"
          >
            <svg class="h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <span class="hidden sm:inline">Folder</span>
          </button>

          <!-- Available IDE Editor Launchers -->
          <button
            v-for="editor in editors"
            :key="editor.id"
            type="button"
            class="h-8 inline-flex items-center gap-1.5 rounded border border-line bg-elevated text-zinc-300 px-2.5 text-xs font-medium hover:bg-zinc-800 hover:text-white transition"
            :title="`Buka di ${editor.label}`"
            @click="emit('openEditor', editor.id)"
          >
            <svg class="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <span>{{ editor.label }}</span>
          </button>
        </div>
      </div>

      <!-- Bottom Sub-bar: Technical Specs Telemetry Strip -->
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line/70 text-[11px] font-mono text-zinc-400">
        <div class="flex flex-wrap items-center gap-3 min-w-0">
          <!-- Path -->
          <span class="truncate max-w-xs md:max-w-md text-zinc-400 flex items-center gap-1" :title="project.path">
            <span class="text-zinc-600">dir:</span>
            <span class="text-zinc-300 truncate">{{ project.path }}</span>
          </span>

          <span class="text-zinc-700 hidden sm:inline">•</span>

          <!-- Port -->
          <span v-if="project.port" class="flex items-center gap-1">
            <span class="text-zinc-600">port:</span>
            <span class="text-accent font-semibold">:{{ project.port }}</span>
          </span>

          <span v-if="project.pid" class="text-zinc-700 hidden sm:inline">•</span>

          <!-- PID -->
          <span v-if="project.pid" class="flex items-center gap-1">
            <span class="text-zinc-600">pid:</span>
            <span class="text-emerald-400 font-semibold">{{ project.pid }}</span>
          </span>

          <!-- Start Command -->
          <span v-if="project.start" class="text-zinc-700 hidden md:inline">•</span>
          <span v-if="project.start" class="hidden md:flex items-center gap-1 truncate max-w-xs" :title="project.start">
            <span class="text-zinc-600">cmd:</span>
            <span class="text-zinc-300 truncate">{{ project.start }}</span>
          </span>
        </div>

        <!-- Tech Type Badge -->
        <div class="flex items-center gap-2">
          <span class="rounded bg-elevated px-2 py-0.5 text-[10px] uppercase font-semibold text-zinc-400 border border-line">
            {{ project.type }}
          </span>
          <span
            v-if="project.configSource === 'auto'"
            class="rounded bg-amber-950/40 text-amber-300 px-2 py-0.5 text-[10px] font-semibold border border-amber-900/50"
          >
            Auto-Config
          </span>
        </div>
      </div>
    </div>
  </header>
</template>
