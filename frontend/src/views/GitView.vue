<script setup lang="ts">
import { ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../services/api";
import { useProjectStore } from "../stores/project.store";
import ProjectGitPanel from "../components/project/ProjectGitPanel.vue";
import IconButton from "../components/ui/IconButton.vue";
import StatusDot from "../components/project/StatusDot.vue";

const store = useProjectStore();
const {
  selected,
  selectedId,
  gitLoading,
  gitStatus,
  gitMessage,
  availableEditors,
} = storeToRefs(store);

const generatingCommit = ref(false);
const generateError = ref<string | null>(null);
const suggestedCommitMessage = ref<string | null>(null);

watch(
  selectedId,
  (id) => {
    generateError.value = null;
    suggestedCommitMessage.value = null;
    if (id) void store.fetchGitStatus(id);
  },
  { immediate: true },
);

const generateCommitMessage = async (model?: string) => {
  if (!selectedId.value || generatingCommit.value) return;
  generatingCommit.value = true;
  generateError.value = null;
  suggestedCommitMessage.value = null;
  try {
    const data = await api.aiCommitMessage(selectedId.value, model);
    suggestedCommitMessage.value = data.message;
  } catch (error) {
    generateError.value =
      error instanceof Error ? error.message : "Gagal generate commit message";
  } finally {
    generatingCommit.value = false;
  }
};
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col bg-base">
    <template v-if="selected">
      <header class="border-b border-line bg-panel px-6 py-4">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <StatusDot :status="selected.status" />
              <h2 class="truncate text-xl font-semibold">{{ selected.name }}</h2>
              <span
                class="rounded border border-line bg-elevated px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted"
              >
                Git
              </span>
            </div>
            <p class="mt-1 truncate font-mono text-xs text-muted">
              {{ selected.path }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <IconButton
              label="Refresh"
              variant="ghost"
              :disabled="gitLoading"
              @click="store.fetchGitStatus()"
            />
            <IconButton
              label="Open Folder"
              variant="ghost"
              @click="store.openFolder()"
            />
            <IconButton
              v-for="editor in availableEditors"
              :key="editor.id"
              :label="editor.label"
              variant="ghost"
              @click="store.openEditor(editor.id)"
            />
          </div>
        </div>
      </header>

      <ProjectGitPanel
        :project-id="selectedId || undefined"
        :git="gitStatus"
        :busy="gitLoading || generatingCommit"
        :message="gitMessage"
        :generating-commit="generatingCommit"
        :generate-error="generateError"
        :suggested-commit-message="suggestedCommitMessage"
        @refresh="store.fetchGitStatus()"
        @create-branch="store.createBranch"
        @checkout="store.checkout"
        @add="store.gitAdd()"
        @commit="store.gitCommit"
        @pull="store.gitPull()"
        @push="store.gitPush()"
        @generate-commit-message="generateCommitMessage"
      />
    </template>
    <div
      v-else
      class="flex flex-1 items-center justify-center px-6 text-sm text-muted"
    >
      Pilih project di sidebar untuk mengelola Git.
    </div>
  </main>
</template>
