<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from "vue";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import MarkdownRenderer from "../components/ui/MarkdownRenderer.vue";
import type { TokenPortalModel } from "../types/project";
import type {
  ChatMessage,
  ChatSessionSummary,
  ChatSessionDetail,
} from "../types/chat.types";

const MODEL_KEY = "tokenportal_ai_model";
const FULLWIDTH_KEY = "ai_chatbot_fullwidth";
const ACTIVE_SESSION_KEY = "ai_chatbot_active_session_id";
const SHOW_DRAWER_KEY = "ai_chatbot_show_history";

const messages = ref<ChatMessage[]>([]);
const inputText = ref("");
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const messagesContainer = ref<HTMLElement | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

// Layout & View States
const isFullWidth = ref(localStorage.getItem(FULLWIDTH_KEY) === "true");
const showHistoryDrawer = ref(localStorage.getItem(SHOW_DRAWER_KEY) !== "false");

// Sessions State
const sessions = ref<ChatSessionSummary[]>([]);
const currentSessionId = ref<string>(localStorage.getItem(ACTIVE_SESSION_KEY) || "");
const currentSession = ref<ChatSessionDetail | null>(null);
const loadingSessions = ref(false);

// Models
const aiModels = ref<TokenPortalModel[]>([]);
const selectedAiModel = ref<string>(localStorage.getItem(MODEL_KEY) || "deepseek-v4-flash");
const loadingModels = ref(false);

// Custom system prompt
const showSystemPrompt = ref(false);
const customSystemPrompt = ref(
  "Anda adalah asisten AI yang cerdas, praktis, ramah, dan berpengalaman dalam rekayasa perangkat lunak (software engineering). Berikan jawaban yang terstruktur, padat, dan jelas. Gunakan format Markdown untuk heading, bullet points, dan blok kode dengan sintaks yang spesifik jika relevan."
);

// Quick suggestions
const quickPrompts = [
  "Bantu analisa arsitektur sistem berbasis Event-Driven",
  "Buat fungsi TypeScript debounce dengan generic types",
  "Jelaskan perbedaan antrian Redis vs RabbitMQ untuk background jobs",
  "Refactor query SQL kompleks untuk optimasi indexing",
];

const activeModelInfo = computed(() => {
  return aiModels.value.find((m) => m.id === selectedAiModel.value) || null;
});

const currentSessionTokens = computed(() => {
  if (currentSession.value?.totalTokens) {
    return currentSession.value.totalTokens;
  }
  return messages.value.reduce((acc, m) => acc + (m.stats?.totalTokens || 0), 0);
});

const toggleFullWidth = () => {
  isFullWidth.value = !isFullWidth.value;
  localStorage.setItem(FULLWIDTH_KEY, String(isFullWidth.value));
};

const toggleHistoryDrawer = () => {
  showHistoryDrawer.value = !showHistoryDrawer.value;
  localStorage.setItem(SHOW_DRAWER_KEY, String(showHistoryDrawer.value));
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
};

// Sessions Management
const fetchSessions = async (autoSelect = false) => {
  try {
    loadingSessions.value = true;
    const list = await api.listChatSessions();
    sessions.value = list;

    if (autoSelect && list.length > 0) {
      if (currentSessionId.value && list.some((s) => s.id === currentSessionId.value)) {
        await loadSession(currentSessionId.value);
      } else {
        await loadSession(list[0].id);
      }
    }
  } catch (err: any) {
    console.error("Gagal mengambil riwayat sesi chat:", err);
  } finally {
    loadingSessions.value = false;
  }
};

