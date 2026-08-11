<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import { useProjectStore } from "../stores/project.store";
import ProjectExplorer from "../components/project/ProjectExplorer.vue";
import ChatSessionSidebar from "../components/ai/ChatSessionSidebar.vue";
import AgentActivityLog from "../components/ai/AgentActivityLog.vue";
import TerminalOutputBox from "../components/ai/TerminalOutputBox.vue";
import DiffViewerModal from "../components/ai/DiffViewerModal.vue";
import MarkdownRenderer from "../components/ui/MarkdownRenderer.vue";
import IconButton from "../components/ui/IconButton.vue";
import StatusDot from "../components/project/StatusDot.vue";
import type {
  AgentStep,
  ChatSessionMeta,
  CommandExecutionResult,
  FileDiffInfo,
  ProjectFileData,
} from "../types/project";

interface AgentChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  ts?: number;
  steps?: AgentStep[];
  modifiedFiles?: FileDiffInfo[];
  commandOutputs?: CommandExecutionResult[];
}

const store = useProjectStore();
const { selected, selectedId } = storeToRefs(store);

const showExplorer = ref(false);
const showSessions = ref(true);
const sessions = ref<ChatSessionMeta[]>([]);
const activeSessionId = ref<string | null>(null);
const sessionsLoading = ref(false);

const messages = ref<AgentChatMessage[]>([]);
const draft = ref("");
const sending = ref(false);
const historyLoading = ref(false);
const attachedFiles = ref<string[]>([]);
const activeFile = ref<ProjectFileData | null>(null);
const activeFileLoading = ref(false);
const activeDiff = ref<FileDiffInfo | null>(null);

const status = ref<{
  available: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  hint: string;
} | null>(null);
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
  } catch (err) {
    statusError.value =
      err instanceof Error ? err.message : "Gagal cek status AI";
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
    messages.value = data.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      ts: m.ts,
      steps: m.steps,
      modifiedFiles: m.modifiedFiles,
      commandOutputs: m.commandOutputs,
    }));
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

const onSelectFile = async (filePath: string) => {
  if (!selectedId.value) return;
  activeFileLoading.value = true;
  try {
    activeFile.value = await api.readProjectFile(selectedId.value, filePath);
  } catch (err) {
    notify.error("Gagal", err instanceof Error ? err.message : "Gagal membaca file");
  } finally {
    activeFileLoading.value = false;
  }
};

const onToggleAttach = (filePath: string) => {
  const idx = attachedFiles.value.indexOf(filePath);
  if (idx >= 0) {
    attachedFiles.value.splice(idx, 1);
  } else {
    attachedFiles.value.push(filePath);
  }
};

const removeAttached = (filePath: string) => {
  attachedFiles.value = attachedFiles.value.filter((f) => f !== filePath);
};

const sendAgentPrompt = async (preset?: string) => {
  const text = (preset ?? draft.value).trim();
  if (!text || sending.value || !selectedId.value) return;

  const projectId = selectedId.value;
  const currentSessionId = activeSessionId.value;
  const now = Date.now();

  const userMsg: AgentChatMessage = {
    id: `u-${now}`,
    role: "user",
    content: text,
    ts: now,
  };
  messages.value.push(userMsg);

  if (!preset) draft.value = "";
  sending.value = true;
  await scrollToBottom();

  const historyPayload = messages.value
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const assistantMsg = ref<AgentChatMessage>({
    id: `a-${Date.now()}`,
    role: "assistant",
    content: "",
    ts: Date.now(),
    steps: [],
    modifiedFiles: [],
    commandOutputs: [],
  });
  messages.value.push(assistantMsg.value);

  try {
    const res = await api.aiStreamAgentRun(
      projectId,
      text,
      attachedFiles.value,
      historyPayload,
      {
        onStep: (step) => {
          if (!assistantMsg.value.steps) assistantMsg.value.steps = [];
          const existingIdx = assistantMsg.value.steps.findIndex(
            (s) => s.id === step.id
          );
          if (existingIdx >= 0) {
            assistantMsg.value.steps[existingIdx] = step;
          } else {
            assistantMsg.value.steps.push(step);
          }
          void scrollToBottom();
        },
        onChunk: (chunkText) => {
          assistantMsg.value.content += chunkText;
          void scrollToBottom();
        },
      },
      currentSessionId || undefined
    );

    if (res) {
      if (res.reply && !assistantMsg.value.content) {
        assistantMsg.value.content = res.reply;
      }
      if (res.steps) {
        assistantMsg.value.steps = res.steps;
      }
      if (res.modifiedFiles) {
        assistantMsg.value.modifiedFiles = res.modifiedFiles;
      }
      if (res.commandOutputs) {
        assistantMsg.value.commandOutputs = res.commandOutputs;
      }
    }
    // Refresh session title / metadata list after response
    await loadSessions(projectId);
  } catch (err) {
    if (!assistantMsg.value.content) {
      messages.value = messages.value.filter(
        (m) => m.id !== assistantMsg.value.id
      );
      messages.value.push({
        id: `e-${Date.now()}`,
        role: "system",
        content: err instanceof Error ? err.message : "Gagal mengeksekusi agen AI",
      });
    }
  } finally {
    sending.value = false;
    await scrollToBottom();
  }
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendAgentPrompt();
  }
};

