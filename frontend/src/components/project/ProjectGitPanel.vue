<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { GitGeneratedDoc, GitStatus } from "../../types/project";
import { api } from "../../services/api";
import { notify } from "../../services/notification.service";
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
  generateCommitMessage: [];
}>();

const newBranch = ref("");
const selectedBranch = ref("");
const commitMessage = ref("");

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

const generatingDocs = ref(false);
const generatingType = ref<"all" | "technical" | "user_guide" | null>(null);
const docError = ref<string | null>(null);
const generatedDocs = ref<GitGeneratedDoc[] | null>(null);
const activePreviewDoc = ref<GitGeneratedDoc | null>(null);

const generateDocs = async (
  type: "all" | "technical" | "user_guide" = "all",
) => {
  if (!props.projectId || generatingDocs.value) return;
  generatingDocs.value = true;
  generatingType.value = type;
  docError.value = null;
  try {
    const res = await api.aiGenerateGitDocs(props.projectId, type);
    if (!generatedDocs.value) {
      generatedDocs.value = res.docs;
    } else {
      const existing = generatedDocs.value.filter(
        (d) => !res.docs.some((rd) => rd.type === d.type),
      );
      generatedDocs.value = [...existing, ...res.docs];
    }
    notify.toast("Dokumentasi PDF AI berhasil digenerasi!", "success");
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Gagal membuat PDF dokumentasi AI";
    docError.value = msg;
    notify.error("Gagal Dokumen AI", msg);
  } finally {
    generatingDocs.value = false;
    generatingType.value = null;
  }
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const downloadDoc = (doc: GitGeneratedDoc) => {
  if (!props.projectId) return;
  const url = api.getGitDocDownloadUrl(props.projectId, doc.filename);
  window.open(url, "_blank");
};

const canUseGit = computed(() => Boolean(props.git?.isRepo) && !props.busy);

const isGeneratingCommit = computed(() => Boolean(props.generatingCommit));

const parseChangedFile = (line: string): ChangedFile => {
  const raw = line.trim();
  const code = raw.slice(0, 2);
  const path = raw.slice(2).trim() || raw;
  const normalized = code.replace(/\s/g, "");

  if (normalized.includes("?")) {
    return { status: "?", path, label: "untracked", tone: "text-warn" };
  }
  if (normalized.includes("D")) {
    return { status: "D", path, label: "deleted", tone: "text-stopped" };
  }
  if (normalized.includes("A") || normalized.includes("N")) {
    return { status: "A", path, label: "added", tone: "text-running" };
  }
  if (normalized.includes("R")) {
    return { status: "R", path, label: "renamed", tone: "text-accent" };
  }
  return { status: "M", path, label: "modified", tone: "text-accent" };
};

const changedFiles = computed(() =>
  (props.git?.changedFiles ?? []).map(parseChangedFile),
);

const syncHint = computed(() => {
  if (!props.git?.isRepo) return null;
  const parts: string[] = [];
  if (props.git.ahead > 0) parts.push(`${props.git.ahead} ahead`);
  if (props.git.behind > 0) parts.push(`${props.git.behind} behind`);
  return parts.length ? parts.join(" · ") : "up to date with remote";
});

const onCreateBranch = () => {
  const name = newBranch.value.trim();
  if (!name) return;
  emit("createBranch", name);
  newBranch.value = "";
};

const onCheckout = () => {
  const name = selectedBranch.value.trim();
  if (!name || name === props.git?.branch) return;
  emit("checkout", name);
};

const onCommit = () => {
  const msg = commitMessage.value.trim();
  if (!msg) return;
  emit("commit", msg);
};
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <div
      class="flex flex-wrap items-center gap-3 border-b border-line bg-panel/80 px-6 py-3"
    >
      <template v-if="git?.isRepo">
        <span
          class="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-xs text-accent"
        >
          {{ git.branch }}
        </span>
        <span
          class="rounded-md px-2 py-1 text-xs"
          :class="
            git.dirty
              ? 'bg-warn/10 text-warn'
              : 'bg-running/10 text-running'
          "
        >
          {{ git.dirty ? `${changedFiles.length} changed` : "working tree clean" }}
        </span>
        <span class="text-xs text-muted">{{ syncHint }}</span>
        <span
          v-if="git.remote"
          class="ml-auto max-w-md truncate font-mono text-[11px] text-muted"
          :title="git.remote"
        >
          {{ git.remote }}
        </span>
      </template>
      <span v-else class="text-sm text-warn">Bukan git repository</span>
    </div>

    <div class="min-h-0 flex-1 overflow-auto p-6">
      <p
        v-if="message"
        class="mb-4 rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent"
      >
        {{ message }}
      </p>

      <div
        v-if="!git?.isRepo"
        class="mx-auto max-w-xl rounded-md border border-line bg-panel px-6 py-10 text-center"
      >
        <p class="text-sm text-muted">
          Folder project ini belum punya
          <code class="font-mono text-ink">.git</code>.
        </p>
        <p class="mt-2 text-xs text-muted">
          Inisialisasi repo di folder project sebelum memakai halaman ini.
        </p>
      </div>

      <div
        v-else
        class="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.4fr_1fr]"
      >
        <div class="rounded-md border border-line bg-panel">
          <div
            class="flex items-center justify-between border-b border-line px-4 py-3"
          >
            <div>
              <p
                class="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
              >
                Changed files
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ changedFiles.length }} file
              </p>
            </div>
            <IconButton
              label="Add All"
              :disabled="!canUseGit || changedFiles.length === 0"
              @click="emit('add')"
            />
          </div>

          <ul
            v-if="changedFiles.length > 0"
            class="max-h-[28rem] divide-y divide-line overflow-auto"
          >
            <li
              v-for="(file, index) in changedFiles"
              :key="`${file.path}-${index}`"
              class="flex items-center gap-3 px-4 py-2.5"
            >
              <span
                class="w-5 shrink-0 text-center font-mono text-xs font-semibold"
                :class="file.tone"
                :title="file.label"
              >
                {{ file.status }}
              </span>
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-ink/90">
                {{ file.path }}
              </span>
              <span class="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                {{ file.label }}
              </span>
            </li>
          </ul>
          <div
            v-else
            class="px-4 py-12 text-center text-sm text-muted"
          >
            Tidak ada perubahan lokal
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-md border border-line bg-panel p-4">
            <p
              class="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
            >
              Branch
            </p>
            <div class="mb-3 flex gap-2">
              <select
                v-model="selectedBranch"
                class="min-w-0 flex-1 rounded-md border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-accent"
                :disabled="!canUseGit"
              >
                <option
                  v-for="branch in git.branches"
                  :key="branch"
                  :value="branch"
                >
                  {{ branch }}
                </option>
              </select>
              <IconButton
                label="Checkout"
                :disabled="!canUseGit || selectedBranch === git.branch"
                @click="onCheckout"
              />
            </div>
            <div class="flex gap-2">
              <input
                v-model="newBranch"
                type="text"
                placeholder="nama-branch-baru"
                class="min-w-0 flex-1 rounded-md border border-line bg-base px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
                :disabled="!canUseGit"
                @keydown.enter.prevent="onCreateBranch"
              />
              <IconButton
                label="Buat"
                variant="accent"
                :disabled="!canUseGit || !newBranch.trim()"
                @click="onCreateBranch"
              />
            </div>
          </div>

          <div class="rounded-md border border-line bg-panel p-4">
            <p
              class="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
            >
              Commit
            </p>
            <textarea
              v-model="commitMessage"
              rows="3"
              placeholder="Tulis commit message..."
              class="mb-3 w-full resize-none rounded-md border border-line bg-base px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
              :disabled="!canUseGit || isGeneratingCommit"
            />
            <p
              v-if="generateError"
              class="mb-3 rounded-md border border-stopped/40 bg-stopped/10 px-3 py-2 text-xs text-stopped"
            >
              {{ generateError }}
            </p>
            <div class="flex flex-wrap gap-2">
              <IconButton
                label="AI Generate"
                variant="ghost"
                :disabled="
                  !canUseGit ||
                  isGeneratingCommit ||
                  changedFiles.length === 0
                "
                @click="emit('generateCommitMessage')"
              />
              <IconButton
                label="Commit"
                variant="accent"
                :disabled="
                  !canUseGit ||
                  isGeneratingCommit ||
                  !commitMessage.trim()
                "
                @click="onCommit"
              />
            </div>
          </div>

          <div class="rounded-md border border-line bg-panel p-4">
            <p
              class="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
            >
              Sync
            </p>
            <p class="mb-3 text-xs text-muted">
              Pull memakai <code class="font-mono text-ink">--ff-only</code>
              agar aman dari merge conflict otomatis.
            </p>
            <div class="flex flex-wrap gap-2">
              <IconButton
                label="Pull"
                :disabled="!canUseGit || !git.remote"
                @click="emit('pull')"
              />
              <IconButton
                label="Push"
                variant="accent"
                :disabled="!canUseGit || !git.remote"
                @click="emit('push')"
              />
            </div>
          </div>

          <!-- AI Documentation PDF Generator Section -->
          <div class="rounded-md border border-line bg-panel p-4">
            <div class="mb-3">
              <p
                class="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
              >
                AI Documentation (PDF)
              </p>
              <p class="mt-0.5 text-xs text-muted">
                Buat Dokumentasi Teknikal & User Guide berformat PDF berdasarkan file yang berubah pada branch
                <code class="font-mono text-accent">{{ git.branch }}</code>.
              </p>
            </div>

            <p
              v-if="docError"
              class="mb-3 rounded-md border border-stopped/40 bg-stopped/10 px-3 py-2 text-xs text-stopped whitespace-pre-wrap"
            >
              {{ docError }}
            </p>

            <div class="flex flex-wrap items-center gap-2">
              <IconButton
                label="Dokumentasi Teknikal"
                variant="ghost"
                :disabled="!canUseGit || generatingDocs"
                @click="generateDocs('technical')"
              />
              <IconButton
                label="User Guide"
                variant="ghost"
                :disabled="!canUseGit || generatingDocs"
                @click="generateDocs('user_guide')"
              />
              <IconButton
                label="Generate Keduanya (2 PDF)"
                variant="accent"
                :disabled="!canUseGit || generatingDocs"
                @click="generateDocs('all')"
              />
              <span
                v-if="generatingDocs"
                class="flex items-center gap-2 text-xs text-accent animate-pulse ml-1"
              >
                <svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  />
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Membuat {{ generatingType === 'technical' ? 'Dokumentasi Teknikal' : generatingType === 'user_guide' ? 'User Guide' : '2 File PDF' }} via AI...
              </span>
            </div>

            <div
              v-if="generatedDocs && generatedDocs.length > 0"
              class="mt-4 space-y-2 border-t border-line pt-3"
            >
              <p class="text-[11px] font-medium text-ink/80">Dokumen PDF Berhasil Dibuat:</p>
              <div
                v-for="doc in generatedDocs"
                :key="doc.filename"
                class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-base p-2.5 text-xs"
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <div
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent/10 text-accent font-bold text-[10px]"
                  >
                    PDF
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium text-ink truncate">{{ doc.title }}</p>
                    <p class="font-mono text-[10px] text-muted truncate">
                      {{ doc.filename }} · {{ formatSize(doc.sizeBytes) }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    class="rounded border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent transition-colors"
                    @click="activePreviewDoc = doc"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    class="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 transition-opacity"
                    @click="downloadDoc(doc)"
                  >
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Preview Modal -->
    <div
      v-if="activePreviewDoc"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click.self="activePreviewDoc = null"
    >
      <div
        class="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-line bg-panel shadow-2xl"
      >
        <div class="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h3 class="text-base font-semibold text-ink">{{ activePreviewDoc.title }}</h3>
            <p class="font-mono text-xs text-muted">{{ activePreviewDoc.filename }}</p>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 transition-opacity"
              @click="downloadDoc(activePreviewDoc)"
            >
              Download PDF
            </button>
            <button
              type="button"
              class="rounded border border-line px-2.5 py-1 text-xs font-medium text-muted hover:text-ink transition-colors"
              @click="activePreviewDoc = null"
            >
              Tutup
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-5">
          <pre
            class="whitespace-pre-wrap font-sans text-xs text-ink/90 leading-relaxed"
          >{{ activePreviewDoc.markdown }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>
