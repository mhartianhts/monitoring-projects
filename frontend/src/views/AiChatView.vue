<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import { useProjectStore } from "../stores/project.store";
import ChatSessionSidebar from "../components/ai/ChatSessionSidebar.vue";
import IconButton from "../components/ui/IconButton.vue";
import StatusDot from "../components/project/StatusDot.vue";
import MarkdownRenderer from "../components/ui/MarkdownRenderer.vue";
import type { ChatSessionMeta } from "../types/project";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts?: number;
}

interface AiStatus {
  available: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  models: string[];
  timeoutMs: number;
  hint: string;
}

const store = useProjectStore();
const { selected, selectedId, logs, gitStatus } = storeToRefs(store);

const showSessions = ref(true);
const sessions = ref<ChatSessionMeta[]>([]);
const activeSessionId = ref<string | null>(null);
const sessionsLoading = ref(false);

const messages = ref<ChatMessage[]>([]);
const draft = ref("");
const sending = ref(false);
const historyLoading = ref(false);
const status = ref<AiStatus | null>(null);
const statusError = ref("");
const listRef = ref<HTMLElement | null>(null);

const scrollToBottom = async () => {
  await nextTick();
  const el = listRef.value;
  if (el) el.scrollTop = el.scrollHeight;
};

const loadStatus = async () => {
  statusError.value = "";
  try {
    status.value = await api.aiStatus();
  } catch (error) {
    statusError.value =
      error instanceof Error ? error.message : "Gagal cek status AI";
  }
};

const loadSessions = async (projectId: string) => {
  sessionsLoading.value = true;
  try {
    const res = await api.aiListSessions(projectId);
    sessions.value = res.sessions;
    activeSessionId.value = res.activeSessionId;
  } catch {
    sessions.value = [];
    activeSessionId.value = null;
  } finally {
    sessionsLoading.value = false;
  }
};

const loadHistory = async (projectId: string | null, sessionId: string | null = null) => {
  if (!projectId) {
    messages.value = [];
    return;
  }
  historyLoading.value = true;
  try {
    const data = await api.aiGetHistory(projectId, sessionId || undefined);
    activeSessionId.value = data.sessionId;
    messages.value = data.messages;
  } catch {
    messages.value = [];
  } finally {
    historyLoading.value = false;
    await scrollToBottom();
  }
};

const handleSelectSession = async (sessionId: string) => {
  if (!selectedId.value || sending.value) return;
  activeSessionId.value = sessionId;
  await loadHistory(selectedId.value, sessionId);
};

const handleCreateSession = async () => {
  if (!selectedId.value || sending.value) return;
  try {
    const res = await api.aiCreateSession(selectedId.value);
    activeSessionId.value = res.session.id;
    await loadSessions(selectedId.value);
    await loadHistory(selectedId.value, res.session.id);
  } catch (err) {
    notify.error("Gagal", err instanceof Error ? err.message : "Gagal membuat sesi chat");
  }
};

const handleDeleteSession = async (sessionId: string) => {
  if (!selectedId.value || sending.value) return;
  const confirmed = await notify.confirm("Hapus Sesi", "Apakah Anda yakin ingin menghapus sesi percakapan ini?", "Ya, Hapus", "Batal");
  if (!confirmed) return;
  try {
    const res = await api.aiDeleteSession(selectedId.value, sessionId);
    sessions.value = res.sessions;
    activeSessionId.value = res.activeSessionId;
    await loadHistory(selectedId.value, res.activeSessionId);
    notify.toast("Sesi berhasil dihapus", "success");
  } catch (err) {
    notify.error("Gagal", err instanceof Error ? err.message : "Gagal menghapus sesi");
  }
};

const handleRenameSession = async ({ sessionId, title }: { sessionId: string; title: string }) => {
  if (!selectedId.value) return;
  try {
    const res = await api.aiRenameSession(selectedId.value, sessionId, title);
    sessions.value = res.sessions;
    notify.toast("Nama sesi diperbarui", "success");
  } catch (err) {
    notify.error("Gagal", err instanceof Error ? err.message : "Gagal mengubah nama sesi");
  }
};

