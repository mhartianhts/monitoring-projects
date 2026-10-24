<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import MarkdownRenderer from "../components/ui/MarkdownRenderer.vue";
import type {
  ClaudeMessage,
  ClaudeSessionSummary,
  ClaudeSessionDetail,
  ClaudeStatusInfo,
  ClaudeChatMode,
} from "../types/claude.types";

const ACTIVE_SESSION_KEY = "claude_active_session_id";
const MODEL_KEY = "claude_chat_model";
const MODE_KEY = "claude_chat_mode";
const SHOW_DRAWER_KEY = "claude_show_drawer";
const FULLWIDTH_KEY = "claude_fullwidth";

const projectStore = useProjectStore();
const { projects } = storeToRefs(projectStore);

const messages = ref<ClaudeMessage[]>([]);
const inputText = ref("");
const isLoading = ref(false);
const isStreaming = ref(false);
const errorMessage = ref<string | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

// UI States
const isFullWidth = ref(localStorage.getItem(FULLWIDTH_KEY) === "true");
const showHistoryDrawer = ref(localStorage.getItem(SHOW_DRAWER_KEY) !== "false");
const searchQuery = ref("");

// Sessions State
const sessions = ref<ClaudeSessionSummary[]>([]);
const currentSessionId = ref<string>(localStorage.getItem(ACTIVE_SESSION_KEY) || "");
const currentSession = ref<ClaudeSessionDetail | null>(null);
const loadingSessions = ref(false);

// Claude CLI Status & Config
const claudeStatus = ref<ClaudeStatusInfo | null>(null);
const loadingStatus = ref(false);
const selectedModel = ref<string>(localStorage.getItem(MODEL_KEY) || "default");
const chatMode = ref<ClaudeChatMode>(
  (localStorage.getItem(MODE_KEY) as ClaudeChatMode) || "safe",
);
const selectedProjectId = ref<string | null>(null);

const availableModels = computed(() => {
  if (claudeStatus.value?.models?.length) {
    return claudeStatus.value.models;
  }
  return [
    { id: "default", name: "Auto (Sonnet / Opus)", desc: "Model bawaan Claude Code" },
    { id: "sonnet", name: "Claude 3.7 Sonnet", desc: "Paling seimbang & cerdas" },
    { id: "opus", name: "Claude 3 Opus", desc: "Penalaran mendalam untuk arsitektur" },
    { id: "haiku", name: "Claude 3.5 Haiku", desc: "Ringan & sangat cepat" },
  ];
});

const customSystemPrompt = ref(
  "Anda adalah Claude, asisten AI umum yang cerdas, ramah, dan serbaguna. Anda dapat menjawab berbagai topik secara luas layaknya chatbot pada umumnya (pengetahuan umum, percakapan sehari-hari, ide & penulisan, analisis logika & matematika, hingga rekayasa perangkat lunak dan pemrograman). Jawablah secara terstruktur, ramah, padat, dan jelas dengan format Markdown yang rapi. Jangan mengomentari status repositori git atau uncommitted changes kecuali jika diminta secara spesifik oleh pengguna.",
);
const showPromptModal = ref(false);

const quickSuggestions = [
  "Tulis artikel, email, atau draf profesional",
  "Jelaskan konsep rumit dengan analogi sederhana",
  "Brainstorming ide kreatif, bisnis & rencana kerja",
  "Bantu buatkan kode atau debug error pemrograman",
  "Analisis logika, matematika, atau ringkas teks panjang",
];

const filteredSessions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return sessions.value;
  return sessions.value.filter(
    (s) => s.title.toLowerCase().includes(q) || s.model.toLowerCase().includes(q),
  );
});

const activeProjectDetail = computed(() => {
  if (!selectedProjectId.value) return null;
  return projects.value.find((p) => p.id === selectedProjectId.value) || null;
});

const toggleFullWidth = () => {
  isFullWidth.value = !isFullWidth.value;
  localStorage.setItem(FULLWIDTH_KEY, String(isFullWidth.value));
};

const toggleHistoryDrawer = () => {
  showHistoryDrawer.value = !showHistoryDrawer.value;
  localStorage.setItem(SHOW_DRAWER_KEY, String(showHistoryDrawer.value));
};

const onModelChange = () => {
  localStorage.setItem(MODEL_KEY, selectedModel.value);
  notify.toast(`Model Claude diubah ke ${selectedModel.value}`, "info");
};

