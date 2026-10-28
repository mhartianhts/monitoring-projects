<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { LogEntry } from "../../types/project";
import { notify } from "../../services/notification.service";
import { useProjectStore } from "../../stores/project.store";

interface Props {
  logs: LogEntry[];
  projectName?: string;
}

const props = withDefaults(defineProps<Props>(), {
  projectName: "project",
});

const emit = defineEmits<{
  clear: [];
  command: [cmd: string];
}>();

const store = useProjectStore();
const containerRef = ref<HTMLElement | null>(null);
const autoScroll = ref(true);
const searchQuery = ref("");
const severityFilter = ref<"all" | "info" | "warn" | "error">("all");
const commandInput = ref("");

// Helper to categorize log entry
const getLogLevel = (line: string, stream?: string): "info" | "warn" | "error" => {
  if (stream === "stderr") return "error";
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("err:") || lower.includes("fail") || lower.includes("exception")) return "error";
  if (lower.includes("warn") || lower.includes("warning") || lower.includes("deprecat")) return "warn";
  return "info";
};

// Subsystem detector from line brackets like [vite], [express], [node]
const extractSubsystem = (line: string): { tag: string | null; cleanLine: string } => {
  const match = line.match(/^\[([a-zA-Z0-9_\-.:]+)\]\s*(.*)$/);
  if (match) {
    return { tag: match[1], cleanLine: match[2] };
  }
  return { tag: null, cleanLine: line };
};

const formatTimestamp = (ts?: number | string): string => {
  if (!ts) return "--:--:--.---";
  try {
    const d = new Date(ts);
    const h = d.getHours().toString().padStart(2, "0");
    const m = d.getMinutes().toString().padStart(2, "0");
    const s = d.getSeconds().toString().padStart(2, "0");
    const ms = d.getMilliseconds().toString().padStart(3, "0");
    return `${h}:${m}:${s}.${ms}`;
  } catch {
    return "--:--:--.---";
  }
};

const allCount = computed(() => props.logs.length);
const infoCount = computed(() => props.logs.filter((l) => getLogLevel(l.line, l.stream) === "info").length);
const warnCount = computed(() => props.logs.filter((l) => getLogLevel(l.line, l.stream) === "warn").length);
const errorCount = computed(() => props.logs.filter((l) => getLogLevel(l.line, l.stream) === "error").length);

const filteredLogs = computed(() => {
  return props.logs.filter((entry) => {
    const level = getLogLevel(entry.line, entry.stream);
    if (severityFilter.value !== "all" && level !== severityFilter.value) {
      return false;
    }
    if (searchQuery.value.trim() !== "") {
      try {
        const regex = new RegExp(searchQuery.value.trim(), "i");
        return regex.test(entry.line);
      } catch {
        return entry.line.toLowerCase().includes(searchQuery.value.toLowerCase().trim());
      }
    }
    return true;
  });
});

const onScroll = () => {
  const el = containerRef.value;
  if (!el) return;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  autoScroll.value = distance < 40;
};

const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value;
  if (autoScroll.value && containerRef.value) {
    containerRef.value.scrollTop = containerRef.value.scrollHeight;
  }
};

const copyLogs = async () => {
  if (props.logs.length === 0) return;
  const text = filteredLogs.value.map((l) => l.line).join("\n");
  try {
    await navigator.clipboard.writeText(text);
    notify.toast("Log berhasil disalin ke clipboard", "success");
  } catch {
    notify.toast("Gagal menyalin log", "error");
  }
};

