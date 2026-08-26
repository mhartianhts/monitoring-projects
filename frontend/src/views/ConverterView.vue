<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { api } from "../services/api";

interface FormatTarget {
  format: string;
  label: string;
  extension: string;
  description: string;
}

interface FormatSource {
  format: string;
  label: string;
  extension: string;
  targets: FormatTarget[];
}

interface ConvertedHistoryItem {
  id: string;
  originalName: string;
  outputName: string;
  fromFormat: string;
  toFormat: string;
  size: number;
  durationMs: number;
  timestamp: string;
  blobUrl: string;
}

// Available format matrix
const formatMatrix = ref<FormatSource[]>([
  {
    format: "pdf",
    label: "PDF Document",
    extension: ".pdf",
    targets: [
      { format: "docx", label: "Microsoft Word (.docx)", extension: ".docx", description: "Preservasi layout dan tabel akurat" },
      { format: "md", label: "Markdown Document (.md)", extension: ".md", description: "Ekstraksi struktur, heading, dan tabel" },
    ],
  },
  {
    format: "docx",
    label: "Microsoft Word (DOCX)",
    extension: ".docx",
    targets: [
      { format: "pdf", label: "PDF Document (.pdf)", extension: ".pdf", description: "Rendering 1:1 identik MS Word" },
      { format: "md", label: "Markdown Document (.md)", extension: ".md", description: "Ekstraksi konten ke Markdown bersih" },
    ],
  },
  {
    format: "md",
    label: "Markdown File (.md)",
    extension: ".md",
    targets: [
      { format: "pdf", label: "PDF Document (.pdf)", extension: ".pdf", description: "Render ke PDF dengan tipografi modern" },
      { format: "docx", label: "Microsoft Word (.docx)", extension: ".docx", description: "Konversi ke dokumen DOCX berstruktur" },
    ],
  },
]);

const selectedSourceFormat = ref<string>("pdf");
const selectedTargetFormat = ref<string>("docx");

const isDragging = ref(false);
const selectedFile = ref<File | null>(null);
const startPage = ref<number | undefined>(undefined);
const endPage = ref<number | undefined>(undefined);

const isConverting = ref(false);
const conversionError = ref<string | null>(null);
const conversionSuccess = ref<string | null>(null);

// Service status
const serviceStatus = ref<{
  connected: boolean;
  version?: string;
  message?: string;
  checking: boolean;
}>({
  connected: false,
  checking: true,
});

const history = ref<ConvertedHistoryItem[]>([]);

// Fetch formats & service status
const loadFormatsAndStatus = async () => {
  serviceStatus.value.checking = true;
  try {
    const [statusRes, formatsRes] = await Promise.allSettled([
      api.converterStatus(),
      api.converterGetFormats(),
    ]);

    if (statusRes.status === "fulfilled") {
      serviceStatus.value = {
        connected: statusRes.value.connected,
        version: statusRes.value.grpcService?.version || "1.1.0",
        message: statusRes.value.message || statusRes.value.grpcService?.message,
        checking: false,
      };
    } else {
      serviceStatus.value = { connected: false, checking: false };
    }

    if (formatsRes.status === "fulfilled" && formatsRes.value.length > 0) {
      formatMatrix.value = formatsRes.value;
    }
  } catch (err: any) {
    serviceStatus.value = {
      connected: false,
      message: err.message,
      checking: false,
    };
  }
};

onMounted(() => {
  void loadFormatsAndStatus();
});

// Computed current source & available targets
const currentSource = computed(() => {
  return formatMatrix.value.find((s) => s.format === selectedSourceFormat.value) || formatMatrix.value[0];
});

const availableTargets = computed(() => {
  return currentSource.value?.targets || [];
});

// Ensure target format is always valid when source format changes
watch(selectedSourceFormat, () => {
  const targets = availableTargets.value;
  if (targets.length > 0) {
    if (!targets.some((t) => t.format === selectedTargetFormat.value)) {
      selectedTargetFormat.value = targets[0].format;
    }
  }
  selectedFile.value = null;
  conversionError.value = null;
  conversionSuccess.value = null;
});