const loadSession = async (sessionId: string) => {
  if (!sessionId) return;
  try {
    isLoading.value = true;
    errorMessage.value = null;
    const session = await api.getChatSession(sessionId);
    if (session) {
      currentSession.value = session;
      currentSessionId.value = session.id;
      localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
      messages.value = session.messages || [];

      if (session.model && aiModels.value.some((m) => m.id === session.model)) {
        selectedAiModel.value = session.model;
        localStorage.setItem(MODEL_KEY, session.model);
      }
      await scrollToBottom();
    }
  } catch (err: any) {
    errorMessage.value = err?.message || "Gagal memuat sesi obrolan.";
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

const handleDeleteSession = async (sessionId: string, e: MouseEvent) => {
  e.stopPropagation();
  if (!confirm("Hapus percakapan ini secara permanen dari server?")) return;

  try {
    await api.deleteChatSession(sessionId);
    notify.toast("Percakapan berhasil dihapus", "success");

    if (currentSessionId.value === sessionId) {
      startNewChat();
    }
    await fetchSessions(false);
  } catch (err: any) {
    notify.toast(`Gagal menghapus percakapan: ${err?.message}`, "error");
  }
};

const fetchAiModels = async () => {
  try {
    loadingModels.value = true;
    const res = await api.aiModels();
    if (res?.models?.length) {
      aiModels.value = res.models;
      const saved = localStorage.getItem(MODEL_KEY);
      if (!saved && aiModels.value.some((m) => m.id === "deepseek-v4-flash")) {
        selectedAiModel.value = "deepseek-v4-flash";
        localStorage.setItem(MODEL_KEY, "deepseek-v4-flash");
      } else if (!aiModels.value.some((m) => m.id === selectedAiModel.value)) {
        selectedAiModel.value = aiModels.value.some((m) => m.id === "deepseek-v4-flash")
          ? "deepseek-v4-flash"
          : res.defaultModel || aiModels.value[0]?.id || "kimi-k27-code";
        localStorage.setItem(MODEL_KEY, selectedAiModel.value);
      }
    }
  } catch (err: any) {
    console.error("Gagal memuat daftar model AI:", err);
  } finally {
    loadingModels.value = false;
  }
};

const onModelChange = () => {
  localStorage.setItem(MODEL_KEY, selectedAiModel.value);
  notify.toast(`Model diganti ke ${activeModelInfo.value?.name || selectedAiModel.value}`, "info");
};

const adjustTextareaHeight = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = "auto";
  const newHeight = Math.min(el.scrollHeight, 180);
  el.style.height = `${Math.max(newHeight, 44)}px`;
};

const usePrompt = (prompt: string) => {
  inputText.value = prompt;
  nextTick(() => {
    adjustTextareaHeight();
    textareaRef.value?.focus();
  });
};

const copyMessage = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content);
    notify.toast("Pesan tersalin ke clipboard", "success");
  } catch {
    notify.toast("Gagal menyalin pesan", "error");
  }
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

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || isLoading.value) return;

  errorMessage.value = null;
  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: "user",
    content: text,
    timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
  };

  messages.value.push(userMsg);
  inputText.value = "";
  if (textareaRef.value) {
    textareaRef.value.style.height = "44px";
  }
  await scrollToBottom();

  isLoading.value = true;

  const assistantMsgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const assistantMsg: ChatMessage = {
    id: assistantMsgId,
    role: "assistant",
    content: "",
    timestamp: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    model: selectedAiModel.value,
    isStreaming: true,
  };
  messages.value.push(assistantMsg);
  await scrollToBottom();

  try {
    const historyPayload = messages.value
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.id !== assistantMsgId)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));

    await api.aiChatStream(
      {
        message: text,
        sessionId: currentSessionId.value || undefined,
        history: historyPayload.slice(0, -1),
        model: selectedAiModel.value,
        systemPrompt: customSystemPrompt.value.trim() || undefined,
      },
      {
        onChunk: (delta) => {
          assistantMsg.content += delta;
          void scrollToBottom();
        },
        onDone: async (data) => {
          assistantMsg.isStreaming = false;
          if (data.reply && !assistantMsg.content) {
            assistantMsg.content = data.reply;
          }
          if (data.stats) {
            assistantMsg.stats = data.stats;
            if (data.stats.model) {
              assistantMsg.model = data.stats.model;
            }
          }

          if (data.sessionId && data.sessionId !== currentSessionId.value) {
            currentSessionId.value = data.sessionId;
            localStorage.setItem(ACTIVE_SESSION_KEY, data.sessionId);
          }

          // Segarkan daftar sesi di background untuk memperbarui judul dan token
          await fetchSessions(false);
          if (currentSessionId.value) {
            const updated = await api.getChatSession(currentSessionId.value);
            if (updated) currentSession.value = updated;
          }
        },
        onError: (err) => {
          throw err;
        },
      }
    );
  } catch (err: any) {
    if (!assistantMsg.content) {
      messages.value = messages.value.filter((m) => m.id !== assistantMsgId);
    } else {
      assistantMsg.isStreaming = false;
    }
    errorMessage.value = err?.message || "Terjadi kesalahan saat memproses streaming AI.";
  } finally {
    assistantMsg.isStreaming = false;
    isLoading.value = false;
    await scrollToBottom();
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
};