const onModeChange = (mode: ClaudeChatMode) => {
  chatMode.value = mode;
  localStorage.setItem(MODE_KEY, mode);
  notify.toast(
    mode === "safe"
      ? "Mode Aman: Claude hanya menjawab tanpa mengubah file"
      : "Mode Coding Agent: Claude memiliki akses analisis file projek",
    "info",
  );
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

const adjustTextareaHeight = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  const newHeight = Math.min(el.scrollHeight, 180);
  el.style.height = `${Math.max(newHeight, 46)}px`;
};

const fetchClaudeStatus = async () => {
  try {
    loadingStatus.value = true;
    const res = await api.getClaudeStatus();
    claudeStatus.value = res;
  } catch (err: any) {
    console.error("Gagal memeriksa status Claude CLI:", err);
  } finally {
    loadingStatus.value = false;
  }
};

const fetchSessions = async (autoSelect = false) => {
  try {
    loadingSessions.value = true;
    const list = await api.listClaudeSessions();
    sessions.value = list;

    if (autoSelect && list.length > 0) {
      if (currentSessionId.value && list.some((s) => s.id === currentSessionId.value)) {
        await loadSession(currentSessionId.value);
      } else {
        await loadSession(list[0].id);
      }
    }
  } catch (err: any) {
    console.error("Gagal mengambil riwayat sesi Claude:", err);
  } finally {
    loadingSessions.value = false;
  }
};

const loadSession = async (sessionId: string) => {
  if (!sessionId) return;
  try {
    isLoading.value = true;
    errorMessage.value = null;
    const session = await api.getClaudeSession(sessionId);
    if (session) {
      currentSession.value = session;
      currentSessionId.value = session.id;
      localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
      messages.value = session.messages || [];

      if (session.model) {
        selectedModel.value = session.model;
      }
      if (session.mode) {
        chatMode.value = session.mode;
      }
      if (session.projectId) {
        selectedProjectId.value = session.projectId;
      }
      await scrollToBottom();
    }
  } catch (err: any) {
    errorMessage.value = err?.message || "Gagal memuat sesi percakapan.";
  } finally {
    isLoading.value = false;
  }
};

const startNewChat = () => {
  currentSessionId.value = "";
  currentSession.value = null;
  localStorage.removeItem(ACTIVE_SESSION_KEY);
  messages.value = [];
  errorMessage.value = null;
  nextTick(() => {
    textareaRef.value?.focus();
  });
};

const deleteSession = async (sessionId: string, e: MouseEvent) => {
  e.stopPropagation();
  if (!confirm("Hapus percakapan Claude ini secara permanen?")) return;

  try {
    await api.deleteClaudeSession(sessionId);
    notify.toast("Percakapan Claude berhasil dihapus", "success");
    if (currentSessionId.value === sessionId) {
      startNewChat();
    }
    await fetchSessions(false);
  } catch (err: any) {
    notify.toast(`Gagal menghapus: ${err?.message}`, "error");
  }
};

const stopGeneration = async () => {
  if (!currentSessionId.value) return;
  try {
    await api.stopClaudeChat(currentSessionId.value);
    isStreaming.value = false;
    isLoading.value = false;
    notify.toast("Generasi Claude dihentikan", "info");
  } catch (err: any) {
    console.error("Gagal menghentikan Claude:", err);
  }
};

const copyMessage = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content);
    notify.toast("Pesan tersalin ke clipboard", "success");
  } catch {
    notify.toast("Gagal menyalin pesan", "error");
  }
};

const useQuickPrompt = (prompt: string) => {
  inputText.value = prompt;
  nextTick(() => {
    adjustTextareaHeight();
    textareaRef.value?.focus();
  });
};

