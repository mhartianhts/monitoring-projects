<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  GitStatus,
  TokenPortalModel,
} from "../../types/project";
import { api } from "../../services/api";
import IconButton from "../ui/IconButton.vue";

interface Props {
  projectId?: string;
  git: GitStatus | null;
  busy: boolean;
  message: string | null;
  generatingCommit?: boolean;
  generateError?: string | null;
  suggestedCommitMessage?: string | null;
}

interface ChangedFile {
  status: string;
  path: string;
  label: string;
  tone: string;
  ext: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  refresh: [];
  createBranch: [name: string];
  checkout: [name: string];
  add: [];
  commit: [message: string];
  pull: [];
  push: [];
  generateCommitMessage: [model?: string];
}>();

const newBranch = ref("");
const selectedBranch = ref("");
const commitMessage = ref("");

// TokenPortal AI Model Selection for Commit Messages
const selectedAiModel = ref(
  localStorage.getItem("tokenportal_ai_model") || "kimi-k27-code",
);
const aiModels = ref<TokenPortalModel[]>([]);
const loadingModels = ref(false);

const activeModelInfo = computed(() => {
  return aiModels.value.find((m) => m.id === selectedAiModel.value) || null;
});

const fetchAiModels = async () => {
  try {
    loadingModels.value = true;
    const res = await api.aiModels();
    if (res?.models?.length) {
      aiModels.value = res.models;
      if (!aiModels.value.some((m) => m.id === selectedAiModel.value)) {
        selectedAiModel.value =
          res.defaultModel || aiModels.value[0]?.id || "kimi-k27-code";
      }
    }
  } catch {
    // Keep default fallback models if fetch fails
  } finally {
    loadingModels.value = false;
  }
};

watch(selectedAiModel, (newModel) => {
  if (newModel) {
    localStorage.setItem("tokenportal_ai_model", newModel);
  }
});

onMounted(() => {
  void fetchAiModels();
});

watch(
  () => props.git?.branch,
  (branch) => {
    if (branch) selectedBranch.value = branch;
  },
  { immediate: true },
);

watch(
  () => props.message,
  (message) => {
    if (message?.toLowerCase().includes("commit")) {
      commitMessage.value = "";
    }
  },
);

watch(
  () => props.suggestedCommitMessage,
  (value) => {
    if (typeof value === "string" && value.trim()) {
      commitMessage.value = value.trim();
    }
  },
);

const canUseGit = computed(
  () => Boolean(props.git?.isRepo) && !props.busy,
);

const changedFiles = computed<ChangedFile[]>(() => {
  const files = props.git?.changedFiles || [];
  return files.map((line) => {
    const trimmed = line.trim();
    const rawStatus = trimmed.slice(0, 2).trim();
    const filePath = trimmed.slice(2).trim();
    const ext = filePath.includes(".")
      ? filePath.split(".").pop()?.toLowerCase() || ""
      : "";

    let status = rawStatus;
    let label = "Modified";
    let tone =
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";

    if (rawStatus.includes("?") || rawStatus === "A") {
      status = "A";
      label = "Untracked / Added";
      tone =
        "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    } else if (rawStatus.includes("D")) {
      status = "D";
      label = "Deleted";
      tone =
        "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
    } else if (rawStatus.includes("R")) {
      status = "R";
      label = "Renamed";
      tone =
        "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
    }

    return {
      status,
      path: filePath,
      label,
      tone,
      ext,
    };
  });
});

const fileFilter = ref("");
const filteredFiles = computed(() => {
  if (!fileFilter.value.trim()) return changedFiles.value;
  const q = fileFilter.value.toLowerCase();
  return changedFiles.value.filter((f) => f.path.toLowerCase().includes(q));
});

const onCheckout = () => {
  if (
    !selectedBranch.value ||
    selectedBranch.value === props.git?.branch
  )
    return;
  emit("checkout", selectedBranch.value);
};

const onCreateBranch = () => {
  const name = newBranch.value.trim();
  if (!name) return;
  emit("createBranch", name);
  newBranch.value = "";
};

const onCommit = () => {
  const msg = commitMessage.value.trim();
  if (!msg) return;
  emit("commit", msg);
};
</script>