const exportLogs = () => {
  if (props.logs.length === 0) return;
  const text = props.logs.map((l) => `[${formatTimestamp(l.ts)}] [${l.stream}] ${l.line}`).join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.projectName}-logs-${Date.now()}.log`;
  a.click();
  URL.revokeObjectURL(url);
  notify.toast("File log diekspor", "success");
};

const submitCommand = () => {
  const cmd = commandInput.value.trim();
  if (!cmd) return;
  if (cmd === "cls" || cmd === "clear") {
    emit("clear");
  } else if (cmd === "rs" || cmd === "restart") {
    void store.runAction("restart");
  } else {
    emit("command", cmd);
  }
  commandInput.value = "";
};

watch(
  () => props.logs.length,
  async () => {
    await nextTick();
    const el = containerRef.value;
    if (!el || !autoScroll.value) return;
    el.scrollTop = el.scrollHeight;
  },
);
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-log border border-line rounded-md overflow-hidden font-mono text-xs select-none">
    <!-- Filter & Action Header Strip (h-10 / 40px) -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-1.5 shrink-0">
      <!-- Left: Severity Tabs with Badge Tallies -->
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1 text-[11px] font-mono transition flex items-center gap-1.5"
          :class="severityFilter === 'all' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-500 hover:text-zinc-300'"
          @click="severityFilter = 'all'"
        >
          <span>All</span>
          <span class="rounded bg-zinc-900 px-1 py-0.2 text-[9px] text-zinc-400">{{ allCount }}</span>
        </button>

        <button
          type="button"
          class="rounded px-2 py-1 text-[11px] font-mono transition flex items-center gap-1.5"
          :class="severityFilter === 'info' ? 'bg-zinc-800 text-teal-300 font-semibold' : 'text-zinc-500 hover:text-zinc-300'"
          @click="severityFilter = 'info'"
        >
          <span>Info</span>
          <span class="rounded bg-zinc-900 px-1 py-0.2 text-[9px] text-zinc-400">{{ infoCount }}</span>
        </button>

        <button
          type="button"
          class="rounded px-2 py-1 text-[11px] font-mono transition flex items-center gap-1.5"
          :class="severityFilter === 'warn' ? 'bg-amber-950/50 text-amber-300 font-semibold border border-amber-900/50' : 'text-zinc-500 hover:text-zinc-300'"
          @click="severityFilter = 'warn'"
        >
          <span>Warn</span>
          <span class="rounded bg-zinc-900 px-1 py-0.2 text-[9px] text-amber-400">{{ warnCount }}</span>
        </button>

        <button
          type="button"
          class="rounded px-2 py-1 text-[11px] font-mono transition flex items-center gap-1.5"
          :class="severityFilter === 'error' ? 'bg-rose-950/50 text-rose-300 font-semibold border border-rose-900/50' : 'text-zinc-500 hover:text-zinc-300'"
          @click="severityFilter = 'error'"
        >
          <span>Error</span>
          <span class="rounded bg-zinc-900 px-1 py-0.2 text-[9px] text-rose-400">{{ errorCount }}</span>
        </button>
      </div>

      <!-- Right: Search Filter Input & Stream Controls -->
      <div class="flex items-center gap-2">
        <!-- Search Input -->
        <div class="relative">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="Filter logs (e.g. status:500, auth)..."
            class="h-7 w-44 sm:w-60 rounded border border-line bg-base px-2 pl-6 text-[11px] text-ink outline-none placeholder:text-zinc-600 focus:border-accent font-mono"
          />
          <svg class="h-3 w-3 text-zinc-600 absolute left-2 top-2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>

        <!-- Auto-scroll Switch Button -->
        <button
          type="button"
          class="h-7 rounded px-2 text-[10px] font-mono transition flex items-center gap-1 border border-line"
          :class="autoScroll ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/40' : 'bg-elevated text-zinc-500'"
          title="Toggle Auto-Scroll"
          @click="toggleAutoScroll"
        >
          <span class="h-1.5 w-1.5 rounded-full" :class="autoScroll ? 'bg-emerald-400' : 'bg-zinc-600'"></span>
          <span>{{ autoScroll ? 'Scroll ON' : 'Paused' }}</span>
        </button>

        <!-- Copy Button -->
        <button
          type="button"
          class="h-7 rounded border border-line bg-elevated px-2 text-[10px] text-zinc-400 hover:text-white hover:border-zinc-700 transition disabled:opacity-40"
          :disabled="logs.length === 0"
          title="Salin log yang difilter"
          @click="copyLogs"
        >
          Copy
        </button>

        <!-- Export Log File -->
        <button
          type="button"
          class="h-7 rounded border border-line bg-elevated px-2 text-[10px] text-zinc-400 hover:text-white hover:border-zinc-700 transition disabled:opacity-40"
          :disabled="logs.length === 0"
          title="Unduh file log mentah"
          @click="exportLogs"
        >
          Export
        </button>

        <!-- Clear Log Button -->
        <button
          type="button"
          class="h-7 rounded border border-line bg-elevated px-2 text-[10px] text-zinc-400 hover:text-rose-300 hover:border-rose-900/60 transition disabled:opacity-40"
          :disabled="logs.length === 0"
          title="Bersihkan buffer log (⌘K)"
          @click="emit('clear')"
        >
          Clear
        </button>
      </div>
    </div>

    <!-- Scrollable Monospace Log Stream Body -->
    <div
      ref="containerRef"
      class="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-[12px] leading-5 space-y-0.5 select-text"
      @scroll="onScroll"
    >
      <div v-if="logs.length === 0" class="flex flex-col items-center justify-center py-16 text-zinc-600 select-none">
        <svg class="h-8 w-8 text-zinc-700 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <p class="font-mono text-xs">Belum ada output log pada proses ini.</p>
        <p class="text-[11px] text-zinc-700 mt-1">Tekan Start untuk menjalankan runtime service.</p>
      </div>

      <div v-else-if="filteredLogs.length === 0" class="py-12 text-center text-zinc-600 font-mono text-xs select-none">
        Tidak ada baris log yang cocok dengan filter "{{ searchQuery }}".
      </div>

      <div
        v-for="(entry, index) in filteredLogs"
        :key="`${entry.ts}-${index}`"
        class="flex items-start gap-2.5 hover:bg-zinc-900/60 transition-colors rounded px-1.5 py-0.5 group"
      >
        <!-- Column 1: Monospace Timestamp -->
        <span class="text-[10px] text-zinc-600 shrink-0 font-mono select-none pt-0.5">
          {{ formatTimestamp(entry.ts) }}
        </span>

        <!-- Column 2: Severity Chip -->
        <span
          class="text-[9px] uppercase px-1 py-0.2 rounded font-semibold shrink-0 select-none border font-mono"
          :class="
            getLogLevel(entry.line, entry.stream) === 'error'
              ? 'bg-rose-950/60 text-rose-300 border-rose-900/60'
              : getLogLevel(entry.line, entry.stream) === 'warn'
              ? 'bg-amber-950/60 text-amber-300 border-amber-900/60'
              : 'bg-zinc-800 text-zinc-400 border-line'
          "
        >
          {{ getLogLevel(entry.line, entry.stream) }}
        </span>

        <!-- Column 3: Optional Subsystem Tag -->
        <span
          v-if="extractSubsystem(entry.line).tag"
          class="text-[10px] font-mono text-teal-400 shrink-0 font-medium select-none"
        >
          [{{ extractSubsystem(entry.line).tag }}]
        </span>

        <!-- Column 4: Message Body with Word Wrap -->
        <span
          class="whitespace-pre-wrap break-all flex-1 font-mono leading-relaxed"
          :class="
            entry.stream === 'stderr' || getLogLevel(entry.line, entry.stream) === 'error'
              ? 'text-rose-300'
              : getLogLevel(entry.line, entry.stream) === 'warn'
              ? 'text-amber-300'
              : entry.stream === 'system'
              ? 'text-teal-300 font-medium'
              : 'text-zinc-300'
          "
        >{{ extractSubsystem(entry.line).tag ? extractSubsystem(entry.line).cleanLine : entry.line }}</span>
      </div>
    </div>

    <!-- Interactive Command Dispatcher Prompt (Pinned at Base) -->
    <div class="border-t border-line bg-panel px-3 py-1.5 flex items-center gap-2 shrink-0 select-none">
      <span class="text-accent font-semibold font-mono text-[11px]">
        {{ projectName }} &gt;
      </span>
      <input
        v-model="commandInput"
        type="text"
        placeholder="Kirim perintah runtime (e.g. rs untuk restart, cls untuk clear)..."
        class="flex-1 bg-transparent border-none text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600 font-mono"
        @keydown.enter="submitCommand"
      />
      <button
        type="button"
        class="h-6 rounded bg-elevated border border-line px-2 text-[10px] font-mono text-zinc-400 hover:text-white hover:border-zinc-700 transition"
        @click="submitCommand"
      >
        Send ↵
      </button>
    </div>
  </section>
</template>