const contextHint = computed(() => {
  if (!selected.value) return "Pilih project di sidebar dulu.";
  const logCount = logs.value.length;
  const gitPart = !gitStatus.value
    ? "git belum dimuat"
    : gitStatus.value.isRepo
      ? `git ${gitStatus.value.branch}${gitStatus.value.dirty ? " · dirty" : ""}`
      : "bukan git repo";
  return `${logCount} log di buffer · ${gitPart} · multi-session ChatGPT style`;
});

const send = async (preset?: string) => {
  const text = (preset ?? draft.value).trim();
  if (!text || sending.value || !selectedId.value) return;

  const currentSessionId = activeSessionId.value;

  const history = messages.value
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

  const pendingUser: ChatMessage = {
    id: `u-${Date.now()}`,
    role: "user",
    content: text,
    ts: Date.now(),
  };
  messages.value.push(pendingUser);
  if (!preset) draft.value = "";
  sending.value = true;
  await scrollToBottom();

  const assistantMsg = ref<ChatMessage>({
    id: `a-${Date.now()}`,
    role: "assistant",
    content: "",
    ts: Date.now(),
  });
  messages.value.push(assistantMsg.value);

  try {
    const data = await api.aiStreamChat(
      selectedId.value,
      text,
      history,
      (chunkText) => {
        assistantMsg.value.content += chunkText;
        void scrollToBottom();
      },
      currentSessionId || undefined
    );
    const resData = data as { history?: { messages: ChatMessage[] } } | null;
    if (resData?.history?.messages?.length) {
      messages.value = resData.history.messages;
    }
    await loadSessions(selectedId.value);
  } catch (error) {
    if (!assistantMsg.value.content) {
      messages.value = messages.value.filter(
        (msg) => msg.id !== pendingUser.id && msg.id !== assistantMsg.value.id
      );
      messages.value.push({
        id: `e-${Date.now()}`,
        role: "system",
        content: error instanceof Error ? error.message : "Gagal mengirim pesan",
      });
    }
  } finally {
    sending.value = false;
    await scrollToBottom();
  }
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void send();
  }
};

const clearChat = async () => {
  if (!selectedId.value || sending.value || !activeSessionId.value) return;
  const projectId = selectedId.value;
  messages.value = [];
  try {
    await api.aiClearHistory(projectId, activeSessionId.value);
    await loadSessions(projectId);
  } catch {
    // ignore
  }
};

watch(
  selectedId,
  async (id) => {
    if (id) {
      void store.fetchGitStatus(id);
      await loadSessions(id);
      await loadHistory(id, activeSessionId.value);
    } else {
      sessions.value = [];
      activeSessionId.value = null;
      messages.value = [];
    }
  },
  { immediate: true }
);

onMounted(() => {
  void loadStatus();
});
</script>

