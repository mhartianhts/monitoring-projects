<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import { useProjectStore } from "../stores/project.store";
import StatusDot from "../components/project/StatusDot.vue";
import IconButton from "../components/ui/IconButton.vue";
import MarkdownRenderer from "../components/ui/MarkdownRenderer.vue";
import DocScreenshotModal from "../components/project/DocScreenshotModal.vue";
import type {
  GitDocJob,
  GitGeneratedDoc,
  TokenPortalModel,
} from "../types/project";

const store = useProjectStore();
const { selected, selectedId, gitStatus, gitLoading, availableEditors } =
  storeToRefs(store);

// Branch selectors
const selectedSourceBranch = ref("");
const selectedBaseBranch = ref("");

// TokenPortal AI Model Selection
const selectedAiModel = ref(
  localStorage.getItem("tokenportal_ai_model") || "kimi-k27-code",
);
const aiModels = ref<TokenPortalModel[]>([]);
const loadingModels = ref(false);

const activeModelInfo = computed(() => {
  return aiModels.value.find((m) => m.id === selectedAiModel.value) || null;
});

const availableBranches = computed(() => {
  return gitStatus.value?.branches || [];
});

const availableBaseBranches = computed(() => {
  const all = gitStatus.value?.branches || [];
  const current = selectedSourceBranch.value || gitStatus.value?.branch || "";
  return all.filter((b) => b !== current);
});

// Setup default branch
watch(
  () => [gitStatus.value?.branches, gitStatus.value?.branch],
  ([branches, current]) => {
    if (!Array.isArray(branches) || branches.length === 0) return;
    const curr = String(current || branches[0] || "");
    if (!selectedSourceBranch.value || !branches.includes(selectedSourceBranch.value)) {
      selectedSourceBranch.value = curr;
    }

    const available = branches.filter((b) => b !== selectedSourceBranch.value);
    if (!selectedBaseBranch.value || !available.includes(selectedBaseBranch.value)) {
      if (available.includes("main")) {
        selectedBaseBranch.value = "main";
      } else if (available.includes("master")) {
        selectedBaseBranch.value = "master";
      } else if (available.includes("develop")) {
        selectedBaseBranch.value = "develop";
      } else if (available.length > 0) {
        selectedBaseBranch.value = available[0];
      }
    }
  },
  { immediate: true },
);

watch(selectedSourceBranch, (newSource) => {
  if (newSource && selectedBaseBranch.value === newSource) {
    const available = availableBranches.value.filter((b) => b !== newSource);
    selectedBaseBranch.value = available.length > 0 ? available[0] : "none";
  }
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
    // ignore
  } finally {
    loadingModels.value = false;
  }
};

watch(selectedAiModel, (newModel) => {
  if (newModel) {
    localStorage.setItem("tokenportal_ai_model", newModel);
  }
});

// Job & Generation States
const generatingDocs = ref(false);
const generatingType = ref<"all" | "technical" | "user_guide" | null>(null);
const generatingStatusText = ref<string>("");
const docError = ref<string | null>(null);
const generatedDocs = ref<GitGeneratedDoc[] | null>(null);
const activePreviewDoc = ref<GitGeneratedDoc | null>(null);
const currentDocJob = ref<GitDocJob | null>(null);
const submittingScreenshots = ref(false);
const loadingSavedDocs = ref(false);
const deletingDoc = ref<string | null>(null);

const showScreenshotModal = computed(() => {
  return (
    currentDocJob.value?.status === "awaiting_screenshots" &&
    (currentDocJob.value?.requestedScreenshots?.length ?? 0) > 0
  );
});

let jobPollTimer: ReturnType<typeof setInterval> | null = null;

const stopJobPolling = () => {
  if (jobPollTimer) {
    clearInterval(jobPollTimer);
    jobPollTimer = null;
  }
};