const clearChat = async () => {
  if (!selectedId.value || sending.value || !activeSessionId.value) return;
  messages.value = [];
  try {
    await api.aiClearHistory(selectedId.value, activeSessionId.value);
    await loadSessions(selectedId.value);
  } catch {
    // ignore
  }
};

watch(
  selectedId,
  async (id) => {
    attachedFiles.value = [];
    activeFile.value = null;
    if (id) {
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
      <!-- Sessions List Sidebar -->
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

      <!-- Project Files Explorer Panel -->
      <ProjectExplorer
        v-if="showExplorer"
        :project-id="selectedId"
        :attached-files="attachedFiles"
        @select-file="onSelectFile"
        @toggle-attach="onToggleAttach"
      />

      <!-- Main AI Agent Workspace -->
      <main class="flex min-w-0 flex-1 flex-col bg-base">
        <!-- Header -->
        <header class="border-b border-line bg-panel px-6 py-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2.5">
                <StatusDot :status="selected.status" />
                <h2 class="truncate text-xl font-bold text-ink">{{ selected.name }}</h2>
                <span
                  class="rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] font-semibold text-accent"
                >
                  AI Project Agent
                </span>
              </div>
              <p class="mt-1 text-xs text-muted">
                Workspace AI Agent terhubung dengan konteks project ini.
              </p>
            </div>

            <!-- Action Buttons -->
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-elevated/80 flex items-center gap-1.5"
                :title="showSessions ? 'Sembunyikan Daftar Chat' : 'Tampilkan Daftar Chat'"
                @click="showSessions = !showSessions"
              >
                <span>💬 {{ showSessions ? 'Hide Sessions' : 'Chat History' }}</span>
              </button>
              <button
                type="button"
                class="rounded-md border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-elevated/80 flex items-center gap-1.5"
                :title="showExplorer ? 'Sembunyikan Project Explorer' : 'Tampilkan Project Explorer'"
                @click="showExplorer = !showExplorer"
              >
                <span>📁 {{ showExplorer ? 'Hide Files' : 'Project Files' }}</span>
              </button>
              <IconButton
                label="Refresh Status"
                variant="ghost"
                :disabled="sending"
                @click="loadStatus"
              />
              <IconButton
                label="Clear Chat"
                variant="ghost"
                :disabled="sending || historyLoading || messages.length === 0"
                @click="clearChat"
              />
            </div>
          </div>

          <!-- Ollama Status Bar -->
          <div
            v-if="statusError"
            class="mt-3 rounded-md border border-stopped/40 bg-stopped/10 px-3 py-2 text-xs text-stopped"
          >
            {{ statusError }}
          </div>
          <div
            v-else-if="status"
            class="mt-3 rounded-md border border-line bg-elevated/60 px-3 py-2 text-xs text-muted flex items-center justify-between"
          >
            <div>
              <span :class="status.available ? 'text-accent' : 'text-stopped'" class="font-semibold">
                {{ status.available ? "Ollama Ready" : "Ollama Unavailable" }}
              </span>
              <span> · {{ status.model }}</span>
            </div>
            <span class="text-[10px] text-muted">{{ status.hint }}</span>
          </div>

          <!-- Attached Files Pills -->
          <div v-if="attachedFiles.length > 0" class="mt-3 flex flex-wrap items-center gap-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wider text-muted mr-1">
              Context Files ({{ attachedFiles.length }}):
            </span>
            <span
              v-for="file in attachedFiles"
              :key="file"
              class="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-2.5 py-0.5 text-xs text-ink"
            >
              📄 <span class="font-mono text-[11px] truncate max-w-xs">{{ file }}</span>
              <button
                type="button"
                class="hover:text-stopped font-bold"
                title="Hapus file ini dari konteks"
                @click="removeAttached(file)"
              >
                ✕
              </button>
            </span>
          </div>

          <!-- Quick Presets -->
          <div class="mt-3 flex flex-wrap gap-2">
            <IconButton
              label="Analisis Arsitektur Project"
              variant="ghost"
              :disabled="sending"
              @click="sendAgentPrompt('Analisis arsitektur dan struktur project ini secara terperinci.')"
            />
            <IconButton
              label="Cek Potensi Error & Log"
              variant="ghost"
              :disabled="sending"
              @click="sendAgentPrompt('Periksa log dan git status, jelaskan potensi error atau warning terpenting.')"
            />
            <IconButton
              label="Jelaskan Flow Kode"
              variant="ghost"
              :disabled="sending"
              @click="sendAgentPrompt('Jelaskan alur data dan flow kode utama dari project ini.')"
            />
          </div>
        </header>

        <!-- Active File Preview Drawer -->
        <div
          v-if="activeFile"
          class="border-b border-line bg-panel/90 px-6 py-3 space-y-2 text-xs"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-ink font-mono">📄 {{ activeFile.path }}</span>
              <span class="text-[10px] text-muted">({{ activeFile.size }} bytes)</span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded bg-accent/20 px-2 py-0.5 text-accent text-[11px] font-medium hover:bg-accent/30"
                @click="onToggleAttach(activeFile.path)"
              >
                {{ attachedFiles.includes(activeFile.path) ? "✓ Context Attached" : "+ Attach to Context" }}
              </button>
              <button
                type="button"
                class="text-muted hover:text-ink font-bold text-xs"
                @click="activeFile = null"
              >
                ✕ Close Preview
              </button>
            </div>
          </div>
          <pre
            class="max-h-40 overflow-auto rounded border border-line bg-base p-3 font-mono text-[11px] text-ink/90 whitespace-pre-wrap"
          >{{ activeFile.content }}</pre>
        </div>

        <!-- Chat / Agent Execution Stream -->
        <div ref="listRef" class="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <p v-if="historyLoading" class="text-sm text-muted">Memuat percakapan...</p>
          <p v-else-if="messages.length === 0" class="text-sm text-muted">
            Workspace AI Project Agent untuk <span class="font-semibold text-ink">{{ selected.name }}</span> siap. Berikan instruksi task atau klik <span class="font-mono text-accent">📁 Project Files</span> untuk memilih konteks file.
          </p>

          <div
            v-for="msg in messages"
            :key="msg.id"
            class="flex flex-col"
            :class="{
              'items-end': msg.role === 'user',
              'items-start': msg.role !== 'user',
            }"
          >
            <!-- User Prompt Bubble -->
            <div
              v-if="msg.role === 'user'"
              class="max-w-[85%] whitespace-pre-wrap rounded-lg bg-accent/15 px-4 py-2.5 text-sm text-ink leading-relaxed"
            >
              {{ msg.content }}
            </div>

            <!-- System Error Bubble -->
            <div
              v-else-if="msg.role === 'system'"
              class="max-w-[85%] rounded-lg border border-stopped/40 bg-stopped/10 px-4 py-2.5 text-sm text-stopped leading-relaxed"
            >
              {{ msg.content }}
            </div>

            <!-- Assistant Response Bubble & Agent Tools Feedback -->
            <div v-else class="w-full max-w-[92%] space-y-2">
              <!-- Agent Activity Log Component -->
              <AgentActivityLog v-if="msg.steps" :steps="msg.steps" />

              <!-- Modified Files Alert -->
              <div
                v-if="msg.modifiedFiles && msg.modifiedFiles.length > 0"
                class="rounded-md border border-accent/40 bg-accent/10 p-3 text-xs text-ink space-y-1"
              >
                <span class="font-semibold text-accent">✓ File Project Diperbarui AI:</span>
                <ul class="list-disc list-inside space-y-1 font-mono text-[11px]">
                  <li v-for="file in msg.modifiedFiles" :key="file.path" class="flex items-center justify-between">
                    <span>{{ file.path }} ({{ file.isNew ? "New" : "Modified" }})</span>
                    <button
                      type="button"
                      class="text-accent underline hover:text-accent/80 font-sans"
                      @click="activeDiff = file"
                    >
                      Lihat Diff
                    </button>
                  </li>
                </ul>
              </div>

              <!-- Terminal Output Box Component -->
              <TerminalOutputBox v-if="msg.commandOutputs" :outputs="msg.commandOutputs" />

              <!-- Main Text Answer (Markdown Rendered) -->
              <div class="rounded-lg border border-line bg-panel p-4 text-sm text-ink leading-relaxed">
                <MarkdownRenderer :content="msg.content" />
              </div>
            </div>
          </div>

          <div v-if="sending" class="flex items-center gap-2 text-sm text-muted animate-pulse">
            <span>●</span>
            <span>AI Agent sedang membaca konteks project dan memproses instruksi...</span>
          </div>
        </div>

        <!-- Prompt Input Form -->
        <form
          class="border-t border-line bg-panel px-6 py-4"
          @submit.prevent="sendAgentPrompt()"
        >
          <div class="flex items-end gap-3">
            <textarea
              v-model="draft"
              rows="3"
              class="min-h-[3rem] flex-1 resize-y rounded-md border border-line bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              :placeholder="`Beri instruksi AI Agent untuk ${selected.name}... (Enter kirim)`"
              :disabled="sending"
              @keydown="onKeydown"
            />
            <IconButton
              label="Kirim Task"
              variant="accent"
              :disabled="sending || !draft.trim()"
              @click="sendAgentPrompt()"
            />
          </div>
        </form>
      </main>
    </template>

    <!-- Empty / No Project Selected Banner -->
    <div
      v-else
      class="flex flex-1 items-center justify-center px-6 text-sm text-muted"
    >
      Pilih project di sidebar kiri untuk membuka AI Agent Workspace.
    </div>

    <!-- Diff Viewer Modal -->
    <DiffViewerModal :diff="activeDiff" @close="activeDiff = null" />
  </div>
</template>
