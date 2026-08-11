<script setup lang="ts">
import { ref } from "vue";
import type { ChatSessionMeta } from "../../types/project";

const props = defineProps<{
  sessions: ChatSessionMeta[];
  activeSessionId: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", sessionId: string): void;
  (e: "create"): void;
  (e: "delete", sessionId: string): void;
  (e: "rename", payload: { sessionId: string; title: string }): void;
}>();

const editingId = ref<string | null>(null);
const editingTitle = ref("");

const startRename = (session: ChatSessionMeta) => {
  editingId.value = session.id;
  editingTitle.value = session.title;
};

const saveRename = (sessionId: string) => {
  if (editingTitle.value.trim()) {
    emit("rename", { sessionId, title: editingTitle.value.trim() });
  }
  editingId.value = null;
};

const cancelRename = () => {
  editingId.value = null;
};

const formatDate = (ts: number) => {
  const date = new Date(ts);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};
</script>

<template>
  <div class="flex h-full w-64 flex-col border-r border-line bg-panel">
    <!-- Header with + New Chat Button -->
    <div class="border-b border-line p-3">
      <button
        type="button"
        class="flex w-full items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition hover:bg-accent/25 disabled:opacity-50"
        :disabled="loading"
        @click="emit('create')"
      >
        <span>+</span>
        <span>New Chat</span>
      </button>
    </div>

    <!-- Sessions List -->
    <div class="flex-1 space-y-1 overflow-y-auto p-2">
      <div v-if="loading" class="px-3 py-2 text-xs text-muted">
        Memuat percakapan...
      </div>
      <div
        v-else-if="sessions.length === 0"
        class="px-3 py-4 text-center text-xs text-muted"
      >
        Belum ada riwayat percakapan. Klik "+ New Chat" untuk memulai.
      </div>
      <div
        v-for="sess in sessions"
        :key="sess.id"
        class="group relative flex items-center justify-between rounded-md px-3 py-2 text-xs transition cursor-pointer"
        :class="
          sess.id === activeSessionId
            ? 'bg-elevated text-ink font-medium border border-line'
            : 'text-muted hover:bg-elevated/50 hover:text-ink'
        "
        @click="emit('select', sess.id)"
      >
        <div class="flex flex-1 min-w-0 flex-col">
          <!-- Inline Edit Title -->
          <div v-if="editingId === sess.id" class="flex items-center gap-1" @click.stop>
            <input
              v-model="editingTitle"
              type="text"
              class="w-full rounded border border-accent bg-base px-1.5 py-0.5 text-xs text-ink outline-none"
              @keydown.enter="saveRename(sess.id)"
              @keydown.esc="cancelRename"
              @blur="saveRename(sess.id)"
            />
          </div>
          <!-- Normal Title & Date -->
          <template v-else>
            <span class="truncate pr-2 font-medium" :title="sess.title">
              💬 {{ sess.title }}
            </span>
            <span class="mt-0.5 text-[10px] text-muted/70">
              {{ formatDate(sess.updatedAt) }} · {{ sess.messageCount }} pesan
            </span>
          </template>
        </div>

        <!-- Action Hover Icons -->
        <div
          v-if="editingId !== sess.id"
          class="hidden group-hover:flex items-center gap-1.5 text-muted hover:text-ink"
          @click.stop
        >
          <button
            type="button"
            class="hover:text-accent font-bold"
            title="Ubah judul"
            @click="startRename(sess)"
          >
            ✏️
          </button>
          <button
            type="button"
            class="hover:text-stopped font-bold"
            title="Hapus percakapan"
            @click="emit('delete', sess.id)"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