const loadSavedDocs = async (projectId?: string) => {
  const pId = projectId || selectedId.value;
  if (!pId) return;
  loadingSavedDocs.value = true;
  try {
    const docs = await api.aiListGitDocs(pId);
    generatedDocs.value = docs || [];
  } catch {
    // ignore
  } finally {
    loadingSavedDocs.value = false;
  }
};

const handleDeleteDoc = async (doc: GitGeneratedDoc) => {
  if (!selectedId.value) return;
  if (!confirm(`Apakah Anda yakin ingin menghapus dokumen "${doc.filename}"?`)) return;
  deletingDoc.value = doc.filename;
  try {
    const updated = await api.aiDeleteGitDoc(selectedId.value, doc.filename);
    generatedDocs.value = updated || [];
    notify.toast(`File ${doc.filename} berhasil dihapus`, "success");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menghapus dokumen";
    notify.error("Gagal Hapus Dokumen", msg);
  } finally {
    deletingDoc.value = null;
  }
};

const pollJobStatus = (jobId: string) => {
  stopJobPolling();
  jobPollTimer = setInterval(async () => {
    try {
      const job = await api.aiGetDocJobStatus(jobId);
      if (!job) return;

      currentDocJob.value = job;
      generatingType.value = job.type;

      if (job.status === "processing") {
        generatingDocs.value = true;
        generatingStatusText.value = job.step || "Memproses dokumen AI di background...";
      } else if (job.status === "awaiting_screenshots") {
        generatingDocs.value = true;
        generatingStatusText.value = "Menunggu screenshot dari pengguna...";
      }

      if (job.status === "completed") {
        stopJobPolling();
        generatingDocs.value = false;
        generatingType.value = null;
        generatingStatusText.value = "";
        currentDocJob.value = null;
        void loadSavedDocs();
        notify.toast("Dokumentasi PDF AI berhasil digenerasi!", "success");
      } else if (job.status === "failed") {
        stopJobPolling();
        generatingDocs.value = false;
        generatingType.value = null;
        generatingStatusText.value = "";
        currentDocJob.value = null;
        const msg = job.error || "Gagal membuat dokumen AI";
        docError.value = job.hint ? `${msg}\n${job.hint}` : msg;
        notify.error("Gagal Dokumen AI", docError.value);
      }
    } catch {
      // Ignore transient network errors
    }
  }, 2000);
};