<template>
  <div class="min-h-0 flex-1 overflow-auto p-6">
    <div class="mx-auto max-w-6xl space-y-6">
      <!-- Non-Git Repo Warning -->
      <div
        v-if="!git?.isRepo"
        class="rounded-xl border border-line bg-panel p-8 text-center shadow-xs"
      >
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-elevated text-2xl">
          🌿
        </div>
        <h3 class="text-base font-semibold text-ink">Direktori Bukan Git Repository</h3>
        <p class="mt-1 text-xs text-muted">
          Folder project ini belum diinisialisasi sebagai repository Git.
        </p>
      </div>

      <!-- Git Workspace Content -->
      <div v-else class="space-y-6">
        <!-- AI Documentation Promo / Shortcut Banner -->
        <div
          class="rounded-xl border border-accent/30 bg-gradient-to-r from-accent/10 via-panel to-panel p-4 shadow-xs flex flex-wrap items-center justify-between gap-4"
        >
          <div class="flex items-center gap-3">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/20 text-accent font-bold text-lg shadow-2xs">
              📄
            </div>
            <div>
              <h4 class="text-xs font-bold text-ink flex items-center gap-2">
                <span>AI Documentation Suite</span>
                <span class="rounded bg-accent/20 px-1.5 py-0.5 text-[9px] font-mono text-accent">Fitur Baru</span>
              </h4>
              <p class="text-xs text-muted mt-0.5 leading-relaxed">
                Ingin membuat Dokumentasi Teknikal & Panduan Pengguna PDF otomatis untuk branch <b>{{ git.branch }}</b>?
              </p>
            </div>
          </div>
          <RouterLink
            :to="{ name: 'docs' }"
            class="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:opacity-90 transition shadow-xs"
          >
            <span>Buka AI Documentation</span>
            <span>→</span>
          </RouterLink>
        </div>

        <!-- Git Status & Branch Switcher Bar -->
        <div
          class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-panel p-4 shadow-xs"
        >
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-muted">Current Branch:</span>
              <span
                class="rounded-md bg-accent/15 px-2.5 py-1 font-mono text-xs font-semibold text-accent"
              >
                🌿 {{ git.branch }}
              </span>
            </div>

            <div class="h-4 w-px bg-line" />

            <div class="flex items-center gap-2">
              <span
                class="inline-flex h-2 w-2 rounded-full"
                :class="git.dirty ? 'bg-amber-500' : 'bg-emerald-500'"
              />
              <span class="text-xs text-muted">
                {{
                  git.dirty
                    ? `${changedFiles.length} file diubah (uncommitted)`
                    : "Working tree clean"
                }}
              </span>
            </div>

            <div
              v-if="git.ahead > 0 || git.behind > 0"
              class="flex items-center gap-2 text-xs font-mono"
            >
              <span v-if="git.ahead > 0" class="text-emerald-600 dark:text-emerald-400">
                ↑{{ git.ahead }} ahead
              </span>
              <span v-if="git.behind > 0" class="text-amber-600 dark:text-amber-400">
                ↓{{ git.behind }} behind
              </span>
            </div>
          </div>

          <!-- Branch Checkout & Creation -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-1.5">
              <select
                v-model="selectedBranch"
                class="rounded border border-line bg-base px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent font-mono"
                :disabled="!canUseGit || git.branches.length === 0"
                @change="onCheckout"
              >
                <option
                  v-for="b in git.branches"
                  :key="b"
                  :value="b"
                >
                  {{ b }}
                </option>
              </select>
            </div>

            <div class="flex items-center gap-1.5">
              <input
                v-model="newBranch"
                type="text"
                placeholder="New branch name..."
                class="w-36 rounded border border-line bg-base px-2.5 py-1.5 text-xs font-mono text-ink outline-none focus:border-accent"
                :disabled="!canUseGit"
                @keydown.enter="onCreateBranch"
              />
              <IconButton
                label="New Branch"
                variant="ghost"
                :disabled="!canUseGit || !newBranch.trim()"
                @click="onCreateBranch"
              />
            </div>
          </div>
        </div>

        <!-- Git Workspace Grid: Left (Changed Files), Right (Commit Workspace & Remote Sync) -->
        <div class="grid gap-6 lg:grid-cols-12">
          <!-- Left Column: Changed Files List (7 cols) -->
          <div class="space-y-4 lg:col-span-7">
            <div
              class="flex items-center justify-between border-b border-line pb-2"
            >
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-ink">
                  Changed Files
                </span>
                <span
                  class="rounded-full bg-elevated px-2 py-0.5 font-mono text-[10px] font-semibold text-muted"
                >
                  {{ changedFiles.length }}
                </span>
              </div>

              <div class="flex items-center gap-2">
                <input
                  v-if="changedFiles.length > 5"
                  v-model="fileFilter"
                  type="text"
                  placeholder="Filter file..."
                  class="h-7 w-32 rounded border border-line bg-base px-2 text-[11px] font-mono text-ink outline-none focus:border-accent"
                />
                <IconButton
                  label="Stage All (git add .)"
                  variant="ghost"
                  :disabled="!canUseGit || changedFiles.length === 0"
                  @click="emit('add')"
                />
              </div>
            </div>

            <!-- Changed Files List -->
            <div
              v-if="changedFiles.length > 0"
              class="max-h-[500px] space-y-1.5 overflow-y-auto pr-1"
            >
              <div
                v-for="file in filteredFiles"
                :key="file.path"
                class="flex items-center justify-between rounded-lg border border-line bg-panel px-3 py-2 text-xs transition hover:border-line-hover"
              >
                <div class="flex min-w-0 items-center gap-2.5">
                  <span
                    class="rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold"
                    :class="file.tone"
                    :title="file.label"
                  >
                    {{ file.status }}
                  </span>
                  <span class="truncate font-mono text-xs text-ink" :title="file.path">
                    {{ file.path }}
                  </span>
                </div>
                <span
                  v-if="file.ext"
                  class="rounded bg-elevated px-1.5 py-0.5 font-mono text-[9px] text-muted shrink-0 ml-2"
                >
                  .{{ file.ext }}
                </span>
              </div>
            </div>

            <div
              v-else
              class="rounded-xl border border-line bg-panel p-8 text-center shadow-xs"
            >
              <div class="mx-auto mb-2 text-xl">✨</div>
              <p class="text-xs text-muted">
                Tidak ada perubahan file pada working directory saat ini.
              </p>
            </div>
          </div>

          <!-- Right Column: AI Commit Workspace & Remote Sync (5 cols) -->
          <div class="space-y-4 lg:col-span-5">
            <!-- AI Model Selector for Commit Message -->
            <div class="rounded-xl border border-line bg-panel p-4 shadow-xs space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-ink flex items-center gap-1.5">
                  <span>🤖</span> AI Engine
                </span>
                <select
                  v-model="selectedAiModel"
                  class="rounded border border-line bg-base px-2.5 py-1 text-xs text-ink outline-none focus:border-accent font-medium cursor-pointer"
                  :disabled="generatingCommit"
                >
                  <option
                    v-for="model in aiModels"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }} {{ model.recommended ? '★' : '' }}
                  </option>
                </select>
              </div>
              <p v-if="activeModelInfo" class="text-[11px] text-muted leading-tight">
                {{ activeModelInfo.description }}
              </p>
            </div>

            <!-- Commit Workspace Card -->
            <div class="rounded-xl border border-accent/30 bg-panel p-4 shadow-xs relative overflow-hidden">
              <div class="flex items-center justify-between mb-3">
                <p
                  class="text-[10px] font-bold uppercase tracking-[0.16em] text-accent flex items-center gap-1.5"
                >
                  <span>✨</span> Commit Workspace
                </p>
                <button
                  type="button"
                  class="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  :disabled="!canUseGit || generatingCommit || changedFiles.length === 0"
                  @click="emit('generateCommitMessage', selectedAiModel)"
                >
                  <span>🤖</span> {{ generatingCommit ? 'Generating...' : 'AI Suggest' }}
                </button>
              </div>

              <textarea
                v-model="commitMessage"
                rows="5"
                placeholder="feat(scope): judul perubahan singkat&#10;&#10;- Rincian file/fitur yang ditambah/diperbarui&#10;- Rincian perbaikan logic..."
                class="mb-3 w-full resize-y rounded border border-line bg-base px-3 py-2.5 font-mono text-xs text-ink outline-none placeholder:text-muted/60 focus:border-accent leading-relaxed"
                :disabled="!canUseGit || generatingCommit"
              />

              <p
                v-if="generateError"
                class="mb-3 rounded border border-stopped/40 bg-stopped/10 px-3 py-2 text-xs text-stopped"
              >
                {{ generateError }}
              </p>

              <div class="flex items-center justify-end gap-2">
                <IconButton
                  label="Commit Changes"
                  variant="accent"
                  :disabled="
                    !canUseGit ||
                    generatingCommit ||
                    !commitMessage.trim()
                  "
                  @click="onCommit"
                />
              </div>
            </div>

            <!-- Remote Sync Card -->
            <div class="rounded-xl border border-line bg-panel p-4 shadow-xs">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                  Remote Sync
                </p>
                <span class="font-mono text-[10px] text-muted">
                  {{ git.remote || "No remote" }}
                </span>
              </div>
              <p class="text-xs text-muted mb-3">
                Sinkronisasi commit lokal dengan repository remote (GitLab/GitHub).
              </p>
              <div class="flex flex-wrap gap-2 justify-end">
                <IconButton
                  label="Pull Remote"
                  :disabled="!canUseGit || !git.remote"
                  @click="emit('pull')"
                />
                <IconButton
                  label="Push Remote"
                  variant="accent"
                  :disabled="!canUseGit || !git.remote"
                  @click="emit('push')"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
