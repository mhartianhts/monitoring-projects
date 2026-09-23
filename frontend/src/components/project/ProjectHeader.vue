<script setup lang="ts">
import type { EditorInfo, Project } from "../../types/project";
import StatusDot from "./StatusDot.vue";
import IconButton from "../ui/IconButton.vue";

interface Props {
  project: Project;
  busy: boolean;
  editors?: EditorInfo[];
}

const props = withDefaults(defineProps<Props>(), {
  editors: () => [],
});

const emit = defineEmits<{
  start: [];
  stop: [];
  restart: [];
  openFolder: [];
  openBrowser: [];
  openEditor: [editorId: string];
}>();

const canStart = () =>
  props.project.hasConfig &&
  props.project.status === "stopped" &&
  !props.busy;
const canStop = () => props.project.status === "running" && !props.busy;
</script>

<template>
  <header class="border-b border-line/70 bg-panel px-6 py-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <!-- Title & Badges -->
        <div class="flex items-center gap-3">
          <StatusDot :status="project.status" />
          <h2 class="truncate text-xl font-bold text-ink tracking-tight">{{ project.name }}</h2>
          
          <span
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-wider font-semibold font-mono border"
            :class="
              project.status === 'running'
                ? 'bg-running/15 text-running border-running/30 glow-running'
                : 'bg-stopped/15 text-stopped border-stopped/30'
            "
          >
            ● {{ project.status }}
          </span>

          <span
            v-if="project.configSource === 'auto'"
            class="rounded border border-warn/30 bg-warn/10 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold text-warn"
            title="Perintah start terdeteksi otomatis"
          >
            ⚡ Auto-Config
          </span>
        </div>

        <p class="mt-1 truncate font-mono text-xs text-muted flex items-center gap-1.5">
          <span>📁</span>
          <span>{{ project.path }}</span>
        </p>

        <!-- Interactive Metadata Pills Bar -->
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span class="inline-flex items-center gap-1 rounded border border-line bg-elevated/80 px-2.5 py-1 text-ink">
            <span class="text-muted text-[10px] uppercase tracking-wider font-semibold">Type:</span>
            <span class="font-medium text-accent">{{ project.type }}</span>
          </span>

          <a
            v-if="project.port"
            :href="`http://localhost:${project.port}`"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-2.5 py-1 text-accent font-mono hover:bg-accent/20 transition group"
            title="Buka http://localhost:<port>"
          >
            <span class="text-[10px] uppercase font-sans font-semibold text-accent/80">Port:</span>
            <span class="font-bold underline decoration-dotted">{{ project.port }}</span>
            <span class="text-[10px] group-hover:translate-x-0.5 transition-transform">↗</span>
          </a>
          <span v-else class="inline-flex items-center gap-1 rounded border border-line bg-elevated/80 px-2.5 py-1 text-muted">
            <span class="text-[10px] uppercase tracking-wider font-semibold">Port:</span>
            <span>—</span>
          </span>

          <span v-if="project.pid" class="inline-flex items-center gap-1 rounded border border-line bg-elevated/80 px-2.5 py-1 font-mono text-ink">
            <span class="text-muted text-[10px] font-sans uppercase tracking-wider font-semibold">PID:</span>
            <span class="text-running font-semibold">{{ project.pid }}</span>
          </span>

          <span
            v-if="project.start"
            class="inline-flex items-center gap-1 rounded border border-line bg-elevated/80 px-2.5 py-1 font-mono text-ink/90 truncate max-w-md"
            :title="`Start Command: ${project.start}`"
          >
            <span class="text-muted text-[10px] font-sans uppercase tracking-wider font-semibold">Cmd:</span>
            <span class="truncate text-ink">{{ project.start }}</span>
          </span>
        </div>

        <!-- Config Warnings -->
        <p
          v-if="!project.hasConfig"
          class="mt-2.5 rounded-md border border-warn/30 bg-warn/10 px-3 py-1.5 text-xs text-warn flex items-center gap-2"
        >
          <span>⚠️</span>
          <span>
            Belum bisa di-start. Buat <code class="font-mono bg-warn/20 px-1 rounded">project.config.json</code> atau pastikan ada package.json / docker-compose.yml.
          </span>
        </p>
        <p
          v-else-if="project.configError"
          class="mt-2.5 rounded-md border border-stopped/30 bg-stopped/10 px-3 py-1.5 text-xs text-stopped"
        >
          ⚠️ Config error: {{ project.configError }}
        </p>
      </div>

      <!-- Action Buttons Toolbar -->
      <div class="flex flex-col items-end gap-2 shrink-0">
        <div class="flex flex-wrap justify-end gap-2">
          <IconButton
            label="Start"
            variant="accent"
            :disabled="!canStart()"
            @click="emit('start')"
          />
          <IconButton
            label="Stop"
            variant="danger"
            :disabled="!canStop()"
            @click="emit('stop')"
          />
          <IconButton
            label="Restart"
            :disabled="!project.hasConfig || busy"
            @click="emit('restart')"
          />
          <IconButton
            label="Open Folder"
            variant="ghost"
            @click="emit('openFolder')"
          />
          <IconButton
            label="Open Browser"
            variant="ghost"
            :disabled="!project.port"
            @click="emit('openBrowser')"
          />
          <RouterLink
            :to="{ name: 'terminal', query: { project: project.id } }"
            class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line hover:border-accent/40 hover:text-accent transition shadow-xs"
            title="Buka Interactive Web Terminal di folder project ini"
          >
            <span>💻</span>
            <span>Terminal</span>
          </RouterLink>
        </div>

        <!-- Available IDE Editors -->
        <div
          v-if="editors.length > 0"
          class="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-line/50 w-full"
        >
          <span class="text-[10px] uppercase font-semibold text-muted tracking-wider">Editor:</span>
          <IconButton
            v-for="editor in editors"
            :key="editor.id"
            :label="editor.label"
            variant="ghost"
            @click="emit('openEditor', editor.id)"
          />
        </div>
      </div>
    </div>
  </header>
</template>