<template>
  <div class="flex flex-1 min-w-0 bg-base h-full">
    <template v-if="selected">
      <!-- Chat Sessions Sidebar -->
      <ChatSessionSidebar
        v-if="showSessions"
        :sessions="sessions"
        :active-session-id="activeSessionId"
        :loading="sessionsLoading"
        @select="handleSelectSession"
        @create="handleCreateSession"
        @delete="handleDeleteSession"
        @rename="handleRenameSession"
      />

      <main class="flex min-w-0 flex-1 flex-col bg-base">
        <header class="border-b border-line bg-panel px-6 py-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <StatusDot :status="selected.status" />
                <h2 class="truncate text-xl font-semibold">{{ selected.name }}</h2>
                <span
                  class="rounded border border-line bg-elevated px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted"
                >
                  AI · Ollama
                </span>
              </div>
              <p class="mt-1 text-sm text-muted">
                Multi-session AI chat per project. Kelola beberapa percakapan terpisah (ChatGPT Style).
              </p>
              <p class="mt-1 font-mono text-xs text-muted">{{ contextHint }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-elevated/80 flex items-center gap-1.5"
                :title="showSessions ? 'Sembunyikan Daftar Chat' : 'Tampilkan Daftar Chat'"
                @click="showSessions = !showSessions"
              >
                <span>💬 {{ showSessions ? 'Hide Sessions' : 'Chat History' }}</span>
              </button>
              <IconButton
                label="Refresh Status"
                variant="ghost"
                :disabled="sending"
                @click="loadStatus"
              />
              <IconButton
                label="Clear"
                variant="ghost"
                :disabled="sending || historyLoading || messages.length === 0"
                @click="clearChat"
              />
            </div>
          </div>

          <div
            v-if="statusError"
            class="mt-3 rounded-md border border-stopped/40 bg-stopped/10 px-3 py-2 text-sm text-stopped"
          >
            {{ statusError }}
          </div>
          <div
            v-else-if="status"
            class="mt-3 rounded-md border border-line bg-elevated/60 px-3 py-2 text-xs text-muted"
          >
            <span :class="status.available ? 'text-accent' : 'text-stopped'">
              {{ status.available ? "Ollama ready" : "Ollama unavailable" }}
            </span>
            <span> · {{ status.model }}</span>
            <span> · timeout: {{ status.timeoutMs > 0 ? `${Math.round(status.timeoutMs / 1000)}s` : 'unlimited' }}</span>
            <span class="mt-1 block">{{ status.hint }}</span>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <IconButton
              label="Jelaskan error log"
              variant="ghost"
              :disabled="sending"
              @click="
                send(
                  'Baca recent logs project ini. Jelaskan error/warning terpenting dan saran perbaikannya.',
                )
              "
            />
            <IconButton
              label="Ringkas status"
              variant="ghost"
              :disabled="sending"
              @click="
                send(
                  'Ringkas status project ini: running/stopped, port, git branch, dan apakah ada isu dari log.',
                )
              "
            />
            <IconButton
              label="Draft commit message"
              variant="ghost"
              :disabled="sending"
              @click="
                send(
                  'Berdasarkan git status dan diff, buatkan satu commit message singkat dalam Bahasa Indonesia. Balas hanya isi commit message-nya.',
                )
              "
            />
          </div>
        </header>

        <div ref="listRef" class="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <p v-if="historyLoading" class="text-sm text-muted">
            Memuat percakapan...
          </p>
          <p v-else-if="messages.length === 0" class="text-sm text-muted">
            Chat khusus untuk
            <span class="text-ink font-semibold">{{ selected.name }}</span>. Klik <span class="text-accent font-semibold">+ New Chat</span> untuk membuat percakapan baru.
          </p>

          <div
            v-for="msg in messages"
            :key="msg.id"
            class="flex"
            :class="{
              'justify-end': msg.role === 'user',
              'justify-start': msg.role !== 'user',
            }"
          >
            <div
              class="max-w-[85%] rounded-md px-3 py-2 text-sm leading-relaxed"
              :class="{
                'bg-accent/15 text-ink whitespace-pre-wrap': msg.role === 'user',
                'border border-line bg-panel text-ink': msg.role === 'assistant',
                'border border-stopped/40 bg-stopped/10 text-stopped whitespace-pre-wrap':
                  msg.role === 'system',
              }"
            >
              <MarkdownRenderer v-if="msg.role === 'assistant'" :content="msg.content" />
              <template v-else>{{ msg.content }}</template>
            </div>
          </div>

          <p v-if="sending" class="text-sm text-muted animate-pulse">
            Ollama membaca konteks project lalu menjawab...
          </p>
        </div>

        <form
          class="border-t border-line bg-panel px-6 py-4"
          @submit.prevent="send()"
        >
          <div class="flex items-end gap-3">
            <textarea
              v-model="draft"
              rows="2"
              class="min-h-[2.75rem] flex-1 resize-y rounded-md border border-line bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              :placeholder="`Tanya tentang ${selected.name}... (Enter kirim)`"
              :disabled="sending"
              @keydown="onKeydown"
            />
            <IconButton
              label="Kirim"
              variant="accent"
              :disabled="sending || !draft.trim()"
              @click="send()"
            />
          </div>
        </form>
      </main>
    </template>

    <div
      v-else
      class="flex flex-1 items-center justify-center px-6 text-sm text-muted"
    >
      Pilih project di sidebar untuk membuka AI chat project tersebut.
    </div>
  </div>
</template>