onMounted(async () => {
  await fetchAiModels();
  await fetchSessions(true);
  void scrollToBottom();
});
</script>

<template>
  <div class="flex-1 min-w-0 flex h-full bg-base overflow-hidden">
    <!-- Left Sidebar: Chat Sessions History Drawer -->
    <aside
      v-if="showHistoryDrawer"
      class="w-64 sm:w-72 border-r border-line/80 bg-panel/95 flex flex-col shrink-0 z-30 transition-all duration-200"
    >
      <!-- History Drawer Header -->
      <div class="p-3 border-b border-line/70 flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base">📑</span>
          <span class="text-xs font-bold text-ink uppercase tracking-wider font-mono truncate">
            Riwayat Obrolan
          </span>
        </div>
        <button
          type="button"
          class="text-muted hover:text-ink text-xs p-1 rounded-md transition"
          @click="toggleHistoryDrawer"
          title="Sembunyikan sidebar riwayat"
        >
          ✕
        </button>
      </div>

      <!-- New Chat Button -->
      <div class="p-3 shrink-0">
        <button
          type="button"
          class="w-full flex items-center justify-center gap-2 rounded-xl bg-accent/15 border border-accent/30 py-2.5 px-3 text-xs font-semibold text-accent transition hover:bg-accent/25 hover:border-accent/50 shadow-xs group"
          @click="startNewChat"
          title="Mulai obrolan baru"
        >
          <span class="text-sm font-bold group-hover:scale-110 transition-transform">➕</span>
          <span>Obrolan Baru</span>
        </button>
      </div>

      <!-- Sessions List -->
      <div class="flex-1 overflow-y-auto px-2 space-y-1">
        <div
          v-if="loadingSessions && sessions.length === 0"
          class="p-4 text-center text-xs text-muted font-mono"
        >
          Memuat riwayat...
        </div>

        <div
          v-else-if="sessions.length === 0"
          class="p-4 text-center text-xs text-muted leading-relaxed"
        >
          Belum ada riwayat percakapan yang tersimpan di server.
        </div>

        <button
          v-for="s in sessions"
          :key="s.id"
          type="button"
          class="w-full text-left rounded-xl p-2.5 text-xs transition border flex flex-col gap-1 group relative cursor-pointer"
          :class="
            currentSessionId === s.id
              ? 'bg-accent/15 border-accent/40 text-accent font-semibold shadow-xs'
              : 'border-transparent text-ink/90 hover:bg-elevated hover:border-line/60'
          "
          @click="loadSession(s.id)"
        >
          <div class="flex items-center justify-between gap-1.5 w-full">
            <span class="truncate font-medium text-xs flex-1" :title="s.title">
              {{ s.title }}
            </span>
            <button
              type="button"
              class="opacity-0 group-hover:opacity-100 hover:text-stopped transition text-[11px] p-0.5 rounded shrink-0"
              @click="handleDeleteSession(s.id, $event)"
              title="Hapus percakapan ini"
            >
              🗑️
            </button>
          </div>

          <div class="flex items-center justify-between text-[10px] text-muted font-mono">
            <span class="truncate opacity-75">{{ s.model }}</span>
            <div class="flex items-center gap-1.5 shrink-0">
              <span v-if="s.totalTokens" class="rounded bg-elevated px-1 py-0.2 border border-line/60 text-muted" title="Token terpakai">
                {{ s.totalTokens > 1000 ? `${(s.totalTokens / 1000).toFixed(1)}K` : s.totalTokens }} tok
              </span>
              <span>{{ formatTimeAgo(s.updatedAt) }}</span>
            </div>
          </div>
        </button>
      </div>

      <!-- Footer Info -->
      <div class="p-2.5 border-t border-line/70 text-[10px] text-muted text-center font-mono shrink-0">
        {{ sessions.length }} Percakapan Tersimpan
      </div>
    </aside>

    <!-- Main Chat Workspace Body -->
    <div class="flex-1 min-w-0 flex flex-col h-full bg-base overflow-hidden">
      <!-- Header Bar -->
      <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 bg-panel/90 backdrop-blur-md px-4 py-2.5 z-20 shrink-0">
        <div class="flex items-center gap-3 min-w-0">
          <!-- Toggle Drawer Button -->
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 text-xs font-semibold text-ink transition hover:border-accent/40 hover:text-accent shadow-xs"
            :class="{ 'border-accent/50 text-accent bg-accent/10': showHistoryDrawer }"
            @click="toggleHistoryDrawer"
            title="Buka/Tutup Riwayat Percakapan"
          >
            <span>📑</span>
            <span class="hidden sm:inline font-mono text-[11px]">Riwayat</span>
            <span v-if="sessions.length > 0" class="rounded-full bg-accent/20 text-accent px-1.5 py-0.2 text-[9px] font-mono">
              {{ sessions.length }}
            </span>
          </button>

          <!-- Current Chat Title -->
          <div class="min-w-0 flex items-center gap-2">
            <h1 class="text-sm font-bold text-ink truncate max-w-[180px] sm:max-w-xs md:max-w-md" :title="currentSession?.title || 'Obrolan Baru'">
              {{ currentSession?.title || "Obrolan Baru" }}
            </h1>
            <span class="rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent border border-accent/20 shrink-0">
              Alat Independen
            </span>
          </div>
        </div>

        <!-- Controls: Model Selector & Actions -->
        <div class="flex items-center gap-2">
          <!-- Token Usage Badge -->
          <div
            v-if="currentSessionTokens > 0"
            class="hidden lg:flex items-center gap-1.5 bg-elevated/70 border border-line rounded-lg px-2.5 py-1 text-xs font-mono text-muted"
            title="Total token terpakai di sesi ini"
          >
            <span>💰</span>
            <span class="text-ink font-semibold">{{ currentSessionTokens.toLocaleString() }}</span>
            <span class="text-[10px]">tokens</span>
          </div>

          <!-- Model Selection Dropdown -->
          <div class="flex items-center gap-1.5 bg-elevated/70 border border-line rounded-lg px-2.5 py-1">
            <span class="text-xs text-muted">Model:</span>
            <select
              v-model="selectedAiModel"
              class="bg-transparent text-xs font-semibold text-ink focus:outline-hidden cursor-pointer max-w-[130px] sm:max-w-[180px] truncate"
              @change="onModelChange"
              :disabled="loadingModels"
            >
              <option
                v-for="model in aiModels"
                :key="model.id"
                :value="model.id"
                class="bg-panel text-ink"
              >
                {{ model.name }} ({{ model.context }})
              </option>
            </select>
          </div>

          <!-- Toggle System Prompt Button -->
          <button
            type="button"
            class="flex h-8 items-center gap-1 rounded-lg border border-line bg-elevated px-2 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent shadow-xs"
            :class="{ 'border-accent/50 text-accent bg-accent/10': showSystemPrompt }"
            @click="showSystemPrompt = !showSystemPrompt"
            title="Atur instruksi kustom / System Prompt"
          >
            <span>⚙️</span>
            <span class="hidden sm:inline font-mono text-[11px]">Prompt</span>
          </button>

          <!-- Toggle Full Width Button -->
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent shadow-xs"
            :class="{ 'border-accent/50 text-accent bg-accent/10': isFullWidth }"
            @click="toggleFullWidth"
            :title="isFullWidth ? 'Beralih ke mode terpusat' : 'Beralih ke mode layar penuh'"
          >
            <span>{{ isFullWidth ? '⛶' : '↔️' }}</span>
            <span class="hidden sm:inline font-mono text-[11px]">{{ isFullWidth ? 'Penuh' : 'Lebar' }}</span>
          </button>

          <!-- Start New Chat Button -->
          <button
            type="button"
            class="flex h-8 items-center gap-1 rounded-lg border border-line bg-elevated px-2.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:bg-accent/10 hover:text-accent shadow-xs"
            @click="startNewChat"
            title="Mulai obrolan baru"
          >
            <span>➕</span>
            <span class="hidden sm:inline text-[11px]">Baru</span>
          </button>
        </div>
      </header>

      <!-- Collapsible System Prompt Panel -->
      <div
        v-if="showSystemPrompt"
        class="border-b border-line bg-elevated/80 px-4 py-3 text-xs shrink-0 transition"
      >
        <div class="flex items-center justify-between mb-1.5">
          <span class="font-semibold text-ink flex items-center gap-1.5">
            <span>🧠</span> Instruksi Sistem (System Prompt)
          </span>
          <button
            type="button"
            class="text-muted hover:text-ink text-[11px]"
            @click="showSystemPrompt = false"
          >
            ✕ Tutup
          </button>
        </div>
        <textarea
          v-model="customSystemPrompt"
          rows="2"
          class="w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs text-ink placeholder:text-muted/60 focus:border-accent focus:outline-hidden resize-none font-mono"
          placeholder="Tentukan kepribadian, gaya respons, atau instruksi khusus untuk asisten AI..."
        />
        <div class="mt-1 text-[10px] text-muted">
          Instruksi ini akan disertakan pada setiap percakapan dengan model AI.
        </div>
      </div>

      <!-- Active Model Details Banner -->
      <div
        v-if="activeModelInfo"
        class="border-b border-line/40 bg-panel/40 px-4 py-1.5 text-[11px] text-muted flex items-center justify-between gap-2 shrink-0"
      >
        <div class="flex items-center gap-2 truncate">
          <span class="font-semibold text-accent font-mono">{{ activeModelInfo.name }}</span>
          <span>•</span>
          <span class="truncate">{{ activeModelInfo.description }}</span>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <span
            v-for="cap in activeModelInfo.capabilities.slice(0, 3)"
            :key="cap"
            class="rounded bg-elevated px-1.5 py-0.5 text-[9px] font-mono text-muted border border-line/50"
          >
            {{ cap }}
          </span>
          <span class="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-mono text-accent font-bold border border-accent/20">
            {{ activeModelInfo.context }}
          </span>
        </div>
      </div>

      <!-- Messages Container -->
      <main
        ref="messagesContainer"
        class="flex-1 overflow-y-auto px-4 py-4"
      >
        <div
          class="w-full transition-all duration-200 space-y-4"
          :class="isFullWidth ? 'max-w-none px-1 sm:px-2' : 'max-w-5xl xl:max-w-6xl mx-auto'"
        >
          <!-- Empty State -->
          <div
            v-if="messages.length === 0 && !isLoading"
            class="h-full flex flex-col items-center justify-center max-w-xl mx-auto text-center py-10"
          >
            <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/15 border border-accent/30 text-3xl mb-4 shadow-sm animate-pulse-subtle">
              ✨
            </div>
            <h2 class="text-base font-bold text-ink mb-1">
              Mulai Percakapan dengan AI Chatbot
            </h2>
            <p class="text-xs text-muted mb-6 leading-relaxed">
              Tanyakan apa saja seputar arsitektur, bug fixing, pembuatan skrip, atau refactor kode. Seluruh riwayat obrolan dan penggunaan token disimpan permanen di server.
            </p>

            <!-- Quick Starters -->
            <div class="w-full">
              <p class="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2 font-mono">
                Saran Pertanyaan Cepat:
              </p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                <button
                  v-for="qp in quickPrompts"
                  :key="qp"
                  type="button"
                  class="flex items-center gap-2 rounded-xl border border-line bg-elevated/70 p-3 text-xs text-ink transition hover:border-accent/40 hover:bg-elevated hover:text-accent shadow-2xs group"
                  @click="usePrompt(qp)"
                >
                  <span class="text-base shrink-0 opacity-70 group-hover:opacity-100">💡</span>
                  <span class="line-clamp-2 leading-snug">{{ qp }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Chat Bubbles -->
          <template v-else>
            <div
              v-for="msg in messages"
              :key="msg.id"
              class="flex flex-col gap-1.5 w-full"
              :class="msg.role === 'user' ? 'items-end' : 'items-start'"
            >
              <!-- Message Header / Role Badge -->
              <div class="flex items-center gap-2 text-[10px] font-mono text-muted px-1">
                <span v-if="msg.role === 'user'" class="font-semibold text-ink">Anda</span>
                <span v-else class="flex items-center gap-1 font-semibold text-accent">
                  <span>✨</span>
                  <span>{{ msg.model || 'AI Assistant' }}</span>
                </span>
                <span>•</span>
                <span>{{ msg.timestamp }}</span>

                <!-- Stats (if available) -->
                <span
                  v-if="msg.stats?.totalTokens"
                  class="rounded bg-elevated px-1.5 py-0.2 border border-line text-[9px] text-muted/80"
                  title="Total Tokens"
                >
                  {{ msg.stats.totalTokens }} tokens
                </span>

                <!-- Copy button -->
                <button
                  type="button"
                  class="hover:text-ink transition ml-1"
                  @click="copyMessage(msg.content)"
                  title="Salin seluruh isi pesan"
                >
                  📋
                </button>
              </div>

              <!-- User Bubble -->
              <div
                v-if="msg.role === 'user'"
                class="rounded-2xl rounded-tr-xs bg-elevated border border-line/80 px-4 py-2.5 text-xs text-ink shadow-2xs max-w-2xl whitespace-pre-wrap leading-relaxed select-text"
              >
                {{ msg.content }}
              </div>

              <!-- Assistant Bubble (Markdown Rendered with Streaming Support) -->
              <div
                v-else
                class="w-full rounded-2xl rounded-tl-xs bg-panel border border-line px-5 py-4 shadow-xs overflow-hidden select-text transition"
                :class="{ 'border-accent/50 shadow-[0_0_15px_-3px_rgba(45,212,191,0.2)]': msg.isStreaming }"
              >
                <!-- Connecting State -->
                <div
                  v-if="!msg.content && msg.isStreaming"
                  class="flex items-center gap-2.5 py-1 text-muted text-xs"
                >
                  <span class="flex items-center gap-1.5">
                    <span class="h-2 w-2 rounded-full bg-accent animate-bounce" style="animation-delay: 0ms"></span>
                    <span class="h-2 w-2 rounded-full bg-accent animate-bounce" style="animation-delay: 150ms"></span>
                    <span class="h-2 w-2 rounded-full bg-accent animate-bounce" style="animation-delay: 300ms"></span>
                  </span>
                  <span class="font-mono text-[11px] text-accent">Menghubungkan ke {{ msg.model || selectedAiModel }} & streaming...</span>
                </div>

                <!-- Content with Live Typing Cursor -->
                <div v-else class="relative overflow-x-auto">
                  <MarkdownRenderer :content="msg.content" />
                  <span
                    v-if="msg.isStreaming"
                    class="inline-block w-1.5 h-4 bg-accent animate-pulse ml-1 align-middle"
                    title="Streaming respons..."
                  ></span>
                </div>
              </div>
            </div>
          </template>

          <!-- Error Banner -->
          <div
            v-if="errorMessage"
            class="rounded-xl border border-stopped/30 bg-stopped/10 p-3 text-xs text-stopped flex items-start justify-between gap-3 shadow-sm w-full"
          >
            <div class="flex items-start gap-2 min-w-0">
              <span class="text-base shrink-0">⚠️</span>
              <div>
                <div class="font-bold mb-0.5">Gagal Memproses Permintaan</div>
                <p class="leading-relaxed opacity-90 break-words whitespace-pre-wrap">{{ errorMessage }}</p>
              </div>
            </div>
            <button
              type="button"
              class="rounded p-1 text-stopped/70 hover:text-stopped transition shrink-0"
              @click="errorMessage = null"
              title="Tutup pesan error"
            >
              ✕
            </button>
          </div>
        </div>
      </main>

      <!-- Bottom Input Bar -->
      <footer class="border-t border-line/70 bg-panel/90 backdrop-blur-md p-3 sm:p-4 shrink-0 z-20">
        <div
          class="w-full transition-all duration-200"
          :class="isFullWidth ? 'max-w-none px-1 sm:px-2' : 'max-w-5xl xl:max-w-6xl mx-auto'"
        >
          <form
            class="relative flex items-end gap-2 rounded-2xl border border-line bg-elevated/90 p-2 shadow-sm focus-within:border-accent/60 transition"
            @submit.prevent="sendMessage"
          >
            <!-- Multi-line Auto-Expanding Textarea -->
            <textarea
              ref="textareaRef"
              v-model="inputText"
              rows="1"
              class="flex-1 max-h-[180px] min-h-[40px] resize-none bg-transparent px-2 py-1.5 text-xs text-ink placeholder:text-muted/60 focus:outline-hidden leading-relaxed"
              placeholder="Ketik pertanyaan atau instruksi Anda di sini... (Shift + Enter untuk baris baru)"
              :disabled="isLoading"
              @input="adjustTextareaHeight"
              @keydown="handleKeydown"
            />

            <!-- Action Buttons -->
            <div class="flex items-center gap-1 shrink-0 pb-0.5">
              <!-- Send Button -->
              <button
                type="submit"
                class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-base font-bold text-base transition hover:bg-accent-dim active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                :disabled="!inputText.trim() || isLoading"
                title="Kirim Pesan (Enter)"
              >
                <span v-if="!isLoading">➤</span>
                <span v-else class="h-4 w-4 border-2 border-base border-t-transparent rounded-full animate-spin"></span>
              </button>
            </div>
          </form>

          <!-- Footer Hints -->
          <div class="mt-1.5 flex items-center justify-between px-2 text-[10px] text-muted">
            <span>
              Tekan <kbd class="rounded bg-elevated px-1 py-0.5 font-mono border border-line text-[9px] text-ink">Enter</kbd> untuk kirim,
              <kbd class="rounded bg-elevated px-1 py-0.5 font-mono border border-line text-[9px] text-ink">Shift + Enter</kbd> untuk baris baru.
            </span>
            <span class="font-mono hidden sm:inline">
              Model: {{ activeModelInfo?.name || selectedAiModel }}
            </span>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>