const formatTimeAgo = (isoDate: string) => {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Baru saja";
    if (diffMins < 60) return `${diffMins}m lalu`;
    if (diffHours < 24) return `${diffHours}j lalu`;
    if (diffDays === 1) return "Kemarin";
    if (diffDays < 7) return `${diffDays}h lalu`;
    return date.toLocaleDateString("id-ID", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
};

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || isLoading.value || isStreaming.value) return;

  errorMessage.value = null;

  const userMsg: ClaudeMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: "user",
    content: text,
    timestamp: new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  messages.value.push(userMsg);
  inputText.value = "";
  if (textareaRef.value) {
    textareaRef.value.style.height = "46px";
  }
  await scrollToBottom();

  isLoading.value = true;
  isStreaming.value = true;

  const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const assistantMsg: ClaudeMessage = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    timestamp: new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    model: selectedModel.value,
    isStreaming: true,
  };
  messages.value.push(assistantMsg);
  await scrollToBottom();

  try {
    await api.claudeChatStream(
      {
        message: text,
        sessionId: currentSessionId.value || undefined,
        model: selectedModel.value,
        projectId: selectedProjectId.value || undefined,
        mode: chatMode.value,
        systemPrompt: customSystemPrompt.value.trim() || undefined,
      },
      {
        onChunk: (delta) => {
          assistantMsg.content += delta;
          void scrollToBottom();
        },
        onDone: async (data) => {
          assistantMsg.isStreaming = false;
          if (data?.reply && !assistantMsg.content) {
            assistantMsg.content = data.reply;
          }
          if (data?.stats) {
            assistantMsg.stats = data.stats;
            if (data.stats.model) {
              assistantMsg.model = data.stats.model;
            }
          }
          if (data?.sessionId && data.sessionId !== currentSessionId.value) {
            currentSessionId.value = data.sessionId;
            localStorage.setItem(ACTIVE_SESSION_KEY, data.sessionId);
          }

          isLoading.value = false;
          isStreaming.value = false;
          await fetchSessions(false);
          await scrollToBottom();
        },
        onError: (err) => {
          throw err;
        },
      },
    );
  } catch (err: any) {
    assistantMsg.isStreaming = false;
    isStreaming.value = false;
    isLoading.value = false;

    if (!assistantMsg.content) {
      messages.value = messages.value.filter((m) => m.id !== assistantMsgId);
    }

    errorMessage.value =
      err?.message ||
      "Gagal berkomunikasi dengan Claude Code CLI di laptop Anda.";
    notify.toast(errorMessage.value || "Terjadi kesalahan", "error");
  }
};

onMounted(async () => {
  // Secara default mode general (selectedProjectId = null)
  await Promise.all([fetchClaudeStatus(), fetchSessions(true)]);
});
</script>

