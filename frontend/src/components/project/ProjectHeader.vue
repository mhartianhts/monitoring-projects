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
  <header class="border-b border-line bg-panel px-6 py-4">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <StatusDot :status="project.status" />
          <h2 class="truncate text-xl font-semibold">{{ project.name }}</h2>
          <span
            v-if="project.configSource === 'auto'"
            class="rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-warn"
            title="Perintah start terdeteksi otomatis"
          >
            auto
          </span>
        </div>
        <p class="mt-1 truncate font-mono text-xs text-muted">
          {{ project.path }}
        </p>
        <div class="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          <span
            >Type: <span class="text-ink">{{ project.type }}</span></span
          >
          <span
            >Port: <span class="text-ink">{{ project.port ?? "—" }}</span></span
          >
          <span
            >PID: <span class="text-ink">{{ project.pid ?? "—" }}</span></span
          >
          <span
            v-if="project.start"
            class="truncate"
            title="Start command"
          >
            Start:
            <span class="font-mono text-ink">{{ project.start }}</span>
          </span>
          <span
            class="uppercase tracking-wide"
            :class="
              project.status === 'running' ? 'text-running' : 'text-stopped'
            "
          >
            {{ project.status }}
          </span>
        </div>
        <p
          v-if="!project.hasConfig"
          class="mt-2 text-sm text-warn"
        >
          Belum bisa di-start. Tambahkan
          <code class="font-mono">project.config.json</code>
          atau pastikan ada
          <code class="font-mono">package.json</code> /
          <code class="font-mono">docker-compose.yml</code> /
          entry Python/Laravel.
        </p>
        <p
          v-else-if="project.configSource === 'auto'"
          class="mt-2 text-sm text-muted"
        >
          Config otomatis dari isi folder. Buat
          <code class="font-mono">project.config.json</code>
          jika ingin override port/command.
        </p>
        <p
          v-else-if="project.configError"
          class="mt-2 text-sm text-stopped"
        >
          Config error: {{ project.configError }}
        </p>
      </div>

      <div class="flex flex-col items-end gap-2">
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
        </div>
        <div
          v-if="editors.length > 0"
          class="flex flex-wrap justify-end gap-2"
        >
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