const acceptedExtension = computed(() => {
  return currentSource.value?.extension || ".pdf";
});

const formatIcon = (fmt: string) => {
  switch (fmt.toLowerCase()) {
    case "pdf": return "📕";
    case "docx": return "📘";
    case "md": return "📝";
    case "txt": return "📄";
    case "html": return "🌐";
    default: return "📁";
  }
};

const onFileDrop = (e: DragEvent) => {
  isDragging.value = false;
  conversionError.value = null;
  conversionSuccess.value = null;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  autoDetectAndSetFile(files[0]);
};

const onFileSelect = (e: Event) => {
  conversionError.value = null;
  conversionSuccess.value = null;
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    autoDetectAndSetFile(target.files[0]);
  }
};

const autoDetectAndSetFile = (file: File) => {
  const name = file.name.toLowerCase();
  let detectedFormat = "";

  if (name.endsWith(".pdf")) detectedFormat = "pdf";
  else if (name.endsWith(".docx")) detectedFormat = "docx";
  else if (name.endsWith(".md") || name.endsWith(".markdown")) detectedFormat = "md";

  if (detectedFormat) {
    // If format differs from selected source, auto-switch source format
    if (detectedFormat !== selectedSourceFormat.value) {
      selectedSourceFormat.value = detectedFormat;
    }
    selectedFile.value = file;
  } else {
    // Check if matches accepted extension
    if (name.endsWith(acceptedExtension.value)) {
      selectedFile.value = file;
    } else {
      conversionError.value = `Format file tidak sesuai. Harap unggah file ${acceptedExtension.value}`;
    }
  }
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const triggerDownload = (blobUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

const swapFormats = () => {
  const oldSource = selectedSourceFormat.value;
  const oldTarget = selectedTargetFormat.value;

  // Check if oldTarget can be a source
  const canBeSource = formatMatrix.value.some((s) => s.format === oldTarget);
  if (canBeSource) {
    selectedSourceFormat.value = oldTarget;
    // Check if oldSource is an available target
    const newSourceObj = formatMatrix.value.find((s) => s.format === oldTarget);
    if (newSourceObj?.targets.some((t) => t.format === oldSource)) {
      selectedTargetFormat.value = oldSource;
    }
  }
};

const handleConvert = async () => {
  if (!selectedFile.value) return;

  isConverting.value = true;
  conversionError.value = null;
  conversionSuccess.value = null;

  try {
    const result = await api.convertDocument(
      selectedFile.value,
      selectedSourceFormat.value,
      selectedTargetFormat.value,
      {
        startPage: startPage.value,
        endPage: endPage.value,
      }
    );

    const blobUrl = URL.createObjectURL(result.blob);
    const historyItem: ConvertedHistoryItem = {
      id: Math.random().toString(36).substring(2, 9),
      originalName: selectedFile.value.name,
      outputName: result.filename,
      fromFormat: selectedSourceFormat.value,
      toFormat: selectedTargetFormat.value,
      size: result.blob.size,
      durationMs: result.durationMs,
      timestamp: new Date().toLocaleTimeString(),
      blobUrl,
    };

    history.value.unshift(historyItem);
    conversionSuccess.value = `Berhasil mengonversi ${selectedFile.value.name} ke ${result.filename} (${result.durationMs}ms)`;

    // Auto trigger download
    triggerDownload(blobUrl, result.filename);
  } catch (err: any) {
    conversionError.value = err.message || "Terjadi kesalahan saat mengonversi dokumen.";
  } finally {
    isConverting.value = false;
  }
};
</script>

<template>
  <div class="flex-1 min-w-0 flex flex-col h-full overflow-y-auto bg-base p-6 space-y-6">
    <!-- Header Section -->
    <div class="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-2xl">🔄</span>
          <h1 class="text-xl font-bold text-ink tracking-tight">Multi-Format Document Converter</h1>
          <span class="rounded bg-accent/15 px-2 py-0.5 text-xs font-mono font-semibold text-accent border border-accent/30">
            Python + gRPC Microservice
          </span>
        </div>
        <p class="text-xs text-muted mt-1">
          Pusat konversi dokumen dinamis berpresisi tinggi dengan dukungan format <strong>PDF</strong>, <strong>DOCX (Word)</strong>, dan <strong>Markdown (.md)</strong>.
        </p>
      </div>

      <!-- Service Status Indicator -->
      <div class="flex items-center gap-3">
        <div
          class="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
          :class="
            serviceStatus.connected
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          "
        >
          <span class="h-2 w-2 rounded-full animate-pulse" :class="serviceStatus.connected ? 'bg-emerald-400' : 'bg-rose-400'"></span>
          <span>
            {{ serviceStatus.connected ? `gRPC Online (:50051 v${serviceStatus.version})` : 'gRPC Offline' }}
          </span>
          <button
            type="button"
            class="text-xs hover:underline opacity-80 hover:opacity-100 ml-1"
            title="Refresh status"
            @click="loadFormatsAndStatus"
          >
            🔄
          </button>
        </div>
      </div>
    </div>

    <!-- Dynamic Format Route Selector Card -->
    <div class="rounded-xl border border-line bg-panel p-5 shadow-sm space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
          <span>🎛️</span>
          <span>Konfigurasi Alur Konversi</span>
        </h2>
        <span class="text-[11px] text-muted">Pilih format asal dan format tujuan</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
        <!-- 1. Source Format Selection (Left) -->
        <div class="md:col-span-5 space-y-2">
          <label class="block text-xs font-bold text-ink flex items-center gap-1.5">
            <span>1. Format Asal (Source):</span>
          </label>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="src in formatMatrix"
              :key="src.format"
              type="button"
              class="flex flex-col items-center justify-center p-3 rounded-lg border text-center transition group"
              :class="
                selectedSourceFormat === src.format
                  ? 'border-accent bg-accent/15 text-accent shadow-xs font-bold ring-1 ring-accent'
                  : 'border-line bg-base text-muted hover:border-accent/40 hover:text-ink hover:bg-elevated'
              "
              @click="selectedSourceFormat = src.format"
            >
              <span class="text-2xl mb-1 group-hover:scale-110 transition-transform">{{ formatIcon(src.format) }}</span>
              <span class="text-xs">{{ src.label }}</span>
              <span class="text-[10px] font-mono opacity-70 mt-0.5">{{ src.extension }}</span>
            </button>
          </div>
        </div>

        <!-- Swap / Arrow Indicator (Center) -->
        <div class="md:col-span-1 flex items-center justify-center pt-5">
          <button
            type="button"
            class="h-10 w-10 rounded-full border border-line bg-elevated text-ink hover:text-accent hover:border-accent flex items-center justify-center transition shadow-sm hover:scale-105"
            title="Tukar format asal dan tujuan (jika didukung)"
            @click="swapFormats"
          >
            <span class="text-sm font-bold">⇄</span>
          </button>
        </div>

        <!-- 2. Target Format Selection (Right) -->
        <div class="md:col-span-5 space-y-2">
          <label class="block text-xs font-bold text-ink flex items-center gap-1.5">
            <span>2. Format Tujuan (Target Output):</span>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="tgt in availableTargets"
              :key="tgt.format"
              type="button"
              class="flex flex-col items-center justify-center p-3 rounded-lg border text-center transition group"
              :class="
                selectedTargetFormat === tgt.format
                  ? 'border-accent bg-accent/15 text-accent shadow-xs font-bold ring-1 ring-accent'
                  : 'border-line bg-base text-muted hover:border-accent/40 hover:text-ink hover:bg-elevated'
              "
              @click="selectedTargetFormat = tgt.format"
            >
              <span class="text-2xl mb-1 group-hover:scale-110 transition-transform">{{ formatIcon(tgt.format) }}</span>
              <span class="text-xs">{{ tgt.label }}</span>
              <span class="text-[10px] font-mono opacity-70 mt-0.5">{{ tgt.description }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Converter Workspace -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <!-- Upload & Action Area (Left Column) -->
      <div class="lg:col-span-7 flex flex-col space-y-4">
        <div class="rounded-xl border border-line bg-panel p-6 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-bold text-ink flex items-center gap-2">
              <span>📤</span>
              <span>Unggah Dokumen ({{ currentSource?.label }})</span>
            </h2>
            <div class="flex items-center gap-2 text-xs">
              <span class="rounded bg-accent/10 text-accent font-mono px-2 py-0.5 border border-accent/20">
                {{ formatIcon(selectedSourceFormat) }} {{ selectedSourceFormat.toUpperCase() }} ➔ {{ formatIcon(selectedTargetFormat) }} {{ selectedTargetFormat.toUpperCase() }}
              </span>
            </div>
          </div>

          <!-- Drag and Drop Box -->
          <div
            class="relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition cursor-pointer"
            :class="[
              isDragging
                ? 'border-accent bg-accent/10 scale-[1.01]'
                : selectedFile
                ? 'border-accent/40 bg-elevated/60'
                : 'border-line/80 bg-base/50 hover:border-accent/50 hover:bg-elevated/40'
            ]"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onFileDrop"
            @click="($refs.fileInput as HTMLInputElement)?.click()"
          >
            <input
              ref="fileInput"
              type="file"
              :accept="acceptedExtension"
              class="hidden"
              @change="onFileSelect"
            />

            <template v-if="!selectedFile">
              <div class="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-2xl mb-3 shadow-inner">
                {{ formatIcon(selectedSourceFormat) }}
              </div>
              <p class="text-xs font-semibold text-ink">
                Klik untuk memilih file atau seret & jatuhkan file di sini
              </p>
              <p class="text-[11px] text-muted mt-1">
                Format yang diterima: <code class="font-mono text-accent">{{ acceptedExtension }}</code> (Otomatis mendeteksi file)
              </p>
            </template>

            <template v-else>
              <div class="flex items-center gap-3 w-full bg-panel p-3.5 rounded-lg border border-line">
                <span class="text-3xl">{{ formatIcon(selectedSourceFormat) }}</span>
                <div class="flex-1 text-left min-w-0">
                  <p class="text-xs font-bold text-ink truncate">{{ selectedFile.name }}</p>
                  <p class="text-[11px] font-mono text-muted">{{ formatBytes(selectedFile.size) }}</p>
                </div>
                <button
                  type="button"
                  class="rounded p-1.5 text-xs text-muted hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Hapus file"
                  @click.stop="selectedFile = null"
                >
                  ✕ Hapus
                </button>
              </div>
            </template>
          </div>

          <!-- Extra Options for PDF Source (Page Range) -->
          <div v-if="selectedSourceFormat === 'pdf' && selectedFile" class="rounded-lg bg-base/60 border border-line p-3 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-ink">Opsi Halaman PDF (Opsional):</span>
              <span class="text-[11px] text-muted">Biarkan kosong untuk mengonversi seluruh halaman</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] text-muted mb-1">Mulai Halaman</label>
                <input
                  v-model.number="startPage"
                  type="number"
                  min="1"
                  placeholder="Misal: 1"
                  class="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
                />
              </div>
              <div>
                <label class="block text-[11px] text-muted mb-1">Sampai Halaman</label>
                <input
                  v-model.number="endPage"
                  type="number"
                  min="1"
                  placeholder="Misal: 5"
                  class="w-full rounded border border-line bg-panel px-3 py-1.5 text-xs text-ink outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          <!-- Action Button -->
          <button
            type="button"
            class="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed"
            :class="
              isConverting
                ? 'bg-accent/80'
                : 'bg-accent hover:bg-accent-dim'
            "
            :disabled="!selectedFile || isConverting"
            @click="handleConvert"
          >
            <span v-if="isConverting" class="animate-spin text-sm">⚡</span>
            <span v-else class="text-sm">🚀</span>
            <span>
              {{
                isConverting
                  ? 'Sedang Memproses Konversi via gRPC...'
                  : `Mulai Konversi (${selectedSourceFormat.toUpperCase()} ➔ ${selectedTargetFormat.toUpperCase()})`
              }}
            </span>
          </button>

          <!-- Alert Notices -->
          <div
            v-if="conversionError"
            class="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400 flex items-start gap-2"
          >
            <span class="shrink-0 font-bold">⚠️</span>
            <span class="break-words">{{ conversionError }}</span>
          </div>

          <div
            v-if="conversionSuccess"
            class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 flex items-start gap-2"
          >
            <span class="shrink-0 font-bold">✅</span>
            <span class="break-words">{{ conversionSuccess }}</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Specs & History -->
      <div class="lg:col-span-5 flex flex-col space-y-4">
        <!-- Supported Matrix Summary Card -->
        <div class="rounded-xl border border-line bg-panel p-5 shadow-sm space-y-3">
          <h2 class="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
            <span>✨</span>
            <span>Matriks Konversi yang Didukung</span>
          </h2>

          <div class="space-y-2 text-xs">
            <div class="rounded-lg border border-line/70 bg-base p-2.5 space-y-1">
              <div class="flex items-center justify-between font-semibold text-ink">
                <span>📕 PDF Document</span>
                <span class="text-accent font-mono text-[10px]">➔ DOCX, MD</span>
              </div>
              <p class="text-[11px] text-muted">pdf2docx (rekonstruksi layout) & pymupdf4llm (ekstraksi markdown).</p>
            </div>

            <div class="rounded-lg border border-line/70 bg-base p-2.5 space-y-1">
              <div class="flex items-center justify-between font-semibold text-ink">
                <span>📘 Word (.docx)</span>
                <span class="text-accent font-mono text-[10px]">➔ PDF, MD</span>
              </div>
              <p class="text-[11px] text-muted">docx2pdf (Word COM / LibreOffice) & mammoth + markdownify.</p>
            </div>

            <div class="rounded-lg border border-line/70 bg-base p-2.5 space-y-1">
              <div class="flex items-center justify-between font-semibold text-ink">
                <span>📝 Markdown (.md)</span>
                <span class="text-accent font-mono text-[10px]">➔ PDF, DOCX</span>
              </div>
              <p class="text-[11px] text-muted">Python-Markdown + xhtml2pdf & python-docx structure parser.</p>
            </div>
          </div>
        </div>

        <!-- Recent Conversions History Card -->
        <div class="rounded-xl border border-line bg-panel p-5 shadow-sm space-y-3 flex-1">
          <div class="flex items-center justify-between">
            <h2 class="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
              <span>📋</span>
              <span>Riwayat Konversi Sesi Ini ({{ history.length }})</span>
            </h2>
            <button
              v-if="history.length > 0"
              type="button"
              class="text-[10px] text-muted hover:text-rose-400 transition"
              @click="history = []"
            >
              Bersihkan
            </button>
          </div>

          <div v-if="history.length === 0" class="py-8 text-center text-xs text-muted border border-dashed border-line/60 rounded-lg">
            <span>Belum ada dokumen yang dikonversi pada sesi ini.</span>
          </div>

          <div v-else class="space-y-2 max-h-80 overflow-y-auto pr-1">
            <div
              v-for="item in history"
              :key="item.id"
              class="flex items-center justify-between rounded-lg border border-line bg-base p-2.5 text-xs hover:border-accent/40 transition"
            >
              <div class="min-w-0 flex-1 pr-2">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm">{{ formatIcon(item.toFormat) }}</span>
                  <p class="font-bold text-ink truncate">{{ item.outputName }}</p>
                </div>
                <div class="flex items-center gap-2 text-[10px] text-muted mt-1">
                  <span class="font-mono bg-elevated px-1.5 py-0.5 rounded text-accent uppercase font-bold">
                    {{ item.fromFormat }} ➔ {{ item.toFormat }}
                  </span>
                  <span>{{ formatBytes(item.size) }}</span>
                  <span>•</span>
                  <span class="text-accent font-mono">{{ item.durationMs }}ms</span>
                  <span>•</span>
                  <span>{{ item.timestamp }}</span>
                </div>
              </div>

              <button
                type="button"
                class="rounded-md bg-accent/15 px-2.5 py-1.5 text-xs font-bold text-accent hover:bg-accent hover:text-white transition shrink-0"
                @click="triggerDownload(item.blobUrl, item.outputName)"
              >
                ⬇ Unduh
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