<template>
  <div class="flex h-full w-full overflow-hidden bg-base text-ink select-text">
    <!-- Collapsible History Drawer / Sidebar Sesi -->
    <aside
      v-if="showHistoryDrawer"
      class="flex h-full w-72 shrink-0 flex-col border-r border-line bg-panel transition-all duration-200 z-20"
    >
      <!-- History Drawer Header -->
      <div class="p-3 border-b border-line space-y-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-6 w-6 items-center justify-center rounded bg-amber-500/20 text-amber-400 text-xs font-bold">
              ⚡
            </span>
            <span class="text-xs font-bold uppercase tracking-wider text-ink font-mono">
              Claude Sessions
            </span>
          </div>
          <button
            type="button"
            class="text-xs text-muted hover:text-ink transition p-1 rounded hover:bg-elevated"
            title="Tutup riwayat"
            @click="toggleHistoryDrawer"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          class="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-medium text-xs py-2 px-3 shadow-sm transition hover:shadow-amber-500/20"
          @click="startNewChat"
        >
          <span class="text-sm font-bold">+</span>
          <span>Obrolan Baru</span>
        </button>

        <!-- Search input -->
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari obrolan..."
            class="w-full rounded border border-line bg-base px-2.5 py-1.5 text-xs text-ink outline-none placeholder:text-muted/60 focus:border-amber-500/60 transition"
          />
          <span
            v-if="searchQuery"
            class="absolute right-2 top-1.5 cursor-pointer text-xs text-muted hover:text-ink"
            @click="searchQuery = ''"
          >
            ✕
          </span>
        </div>
      </div>

      <!-- History List -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1">
        <p
          v-if="loadingSessions"
          class="text-center text-xs text-muted py-6 animate-pulse"
        >
          Memuat riwayat sesi...
        </p>
        <p
          v-else-if="filteredSessions.length === 0"
          class="text-center text-xs text-muted/60 py-6"
        >
          Belum ada percakapan Claude
        </p>
        <template v-else>
          <div
            v-for="session in filteredSessions"
            :key="session.id"
            class="group relative flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition cursor-pointer"
            :class="
              currentSessionId === session.id
                ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300 font-medium'
                : 'text-muted hover:bg-elevated hover:text-ink border border-transparent'
            "
            @click="loadSession(session.id)"
          >
            <div class="min-w-0 flex-1 pr-2">
              <p class="truncate font-medium text-xs leading-tight">
                {{ session.title }}
              </p>
              <div class="flex items-center gap-2 mt-1 text-[10px] text-muted/70 font-mono">
                <span>{{ formatTimeAgo(session.updatedAt) }}</span>
                <span>•</span>
                <span>{{ session.messageCount }} pesan</span>
                <span v-if="session.mode === 'agent'" class="text-amber-400 font-semibold">• Agent</span>
              </div>
            </div>

            <!-- Delete button -->
            <button
              type="button"
              class="opacity-0 group-hover:opacity-100 p-1 text-muted hover:text-stopped transition shrink-0 rounded hover:bg-line/40"
              title="Hapus sesi"
              @click="deleteSession(session.id, $event)"
            >
              🗑️
            </button>
          </div>
        </template>
      </div>

      <!-- Drawer Footer Info -->
      <div class="border-t border-line p-2.5 text-[10px] text-muted flex items-center justify-between">
        <span class="font-mono">Claude Code CLI</span>
        <span
          class="font-semibold"
          :class="claudeStatus?.available ? 'text-running' : 'text-stopped'"
        >
          {{ claudeStatus?.available ? 'Ready' : 'Offline' }}
        </span>
      </div>
    </aside>

    <!-- Main Chat Content Container -->
    <div class="flex flex-1 flex-col h-full min-w-0 bg-base overflow-hidden">
      <!-- Top Control Bar (Glassmorphic) -->
      <header
        class="flex items-center justify-between gap-3 border-b border-line bg-panel/90 backdrop-blur-md px-4 py-2.5 z-10 shrink-0"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <button
            v-if="!showHistoryDrawer"
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-elevated text-xs text-muted hover:text-ink hover:border-amber-500/40 transition shrink-0"
            title="Buka riwayat percakapan"
            @click="toggleHistoryDrawer"
          >
            📂
          </button>

          <!-- Claude Identity Badge -->
          <div class="flex items-center gap-2 min-w-0">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-xs font-bold text-xs shrink-0">
              ⚡
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h1 class="text-xs font-bold text-ink truncate font-mono">
                  Claude Code Assistant
                </h1>
                <span
                  v-if="claudeStatus?.version"
                  class="hidden sm:inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-400 border border-amber-500/20"
                >
                  v{{ claudeStatus.version.split(' ')[0] }}
                </span>
                <span
                  class="flex items-center gap-1 text-[10px] font-mono"
                  :class="claudeStatus?.available ? 'text-running' : 'text-stopped'"
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full"
                    :class="claudeStatus?.available ? 'bg-running animate-pulse' : 'bg-stopped'"
                  ></span>
                  <span class="hidden md:inline">{{ claudeStatus?.available ? 'Laptop Terhubung' : 'Tidak Terdeteksi' }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Controls: Context, Mode, Model, Fullwidth -->
        <div class="flex items-center gap-2 shrink-0">
          <!-- Button Persona / System Prompt -->
          <button
            type="button"
            class="hidden sm:flex items-center gap-1.5 rounded-md border border-line bg-elevated px-2 py-1 text-xs text-muted hover:text-ink hover:border-amber-500/40 transition"
            title="Kustomisasi Persona & Instruksi Umum Claude"
            @click="showPromptModal = true"
          >
            <span>⚙️</span>
            <span class="hidden md:inline font-mono text-[11px]">Instruksi</span>
          </button>

          <!-- Project Scope Selector -->
          <div class="hidden md:flex items-center gap-1.5 rounded-md border border-line bg-elevated/70 px-2 py-1 text-xs">
            <span class="text-muted text-[11px]">Konteks:</span>
            <select
              v-model="selectedProjectId"
              class="bg-transparent text-xs text-ink font-medium outline-none cursor-pointer max-w-[130px] truncate"
              title="Pilih mode umum atau arahkan ke folder projek spesifik"
            >
              <option :value="null" class="bg-panel text-ink">
                🌍 Mode Umum (General)
              </option>
              <option
                v-for="p in projects"
                :key="p.id"
                :value="p.id"
                class="bg-panel text-ink"
              >
                📁 {{ p.name }}
              </option>
            </select>
          </div>

          <!-- Mode Toggle: Safe vs Agent -->
          <div class="flex items-center rounded-md border border-line bg-elevated p-0.5 text-xs">
            <button
              type="button"
              class="rounded px-2 py-0.5 font-medium transition text-[11px]"
              :class="
                chatMode === 'safe'
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-muted hover:text-ink'
              "
              title="Mode Aman: Claude hanya berdiskusi tanpa memodifikasi file lokal"
              @click="onModeChange('safe')"
            >
              🛡️ Safe
            </button>
            <button
              type="button"
              class="rounded px-2 py-0.5 font-medium transition text-[11px]"
              :class="
                chatMode === 'agent'
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-muted hover:text-ink'
              "
              title="Mode Coding Agent: Claude dapat menginspeksi file dan struktur projek"
              @click="onModeChange('agent')"
            >
              ⚡ Agent
            </button>
          </div>

          <!-- Model Selector -->
          <select
            v-model="selectedModel"
            class="rounded-md border border-line bg-elevated px-2 py-1 text-xs font-mono text-ink outline-none cursor-pointer hover:border-amber-500/40 transition"
            title="Pilih varian model Claude"
            @change="onModelChange"
          >
            <option
              v-for="m in availableModels"
              :key="m.id"
              :value="m.id"
              class="bg-panel text-ink"
            >
              {{ m.name }}
            </option>
          </select>

          <!-- Full Width Toggle -->
          <button
            type="button"
            class="hidden sm:flex h-7 w-7 items-center justify-center rounded-md border border-line bg-elevated text-xs text-muted hover:text-ink hover:border-amber-500/40 transition"
            :title="isFullWidth ? 'Format Konten Terpusat' : 'Format Lebar Penuh'"
            @click="toggleFullWidth"
          >
            {{ isFullWidth ? '⇲' : '⇱' }}
          </button>
        </div>
      </header>

      <!-- Messages Stream Area -->
      <main
        ref="messagesContainer"
        class="flex-1 overflow-y-auto px-4 py-6 space-y-5"
      >
        <div
          class="mx-auto flex flex-col space-y-5 transition-all duration-200"
          :class="isFullWidth ? 'w-full px-2' : 'max-w-4xl'"
        >
          <!-- Banner Notifikasi bila Claude CLI Offline -->
          <div
            v-if="claudeStatus && !claudeStatus.available"
            class="rounded-xl border border-stopped/30 bg-stopped/10 p-4 text-xs text-stopped flex items-start gap-3"
          >
            <span class="text-base shrink-0">⚠️</span>
            <div>
              <p class="font-bold">Claude Code CLI Tidak Terdeteksi di Laptop</p>
              <p class="mt-1 text-muted">
                {{ claudeStatus.hint || 'Pastikan Claude Code CLI sudah terpasang dan login di terminal laptop Anda.' }}
              </p>
              <code class="mt-2 inline-block rounded bg-base px-2 py-1 font-mono text-[11px] text-ink border border-line">
                npm i -g @anthropic-ai/claude-code
              </code>
            </div>
          </div>

          <!-- Empty State / Hero Greeting -->
          <div
            v-if="messages.length === 0"
            class="flex flex-col items-center justify-center py-12 text-center"
          >
            <div class="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/30 to-amber-700/20 border border-amber-500/40 text-amber-400 text-3xl shadow-lg mb-4">
              ⚡
              <span class="absolute -top-1 -right-1 flex h-3 w-3">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
            </div>

            <h2 class="text-lg font-bold text-ink">
              Claude General Assistant
            </h2>
            <p class="mt-1 text-xs text-muted max-w-md">
              Asisten AI serbaguna yang terhubung langsung ke laptop Anda. Tanyakan apa saja mulai dari percakapan umum, ide kreatif, penjelasan konsep, penulisan teks, hingga analisis logika dan pemrograman.
            </p>

            <div v-if="activeProjectDetail" class="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300 font-mono">
              <span>📁 Projek Aktif:</span>
              <span class="font-bold">{{ activeProjectDetail.name }}</span>
            </div>

            <!-- Quick Suggestions Grid -->
            <div class="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-2xl text-left">
              <button
                v-for="(suggestion, i) in quickSuggestions"
                :key="i"
                type="button"
                class="rounded-xl border border-line bg-panel p-3 text-xs text-ink transition hover:border-amber-500/50 hover:bg-elevated hover:shadow-xs group flex items-start gap-2.5"
                @click="useQuickPrompt(suggestion)"
              >
                <span class="text-amber-400 group-hover:scale-110 transition-transform text-sm">✦</span>
                <span class="leading-relaxed">{{ suggestion }}</span>
              </button>
            </div>
          </div>

          <!-- Chat Messages Bubble List -->
          <template v-else>
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex flex-col space-y-1.5"
            >
              <!-- Message Bubble -->
              <div
                class="flex gap-3"
                :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
              >
                <!-- Assistant Avatar -->
                <div
                  v-if="msg.role !== 'user'"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white font-bold text-xs shadow-xs"
                >
                  ⚡
                </div>

                <!-- Message Body Card -->
                <div
                  class="relative max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed"
                  :class="
                    msg.role === 'user'
                      ? 'bg-amber-600 text-white rounded-tr-xs shadow-sm'
                      : 'bg-panel border border-line rounded-tl-xs shadow-sm text-ink'
                  "
                >
                  <!-- Header inside assistant message -->
                  <div
                    v-if="msg.role !== 'user'"
                    class="flex items-center justify-between gap-3 border-b border-line/60 pb-1.5 mb-2 text-[10px] text-muted font-mono"
                  >
                    <span class="font-semibold text-amber-400">
                      Claude Code {{ msg.model ? `(${msg.model})` : '' }}
                    </span>
                    <div class="flex items-center gap-2">
                      <span v-if="msg.timestamp">{{ msg.timestamp }}</span>
                      <button
                        type="button"
                        class="text-muted hover:text-ink transition hover:underline"
                        title="Salin isi pesan"
                        @click="copyMessage(msg.content)"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <!-- Content User (Plain text with break) -->
                  <div
                    v-if="msg.role === 'user'"
                    class="whitespace-pre-wrap select-text leading-relaxed font-sans text-[13px]"
                  >
                    {{ msg.content }}
                  </div>

                  <!-- Content Assistant (Markdown Rendering) -->
                  <div v-else class="space-y-2">
                    <MarkdownRenderer
                      v-if="msg.content"
                      :content="msg.content"
                    />

                    <!-- Streaming Typing Indicator -->
                    <div
                      v-if="msg.isStreaming"
                      class="flex items-center gap-1.5 pt-1 text-amber-400"
                    >
                      <span class="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                      <span class="text-[11px] font-mono text-muted animate-pulse">Claude sedang merespons...</span>
                    </div>

                    <!-- Usage / Stats Pill -->
                    <div
                      v-if="msg.stats"
                      class="mt-2 pt-2 border-t border-line/40 flex flex-wrap items-center gap-3 text-[10px] text-muted/80 font-mono"
                    >
                      <span v-if="msg.stats.durationMs">
                        ⏱️ {{ (msg.stats.durationMs / 1000).toFixed(2) }}s
                      </span>
                      <span v-if="msg.stats.totalCostUsd">
                        💰 ${{ msg.stats.totalCostUsd.toFixed(4) }}
                      </span>
                      <span v-if="msg.stats.usage?.output_tokens">
                        📊 {{ msg.stats.usage.output_tokens }} tokens
                      </span>
                    </div>
                  </div>
                </div>

                <!-- User Avatar -->
                <div
                  v-if="msg.role === 'user'"
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevated border border-line text-xs font-semibold text-ink shadow-xs"
                >
                  👤
                </div>
              </div>
            </div>
          </template>

          <!-- Error Alert Banner -->
          <div
            v-if="errorMessage"
            class="rounded-xl border border-stopped/30 bg-stopped/10 p-3 text-xs text-stopped flex items-center justify-between"
          >
            <span>⚠️ {{ errorMessage }}</span>
            <button
              type="button"
              class="text-stopped font-bold hover:underline"
              @click="errorMessage = null"
            >
              Tutup
            </button>
          </div>
        </div>
      </main>

      <!-- Bottom Chat Input Dock -->
      <footer class="border-t border-line bg-panel p-3 shrink-0">
        <div
          class="mx-auto transition-all duration-200"
          :class="isFullWidth ? 'w-full px-2' : 'max-w-4xl'"
        >
          <!-- Quick suggestions pill on active chat -->
          <div
            v-if="messages.length > 0 && !isLoading && !isStreaming"
            class="mb-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]"
          >
            <span class="text-muted/60 text-[10px] shrink-0 font-mono">Saran:</span>
            <button
              v-for="(sug, idx) in quickSuggestions.slice(0, 3)"
              :key="idx"
              type="button"
              class="shrink-0 rounded-full border border-line bg-elevated px-2.5 py-0.5 text-muted hover:border-amber-500/50 hover:text-amber-300 transition"
              @click="useQuickPrompt(sug)"
            >
              {{ sug }}
            </button>
          </div>

          <!-- Input Box Card -->
          <div
            class="relative rounded-xl border border-line bg-base transition-colors focus-within:border-amber-500/60 shadow-xs"
          >
            <textarea
              ref="textareaRef"
              v-model="inputText"
              rows="1"
              placeholder="Tanyakan apa saja kepada Claude... (Enter untuk kirim)"
              class="w-full resize-none bg-transparent px-3.5 py-3 pr-24 text-xs text-ink outline-none placeholder:text-muted/50 leading-relaxed font-sans"
              :disabled="isLoading || isStreaming"
              @input="adjustTextareaHeight"
              @keydown="onKeydown"
            />

            <!-- Action Controls (Right Bottom inside Textarea) -->
            <div class="absolute right-2 bottom-2 flex items-center gap-1.5">
              <!-- Stop Button when streaming -->
              <button
                v-if="isStreaming || isLoading"
                type="button"
                class="flex items-center gap-1 rounded-lg bg-stopped/20 border border-stopped/40 px-2.5 py-1 text-xs font-semibold text-stopped hover:bg-stopped/30 transition animate-pulse"
                title="Hentikan respons Claude"
                @click="stopGeneration"
              >
                <span>⏹</span>
                <span class="hidden sm:inline">Stop</span>
              </button>

              <!-- Send Button -->
              <button
                v-else
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-bold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                :disabled="!inputText.trim()"
                title="Kirim pesan (Enter)"
                @click="sendMessage"
              >
                ➔
              </button>
            </div>
          </div>

          <!-- Hint Footer -->
          <div class="mt-1.5 flex items-center justify-between px-1 text-[10px] text-muted/60">
            <span>
              Tekan <kbd class="rounded border border-line bg-elevated px-1 font-mono">Enter</kbd> untuk kirim, <kbd class="rounded border border-line bg-elevated px-1 font-mono">Shift + Enter</kbd> baris baru.
            </span>
            <span class="font-mono hidden sm:inline">
              Claude Code CLI • Local Terminal Bridge
            </span>
          </div>
        </div>
      </footer>
    </div>

    <!-- Modal Instruksi / System Prompt General -->
    <div
      v-if="showPromptModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      @click.self="showPromptModal = false"
    >
      <div class="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <div class="flex items-center gap-2">
            <span class="text-amber-400 text-lg">⚙️</span>
            <div>
              <h3 class="text-sm font-bold text-ink">Instruksi & Persona Claude (General)</h3>
              <p class="text-[11px] text-muted">Sesuaikan bagaimana Claude merespons setiap pertanyaan Anda</p>
            </div>
          </div>
          <button
            type="button"
            class="text-muted hover:text-ink transition p-1"
            @click="showPromptModal = false"
          >
            ✕
          </button>
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-semibold text-ink">System Prompt:</label>
          <textarea
            v-model="customSystemPrompt"
            rows="5"
            class="w-full rounded-xl border border-line bg-base p-3 text-xs text-ink outline-none focus:border-amber-500/60 leading-relaxed font-sans"
            placeholder="Instruksi umum untuk Claude..."
          />
        </div>

        <div class="flex items-center justify-between pt-2">
          <button
            type="button"
            class="text-xs text-muted hover:text-amber-400 transition underline"
            @click="customSystemPrompt = 'Anda adalah Claude, asisten AI umum yang cerdas, ramah, dan serbaguna. Anda dapat menjawab berbagai topik secara luas layaknya chatbot pada umumnya (pengetahuan umum, percakapan sehari-hari, ide & penulisan, analisis logika & matematika, hingga rekayasa perangkat lunak dan pemrograman). Jawablah secara terstruktur, ramah, padat, dan jelas dengan format Markdown yang rapi. Jangan mengomentari status repositori git atau uncommitted changes kecuali jika diminta secara spesifik oleh pengguna.'"
          >
            Reset ke Standar Umum
          </button>
          <button
            type="button"
            class="rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-1.5 text-xs font-semibold text-white transition shadow-sm"
            @click="showPromptModal = false; notify.toast('Instruksi Claude diperbarui', 'success')"
          >
            Simpan & Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