const generateDocs = async (
  type: "all" | "technical" | "user_guide" = "all",
) => {
  if (!selectedId.value || generatingDocs.value) return;
  generatingDocs.value = true;
  generatingType.value = type;
  generatingStatusText.value = "Memulai proses background AI...";
  docError.value = null;

  try {
    const job = await api.aiStartDocJob(
      selectedId.value,
      type,
      selectedAiModel.value,
      selectedBaseBranch.value,
    );
    currentDocJob.value = job;

    if (job.status === "completed") {
      generatingDocs.value = false;
      generatingType.value = null;
      generatingStatusText.value = "";
      currentDocJob.value = null;
      void loadSavedDocs();
      notify.toast("Dokumentasi PDF AI berhasil digenerasi!", "success");
      return;
    }
    if (job.status === "failed") {
      generatingDocs.value = false;
      generatingType.value = null;
      generatingStatusText.value = "";
      currentDocJob.value = null;
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
    currentDocJob.value = null;
    const msg = error instanceof Error ? error.message : "Gagal memulai job dokumen AI";
    docError.value = msg;
    notify.error("Gagal Dokumen AI", msg);
  }
};

const handleSubmitScreenshots = async ({
  formData,
}: {
  formData: FormData;
  uploadedCount: number;
}) => {
  if (!currentDocJob.value) return;
  submittingScreenshots.value = true;
  try {
    const job = await api.aiSubmitDocScreenshots(currentDocJob.value.id, formData);
    currentDocJob.value = job;
    generatingDocs.value = true;
    generatingStatusText.value = "Melanjutkan pembuatan dokumen dengan gambar...";
    pollJobStatus(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengunggah screenshot";
    notify.error("Gagal Upload Screenshot", msg);
  } finally {
    submittingScreenshots.value = false;
  }
};

const handleSkipScreenshots = async () => {
  if (!currentDocJob.value) return;
  submittingScreenshots.value = true;
  try {
    const job = await api.aiSkipDocScreenshots(currentDocJob.value.id);
    currentDocJob.value = job;
    generatingDocs.value = true;
    generatingStatusText.value = "Melanjutkan pembuatan dokumen tanpa gambar...";
    pollJobStatus(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal melanjutkan dokumen";
    notify.error("Gagal Melanjutkan", msg);
  } finally {
    submittingScreenshots.value = false;
  }
};

const handleCloseScreenshotModal = () => {
  if (currentDocJob.value?.status === "awaiting_screenshots") {
    handleSkipScreenshots();
  }
};

const downloadDoc = (doc: GitGeneratedDoc) => {
  if (!selectedId.value) return;
  const url = api.getGitDocDownloadUrl(selectedId.value, doc.filename);
  window.open(url, "_blank");
};

const copyDocMarkdown = async (markdownText?: string) => {
  if (!markdownText) {
    notify.toast("Isi dokumen tidak tersedia untuk disalin", "info");
    return;
  }
  try {
    await navigator.clipboard.writeText(markdownText);
    notify.toast("Teks Markdown berhasil disalin ke clipboard!", "success");
  } catch {
    notify.error("Gagal Menyalin Teks", "Izin clipboard tidak tersedia");
  }
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (isoString?: string) => {
  if (!isoString) return "-";
  try {
    return new Date(isoString).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return isoString;
  }
};

watch(
  selectedId,
  async (id) => {
    stopJobPolling();
    generatingDocs.value = false;
    generatingType.value = null;
    generatingStatusText.value = "";
    currentDocJob.value = null;
    docError.value = null;
    if (id) {
      void store.fetchGitStatus(id);
      void loadSavedDocs(id);
      try {
        const activeJob = await api.aiGetActiveDocJob(id);
        if (
          activeJob &&
          (activeJob.status === "processing" ||
            activeJob.status === "awaiting_screenshots")
        ) {
          currentDocJob.value = activeJob;
          generatingDocs.value = true;
          generatingType.value = activeJob.type;
          generatingStatusText.value =
            activeJob.status === "awaiting_screenshots"
              ? "Menunggu screenshot dari pengguna..."
              : activeJob.step || "Memproses dokumen AI...";
          pollJobStatus(activeJob.id);
        }
      } catch {
        // ignore
      }
    }
  },
  { immediate: true },
);

onMounted(() => {
  void fetchAiModels();
});

onUnmounted(() => {
  stopJobPolling();
});
</script>

<template>
  <main class="flex min-w-0 flex-1 flex-col bg-base">
    <template v-if="selected">
      <!-- Header Bar -->
      <header class="border-b border-line bg-panel px-6 py-4">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <StatusDot :status="selected.status" />
              <h2 class="truncate text-xl font-semibold text-ink">{{ selected.name }}</h2>
              <span
                class="rounded border border-line bg-elevated px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-accent font-semibold"
              >
                AI Documentation
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
              :disabled="gitLoading || loadingSavedDocs"
              @click="store.fetchGitStatus(); loadSavedDocs()"
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

      <!-- Main Documentation Workspace Body -->
      <div class="min-h-0 flex-1 overflow-auto p-6">
        <div class="mx-auto max-w-6xl space-y-6">
          <!-- Control Panel: Branch & Model Configuration Card -->
          <div
            class="rounded-xl border border-line bg-panel p-5 shadow-xs flex flex-wrap items-center justify-between gap-4"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2.5">
                <span class="text-xl">📄</span>
                <h3 class="text-base font-bold text-ink">AI Documentation Suite</h3>
              </div>
              <p class="mt-1 text-xs text-muted leading-relaxed">
                Hasilkan dokumen PDF teknikal dan panduan pengguna profesional berdasarkan perubahan branch fitur secara terarah.
              </p>
            </div>

            <!-- Parameters Grid -->
            <div class="flex flex-wrap items-center gap-3">
              <!-- Source Branch -->
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-muted font-medium">Branch Sumber:</span>
                <select
                  v-model="selectedSourceBranch"
                  class="rounded border border-line bg-base px-2.5 py-1.5 text-xs font-mono font-semibold text-accent outline-none focus:border-accent cursor-pointer"
                  :disabled="generatingDocs || !gitStatus?.isRepo"
                >
                  <option
                    v-for="b in availableBranches"
                    :key="b"
                    :value="b"
                  >
                    🌿 {{ b }}
                  </option>
                </select>
              </div>

              <!-- Base Branch -->
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-muted font-medium">Bandingkan Terhadap (Base):</span>
                <select
                  v-model="selectedBaseBranch"
                  class="rounded border border-line bg-base px-2.5 py-1.5 text-xs font-mono font-medium text-ink outline-none focus:border-accent cursor-pointer"
                  :disabled="generatingDocs || !gitStatus?.isRepo"
                >
                  <option
                    v-for="b in availableBaseBranches"
                    :key="b"
                    :value="b"
                  >
                    {{ b }}
                  </option>
                  <option value="none">Tanpa Base Branch (Hanya Diff Lokal)</option>
                </select>
              </div>

              <!-- AI Model -->
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-muted font-medium">Model AI:</span>
                <select
                  v-model="selectedAiModel"
                  class="rounded border border-line bg-base px-2.5 py-1.5 text-xs text-ink outline-none focus:border-accent font-medium cursor-pointer"
                  :disabled="generatingDocs"
                >
                  <option
                    v-for="model in aiModels"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }} {{ model.recommended ? '★' : '' }}
                  </option>
                </select>
                <span
                  v-if="activeModelInfo?.context"
                  class="rounded bg-elevated px-1.5 py-0.5 text-[10px] font-mono text-muted"
                  :title="activeModelInfo.description"
                >
                  {{ activeModelInfo.context }}
                </span>
              </div>
            </div>
          </div>

          <!-- Error Alert Banner -->
          <div
            v-if="docError"
            class="rounded-lg border border-stopped/40 bg-stopped/10 p-4 text-xs text-stopped whitespace-pre-wrap flex items-start gap-2.5"
          >
            <span class="text-base shrink-0">⚠️</span>
            <div>
              <p class="font-bold">Gagal Membuat Dokumen</p>
              <p class="mt-0.5">{{ docError }}</p>
            </div>
          </div>

          <!-- Active Generating Progress Banner -->
          <div
            v-if="generatingDocs"
            class="rounded-xl border border-accent/40 bg-accent/10 p-5 shadow-xs animate-pulse flex items-center justify-between gap-4"
          >
            <div class="flex items-center gap-3">
              <span class="text-2xl animate-spin">⏳</span>
              <div>
                <p class="text-sm font-bold text-accent">Sedang Menyusun Dokumen PDF...</p>
                <p class="text-xs text-ink/80 mt-0.5">{{ generatingStatusText || "Memproses background AI..." }}</p>
              </div>
            </div>
            <span class="rounded-full bg-accent/20 px-3 py-1 text-xs font-mono font-bold text-accent">
              {{ currentDocJob?.progress ?? 50 }}%
            </span>
          </div>

          <!-- Generation Option Cards Grid -->
          <div class="grid gap-4 md:grid-cols-3">
            <!-- Option 1: Technical Documentation -->
            <div class="rounded-xl border border-line bg-panel p-5 shadow-xs flex flex-col justify-between hover:border-accent/50 transition group">
              <div>
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold text-base">
                    📘
                  </div>
                  <div>
                    <h4 class="text-xs font-bold text-ink group-hover:text-accent transition">Dokumentasi Teknikal</h4>
                    <p class="text-[10px] text-muted font-mono">Format: PDF</p>
                  </div>
                </div>
                <p class="text-xs text-muted leading-relaxed mt-2">
                  Ringkasan perubahan arsitektural, tabel modul yang diubah, detail logika fungsi, dependensi, dan rekomendasi pengujian.
                </p>
              </div>
              <div class="mt-4 pt-3 border-t border-line/60">
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 rounded-lg border border-line bg-elevated py-2 text-xs font-semibold text-ink hover:border-accent hover:text-accent transition disabled:opacity-50"
                  :disabled="!gitStatus?.isRepo || generatingDocs"
                  @click="generateDocs('technical')"
                >
                  <span>{{ generatingType === 'technical' ? '⏳ Sedang Proses...' : '⚡ Generate Teknikal PDF' }}</span>
                </button>
              </div>
            </div>

            <!-- Option 2: User Guide with Screenshots -->
            <div class="rounded-xl border border-line bg-panel p-5 shadow-xs flex flex-col justify-between hover:border-accent/50 transition group">
              <div>
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold text-base">
                    📙
                  </div>
                  <div>
                    <h4 class="text-xs font-bold text-ink group-hover:text-accent transition">Panduan Pengguna (User Guide)</h4>
                    <p class="text-[10px] text-amber-500 font-mono font-semibold">★ Mendukung Upload Screenshot</p>
                  </div>
                </div>
                <p class="text-xs text-muted leading-relaxed mt-2">
                  Panduan langkah demi langkah berbasis UI/UX. AI mengidentifikasi dan meminta screenshot antarmuka yang diperlukan agar mudah dipahami.
                </p>
              </div>
              <div class="mt-4 pt-3 border-t border-line/60">
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 rounded-lg border border-line bg-elevated py-2 text-xs font-semibold text-ink hover:border-accent hover:text-accent transition disabled:opacity-50"
                  :disabled="!gitStatus?.isRepo || generatingDocs"
                  @click="generateDocs('user_guide')"
                >
                  <span>{{ generatingType === 'user_guide' ? '⏳ Sedang Proses...' : '📸 Generate User Guide PDF' }}</span>
                </button>
              </div>
            </div>

            <!-- Option 3: Generate All (2 PDFs) -->
            <div class="rounded-xl border border-accent/40 bg-gradient-to-br from-accent/10 to-transparent p-5 shadow-xs flex flex-col justify-between hover:border-accent transition">
              <div>
                <div class="flex items-center gap-2.5 mb-2">
                  <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white font-bold text-base shadow-xs">
                    📦
                  </div>
                  <div>
                    <h4 class="text-xs font-bold text-ink">Paket Lengkap (2 PDF)</h4>
                    <p class="text-[10px] text-accent font-mono font-semibold">Teknikal & User Guide</p>
                  </div>
                </div>
                <p class="text-xs text-muted leading-relaxed mt-2">
                  Membuat kedua berkas dokumentasi sekaligus dalam satu siklus kerja otomatis lengkap dengan penanganan screenshot visual.
                </p>
              </div>
              <div class="mt-4 pt-3 border-t border-line/60">
                <button
                  type="button"
                  class="w-full flex items-center justify-center gap-2 rounded-lg bg-accent py-2 text-xs font-semibold text-white hover:opacity-90 transition disabled:opacity-50 shadow-xs"
                  :disabled="!gitStatus?.isRepo || generatingDocs"
                  @click="generateDocs('all')"
                >
                  <span>{{ generatingType === 'all' ? '⏳ Sedang Proses...' : '✨ Generate Semua (2 PDF)' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Saved Documents Gallery Section -->
          <div class="rounded-xl border border-line bg-panel p-5 shadow-xs">
            <div class="flex items-center justify-between mb-4 border-b border-line pb-3">
              <div class="flex items-center gap-2">
                <span class="text-base">📑</span>
                <h4 class="text-sm font-bold text-ink">Galeri Dokumen PDF Proyek (Tersimpan di docs/)</h4>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="loadingSavedDocs" class="text-xs text-muted animate-pulse">Memuat berkas...</span>
                <span class="text-xs font-mono text-muted">
                  {{ generatedDocs?.length ?? 0 }} berkas PDF tersimpan
                </span>
              </div>
            </div>

            <div
              v-if="generatedDocs && generatedDocs.length > 0"
              class="grid gap-3 sm:grid-cols-2"
            >
              <div
                v-for="doc in generatedDocs"
                :key="doc.filename"
                class="flex flex-col justify-between rounded-lg border border-line bg-base p-4 transition hover:border-line-hover shadow-2xs"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold text-xs shadow-2xs"
                    :class="doc.type === 'technical' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'"
                  >
                    PDF
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5">
                      <span
                        class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                        :class="doc.type === 'technical' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'"
                      >
                        {{ doc.type === 'technical' ? 'Teknikal' : 'User Guide' }}
                      </span>
                      <h5 class="text-xs font-bold text-ink truncate">{{ doc.title }}</h5>
                    </div>
                    <p class="font-mono text-[10px] text-muted truncate mt-1">
                      {{ doc.filename }}
                    </p>
                    <div class="flex items-center gap-2 text-[10px] text-muted mt-0.5">
                      <span>Ukuran: <b class="font-mono text-ink">{{ formatSize(doc.sizeBytes) }}</b></span>
                      <span>·</span>
                      <span>{{ formatDate(doc.createdAt) }}</span>
                    </div>
                  </div>
                </div>

                <div class="mt-4 pt-3 border-t border-line/60 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    class="rounded border border-line bg-panel p-1.5 text-xs text-muted hover:text-stopped hover:border-stopped/40 transition"
                    :disabled="deletingDoc === doc.filename"
                    title="Hapus Dokumen PDF ini"
                    @click="handleDeleteDoc(doc)"
                  >
                    <span>🗑️</span>
                  </button>

                  <div class="flex items-center gap-1.5">
                    <button
                      type="button"
                      class="rounded border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent transition flex items-center gap-1"
                      @click="copyDocMarkdown(doc.markdown)"
                      title="Salin Markdown"
                    >
                      <span>📋</span> Teks
                    </button>
                    <button
                      type="button"
                      class="rounded border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent transition flex items-center gap-1"
                      @click="activePreviewDoc = doc"
                    >
                      <span>👁️</span> Preview
                    </button>
                    <button
                      type="button"
                      class="rounded bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90 transition flex items-center gap-1 shadow-2xs"
                      @click="downloadDoc(doc)"
                    >
                      <span>📥</span> Unduh PDF
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else
              class="py-12 text-center text-xs text-muted"
            >
              Belum ada berkas dokumentasi PDF yang digenerasi untuk proyek ini. Pilih salah satu kartu di atas untuk mulai membuat dokumen.
            </div>
          </div>
        </div>
      </div>

      <!-- Fullscreen Document Preview Modal -->
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
                <span
                  class="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
                  :class="activePreviewDoc.type === 'technical' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'"
                >
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

      <!-- Human-in-the-Loop Screenshot Request Modal -->
      <DocScreenshotModal
        :show="showScreenshotModal"
        :job="currentDocJob"
        :submitting="submittingScreenshots"
        @submit="handleSubmitScreenshots"
        @skip="handleSkipScreenshots"
        @close="handleCloseScreenshotModal"
      />
    </template>

    <div
      v-else
      class="flex flex-1 items-center justify-center px-6 text-sm text-muted"
    >
      Pilih project di sidebar untuk mengelola AI Documentation.
    </div>
  </main>
</template>
