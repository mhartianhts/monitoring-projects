<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { GitGeneratedDoc, GitStatus } from "../../types/project";
import { api } from "../../services/api";
import { notify } from "../../services/notification.service";
import IconButton from "../ui/IconButton.vue";
import MarkdownRenderer from "../ui/MarkdownRenderer.vue";

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
const generatingStatusText = ref<string>("");
const docError = ref<string | null>(null);
const generatedDocs = ref<GitGeneratedDoc[] | null>(null);
const activePreviewDoc = ref<GitGeneratedDoc | null>(null);

let jobPollTimer: ReturnType<typeof setInterval> | null = null;

const stopJobPolling = () => {
  if (jobPollTimer) {
    clearInterval(jobPollTimer);
    jobPollTimer = null;
  }
};

const addOrUpdateDocs = (newDocs: GitGeneratedDoc[]) => {
  if (!generatedDocs.value) {
    generatedDocs.value = newDocs;
  } else {
    const existing = generatedDocs.value.filter(
      (d) => !newDocs.some((rd) => rd.type === d.type),
    );
    generatedDocs.value = [...existing, ...newDocs];
  }
};

const pollJobStatus = (jobId: string) => {
  stopJobPolling();
  jobPollTimer = setInterval(async () => {
    try {
      const job = await api.aiGetDocJobStatus(jobId);
      if (!job) return;

      generatingDocs.value = job.status === "processing";
      generatingStatusText.value = job.step || "Memproses dokumen AI di background...";
      generatingType.value = job.type;

      if (job.docs && job.docs.length > 0) {
        addOrUpdateDocs(job.docs);
      }

      if (job.status === "completed") {
        stopJobPolling();
        generatingDocs.value = false;
        generatingType.value = null;
        generatingStatusText.value = "";
        notify.toast("Dokumentasi PDF AI berhasil digenerasi!", "success");
      } else if (job.status === "failed") {
        stopJobPolling();
        generatingDocs.value = false;
        generatingType.value = null;
        generatingStatusText.value = "";
        const msg = job.error || "Gagal membuat dokumen AI";
        docError.value = job.hint ? `${msg}\n${job.hint}` : msg;
        notify.error("Gagal Dokumen AI", docError.value);
      }
    } catch {
      // Ignore transient polling network errors
    }
  }, 2000);
};

const generateDocs = async (
  type: "all" | "technical" | "user_guide" = "all",
) => {
  if (!props.projectId || generatingDocs.value) return;
  generatingDocs.value = true;
  generatingType.value = type;
  generatingStatusText.value = "Memulai proses background AI...";
  docError.value = null;

  try {
    const job = await api.aiStartDocJob(props.projectId, type);
    if (job.docs && job.docs.length > 0) {
      addOrUpdateDocs(job.docs);
    }
    if (job.status === "completed") {
      generatingDocs.value = false;
      generatingType.value = null;
      generatingStatusText.value = "";
      notify.toast("Dokumentasi PDF AI berhasil digenerasi!", "success");
      return;
    }
    if (job.status === "failed") {
      generatingDocs.value = false;
      generatingType.value = null;
      generatingStatusText.value = "";
      const msg = job.error || "Gagal membuat dokumen AI";
      docError.value = job.hint ? `${msg}\n${job.hint}` : msg;
      notify.error("Gagal Dokumen AI", docError.value);
      return;
    }
    pollJobStatus(job.id);
  } catch (error) {
    generatingDocs.value = false;
    generatingType.value = null;
    generatingStatusText.value = "";
    const msg = error instanceof Error ? error.message : "Gagal memulai job dokumen AI";
    docError.value = msg;
    notify.error("Gagal Dokumen AI", msg);
  }
};

watch(
  () => props.projectId,
  async (id) => {
    stopJobPolling();
    generatingDocs.value = false;
    generatingType.value = null;
    generatingStatusText.value = "";
    docError.value = null;
    if (id) {
      try {
        const activeJob = await api.aiGetActiveDocJob(id);
        if (activeJob && activeJob.status === "processing") {
          generatingDocs.value = true;
          generatingType.value = activeJob.type;
          generatingStatusText.value = activeJob.step || "Memproses dokumen AI...";
          if (activeJob.docs && activeJob.docs.length > 0) {
            addOrUpdateDocs(activeJob.docs);
          }
          pollJobStatus(activeJob.id);
        }
      } catch {
        // ignore
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  stopJobPolling();
});

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

const copyDocMarkdown = (markdown: string) => {
  if (!markdown) return;
  void navigator.clipboard.writeText(markdown).then(() => {
    notify.toast("Markdown berhasil disalin ke clipboard", "success");
  });
};

const canUseGit = computed(() => Boolean(props.git?.isRepo) && !props.busy);

const isGeneratingCommit = computed(() => Boolean(props.generatingCommit));

const getFileIcon = (filePath: string) => {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.vue')) return '💚';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return '🟦';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return '🟨';
  if (lower.endsWith('.json')) return '🟧';
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return '🎨';
  if (lower.endsWith('.md')) return '📝';
  return '📄';
};

const parseChangedFile = (line: string): ChangedFile => {
  const raw = line.trim();
  const code = raw.slice(0, 2);
  const path = raw.slice(2).trim() || raw;
  const normalized = code.replace(/\s/g, "");

  const ext = getFileIcon(path);

  if (normalized.includes("?")) {
    return { status: "?", path, label: "untracked", tone: "text-warn bg-warn/10", ext };
  }
  if (normalized.includes("D")) {
    return { status: "D", path, label: "deleted", tone: "text-stopped bg-stopped/10", ext };
  }
  if (normalized.includes("A") || normalized.includes("N")) {
    return { status: "A", path, label: "added", tone: "text-running bg-running/10", ext };
  }
  if (normalized.includes("R")) {
    return { status: "R", path, label: "renamed", tone: "text-accent bg-accent/10", ext };
  }
  return { status: "M", path, label: "modified", tone: "text-accent bg-accent/10", ext };
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
    <!-- Git Status Topbar -->
    <div
      class="flex flex-wrap items-center gap-3 border-b border-line bg-panel/80 px-6 py-3"
    >
      <template v-if="git?.isRepo">
        <span
          class="rounded-md border border-accent/40 bg-accent/15 px-3 py-1 font-mono text-xs font-semibold text-accent flex items-center gap-1.5 shadow-xs"
        >
          <span>🌿</span> {{ git.branch }}
        </span>
        <span
          class="rounded-md px-2.5 py-1 text-xs font-medium"
          :class="
            git.dirty
              ? 'bg-warn/15 text-warn border border-warn/30'
              : 'bg-running/15 text-running border border-running/30'
          "
        >
          {{ git.dirty ? `${changedFiles.length} file diubah` : "working tree clean" }}
        </span>
        <span class="text-xs text-muted">{{ syncHint }}</span>
        <span
          v-if="git.remote"
          class="ml-auto max-w-md truncate font-mono text-[11px] text-muted flex items-center gap-1"
          :title="git.remote"
        >
          <span>🔗</span> {{ git.remote }}
        </span>
      </template>
      <span v-else class="text-sm text-warn flex items-center gap-1">⚠️ Bukan git repository</span>
    </div>

    <!-- Main Git View Body -->
    <div class="min-h-0 flex-1 overflow-auto p-6">
      <p
        v-if="message"
        class="mb-4 rounded-md border border-accent/30 bg-accent/10 px-4 py-2.5 text-xs text-accent font-medium flex items-center gap-2"
      >
        <span>💡</span> {{ message }}
      </p>

      <div
        v-if="!git?.isRepo"
        class="mx-auto max-w-xl rounded-lg border border-line bg-panel px-6 py-10 text-center"
      >
        <p class="text-sm text-muted">
          Folder project ini belum memiliki <code class="font-mono text-ink bg-elevated px-1 py-0.5 rounded">.git</code>.
        </p>
        <p class="mt-2 text-xs text-muted">
          Inisialisasi git repository di folder project untuk menggunakan fitur ini.
        </p>
      </div>

      <div
        v-else
        class="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[1.4fr_1fr]"
      >
        <!-- Changed Files List Card -->
        <div class="rounded-lg border border-line bg-panel shadow-xs flex flex-col">
          <div
            class="flex items-center justify-between border-b border-line px-4 py-3 bg-panel/80"
          >
            <div>
              <p
                class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted flex items-center gap-1.5"
              >
                <span>📂</span> Changed Files
              </p>
              <p class="mt-0.5 text-xs text-muted font-mono">
                {{ changedFiles.length }} file terdeteksi
              </p>
            </div>
            <IconButton
              label="Stage All Files"
              variant="accent"
              :disabled="!canUseGit || changedFiles.length === 0"
              @click="emit('add')"
            />
          </div>

          <ul
            v-if="changedFiles.length > 0"
            class="max-h-[30rem] divide-y divide-line/60 overflow-auto p-1"
          >
            <li
              v-for="(file, index) in changedFiles"
              :key="`${file.path}-${index}`"
              class="flex items-center gap-3 px-3 py-2 hover:bg-elevated/60 transition rounded"
            >
              <span
                class="w-6 h-6 shrink-0 rounded flex items-center justify-center font-mono text-xs font-bold"
                :class="file.tone"
                :title="file.label"
              >
                {{ file.status }}
              </span>
              <span class="text-xs">{{ file.ext }}</span>
              <span class="min-w-0 flex-1 truncate font-mono text-xs text-ink/90">
                {{ file.path }}
              </span>
              <span class="shrink-0 text-[10px] uppercase font-semibold tracking-wider text-muted/70">
                {{ file.label }}
              </span>
            </li>
          </ul>
          <div
            v-else
            class="px-4 py-16 text-center text-xs text-muted"
          >
            ✨ Working tree bersih. Tidak ada perubahan lokal.
          </div>
        </div>

        <!-- Git Actions Controls Sidebar -->
        <div class="space-y-4">
          <!-- Branch Switcher Card -->
          <div class="rounded-lg border border-line bg-panel p-4 shadow-xs">
            <p
              class="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted flex items-center gap-1.5"
            >
              <span>🌱</span> Branch Management
            </p>
            <div class="mb-3 flex gap-2">
              <select
                v-model="selectedBranch"
                class="min-w-0 flex-1 rounded border border-line bg-base px-3 py-2 text-xs text-ink outline-none focus:border-accent"
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
                class="min-w-0 flex-1 rounded border border-line bg-base px-3 py-2 font-mono text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
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

          <!-- Commit Message & AI Generator Card -->
          <div class="rounded-lg border border-accent/30 bg-panel p-4 shadow-xs relative overflow-hidden">
            <div class="flex items-center justify-between mb-3">
              <p
                class="text-[10px] font-bold uppercase tracking-[0.16em] text-accent flex items-center gap-1.5"
              >
                <span>✨</span> Commit Workspace
              </p>
              <button
                type="button"
                class="text-[11px] text-accent font-semibold hover:underline flex items-center gap-1"
                :disabled="!canUseGit || isGeneratingCommit || changedFiles.length === 0"
                @click="emit('generateCommitMessage')"
              >
                <span>🤖</span> {{ isGeneratingCommit ? 'Generating...' : 'AI Suggest' }}
              </button>
            </div>

            <textarea
              v-model="commitMessage"
              rows="6"
              placeholder="feat(scope): judul perubahan singkat&#10;&#10;- Rincian file/fitur yang ditambah/diperbarui&#10;- Rincian perbaikan logic atau perbaikan bug..."
              class="mb-3 w-full resize-y rounded border border-line bg-base px-3 py-2.5 font-mono text-xs text-ink outline-none placeholder:text-muted/60 focus:border-accent leading-relaxed"
              :disabled="!canUseGit || isGeneratingCommit"
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
                  isGeneratingCommit ||
                  !commitMessage.trim()
                "
                @click="onCommit"
              />
            </div>
          </div>

          <!-- Remote Sync Card -->
          <div class="rounded-lg border border-line bg-panel p-4 shadow-xs">
            <p
              class="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted flex items-center gap-1.5"
            >
              <span>🚀</span> Remote Sync
            </p>
            <p class="mb-3 text-[11px] text-muted">
              Pull menggunakan <code class="font-mono text-ink">--ff-only</code> agar aman dari merge conflict.
            </p>
            <div class="flex flex-wrap gap-2">
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

          <!-- AI Documentation Generator Card -->
          <div class="rounded-lg border border-line bg-panel p-4 shadow-xs">
            <div class="mb-3">
              <p
                class="text-[10px] font-bold uppercase tracking-[0.16em] text-muted flex items-center gap-1.5"
              >
                <span>📄</span> AI Documentation (PDF)
              </p>
              <p class="mt-1 text-[11px] text-muted">
                Buat Dokumentasi Teknikal & User Guide PDF dari branch <code class="font-mono text-accent">{{ git.branch }}</code>.
              </p>
            </div>

            <p
              v-if="docError"
              class="mb-3 rounded border border-stopped/40 bg-stopped/10 px-3 py-2 text-xs text-stopped whitespace-pre-wrap"
            >
              {{ docError }}
            </p>

            <div
              v-if="generatingDocs && generatingStatusText"
              class="mb-3 flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent animate-pulse"
            >
              <span class="inline-block animate-spin">⏳</span>
              <span>{{ generatingStatusText }}</span>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <IconButton
                :label="generatingType === 'technical' ? 'Generating...' : 'Teknikal Docs'"
                variant="ghost"
                :disabled="!canUseGit || generatingDocs"
                @click="generateDocs('technical')"
              />
              <IconButton
                :label="generatingType === 'user_guide' ? 'Generating...' : 'User Guide'"
                variant="ghost"
                :disabled="!canUseGit || generatingDocs"
                @click="generateDocs('user_guide')"
              />
              <IconButton
                :label="generatingType === 'all' ? 'Generating...' : 'Generate Semua (2 PDF)'"
                variant="accent"
                :disabled="!canUseGit || generatingDocs"
                @click="generateDocs('all')"
              />
            </div>

            <div
              v-if="generatedDocs && generatedDocs.length > 0"
              class="mt-4 space-y-2 border-t border-line pt-3"
            >
              <p class="text-[11px] font-semibold text-ink">Dokumen PDF Dihasilkan:</p>
              <div
                v-for="doc in generatedDocs"
                :key="doc.filename"
                class="flex flex-wrap items-center justify-between gap-2 rounded border border-line bg-base p-2.5 text-xs"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-accent/15 text-accent font-bold text-[10px]"
                  >
                    PDF
                  </div>
                  <div class="min-w-0">
                    <p class="font-semibold text-ink truncate text-xs">{{ doc.title }}</p>
                    <p class="font-mono text-[10px] text-muted truncate">
                      {{ doc.filename }} · {{ formatSize(doc.sizeBytes) }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    class="rounded border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent transition"
                    @click="activePreviewDoc = doc"
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    class="rounded bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 transition"
                    @click="downloadDoc(doc)"
                  >
                    Download
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Document Preview Modal -->
    <div
      v-if="activePreviewDoc"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      @click.self="activePreviewDoc = null"
    >
      <div
        class="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-line bg-panel shadow-2xl overflow-hidden"
      >
        <div class="flex items-center justify-between border-b border-line bg-panel/90 px-6 py-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="rounded bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent uppercase">
                {{ activePreviewDoc.type === 'technical' ? 'Teknikal' : 'User Guide' }}
              </span>
              <h3 class="text-base font-bold text-ink truncate">{{ activePreviewDoc.title }}</h3>
            </div>
            <p class="font-mono text-xs text-muted mt-0.5 truncate">{{ activePreviewDoc.filename }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              class="rounded border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:border-accent hover:text-accent transition flex items-center gap-1"
              @click="copyDocMarkdown(activePreviewDoc.markdown)"
              title="Salin isi markdown ke clipboard"
            >
              <span>📋</span> Salin Teks
            </button>
            <button
              type="button"
              class="rounded bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition flex items-center gap-1"
              @click="downloadDoc(activePreviewDoc)"
            >
              <span>📥</span> Download PDF
            </button>
            <button
              type="button"
              class="rounded border border-line px-2.5 py-1.5 text-xs font-medium text-muted hover:text-ink transition"
              @click="activePreviewDoc = null"
            >
              Tutup
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-6 bg-base/50">
          <div class="rounded-lg border border-line bg-panel p-6 shadow-xs max-w-none">
            <MarkdownRenderer :content="activePreviewDoc.markdown" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
