<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { shareService } from "../services/share.service";
import type { IShareInfo, ISharedFile, ISharedText } from "../types/share.types";
import { io, type Socket } from "socket.io-client";
import Swal from "sweetalert2";

const shareInfo = ref<IShareInfo | null>(null);
const files = ref<ISharedFile[]>([]);
const texts = ref<ISharedText[]>([]);
const loading = ref(true);
const uploading = ref(false);
const uploadProgress = ref(0);
const selectedIp = ref<string>("");

const activeTab = ref<"files" | "texts">("files");
const newText = ref("");
const isSubmittingText = ref(false);

const isDragging = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

let socket: Socket | null = null;

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatTime = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
};

const loadData = async () => {
  try {
    loading.value = true;
    const [infoRes, filesRes, textsRes] = await Promise.all([
      shareService.getShareInfo(selectedIp.value || undefined),
      shareService.listFiles(),
      shareService.listTexts(),
    ]);
    shareInfo.value = infoRes;
    selectedIp.value = infoRes.selectedIp;
    files.value = filesRes;
    texts.value = textsRes;
  } catch (err: any) {
    console.error("Failed to load share data:", err);
  } finally {
    loading.value = false;
  }
};

const onIpChange = async () => {
  if (!selectedIp.value) return;
  try {
    const res = await shareService.getShareInfo(selectedIp.value);
    shareInfo.value = res;
  } catch (err: any) {
    Swal.fire({
      icon: "error",
      title: "Gagal Mengubah IP",
      text: err.message || "Tidak dapat memuat QR code untuk IP ini",
      background: "#18181b",
      color: "#f4f4f5",
    });
  }
};

const copyToClipboard = async (text: string, label = "Teks") => {
  try {
    await navigator.clipboard.writeText(text);
    Swal.fire({
      icon: "success",
      title: "Tersalin!",
      text: `${label} berhasil disalin ke clipboard`,
      timer: 1500,
      showConfirmButton: false,
      background: "#18181b",
      color: "#f4f4f5",
    });
  } catch {
    Swal.fire({
      icon: "error",
      title: "Gagal Menyalin",
      background: "#18181b",
      color: "#f4f4f5",
    });
  }
};

const handleFiles = async (fileList: FileList | File[]) => {
  if (!fileList || fileList.length === 0) return;
  uploading.value = true;
  uploadProgress.value = 0;

  try {
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      await shareService.uploadFile(file, "PC");
      uploadProgress.value = Math.round(((i + 1) / fileList.length) * 100);
    }
    await loadFiles();
    Swal.fire({
      icon: "success",
      title: "File Berhasil Dikirim!",
      text: `${fileList.length} file siap diunduh oleh HP`,
      timer: 1800,
      showConfirmButton: false,
      background: "#18181b",
      color: "#f4f4f5",
    });
  } catch (err: any) {
    Swal.fire({
      icon: "error",
      title: "Gagal Mengunggah",
      text: err.message || "Terjadi kesalahan saat upload",
      background: "#18181b",
      color: "#f4f4f5",
    });
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
    if (fileInputRef.value) fileInputRef.value.value = "";
  }
};

const onFileInputChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files) {
    void handleFiles(target.files);
  }
};

const onDrop = (event: DragEvent) => {
  isDragging.value = false;
  if (event.dataTransfer?.files) {
    void handleFiles(event.dataTransfer.files);
  }
};

const loadFiles = async () => {
  try {
    files.value = await shareService.listFiles();
  } catch (err) {
    console.error(err);
  }
};

const loadTexts = async () => {
  try {
    texts.value = await shareService.listTexts();
  } catch (err) {
    console.error(err);
  }
};

const deleteFile = async (id: string, name: string) => {
  const result = await Swal.fire({
    title: "Hapus File?",
    text: `Hapus file "${name}" dari daftar share?`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    cancelButtonColor: "#3f3f46",
    confirmButtonText: "Ya, Hapus",
    cancelButtonText: "Batal",
    background: "#18181b",
    color: "#f4f4f5",
  });

  if (result.isConfirmed) {
    try {
      await shareService.deleteFile(id);
      await loadFiles();
    } catch (err: any) {
      Swal.fire({ icon: "error", title: "Gagal", text: err.message, background: "#18181b", color: "#f4f4f5" });
    }
  }
};

const submitText = async () => {
  if (!newText.value.trim()) return;
  isSubmittingText.value = true;
  try {
    await shareService.addText(newText.value.trim(), "PC");
    newText.value = "";
    await loadTexts();
  } catch (err: any) {
    Swal.fire({ icon: "error", title: "Gagal Kirim Teks", text: err.message, background: "#18181b", color: "#f4f4f5" });
  } finally {
    isSubmittingText.value = false;
  }
};

const deleteText = async (id: string) => {
  try {
    await shareService.deleteText(id);
    await loadTexts();
  } catch (err: any) {
    console.error(err);
  }
};

onMounted(() => {
  void loadData();

  // Connect socket for live refresh
  socket = io(window.location.origin);
  socket.on("share:update", () => {
    void loadFiles();
    void loadTexts();
  });
});

onUnmounted(() => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
});
</script>

<template>
  <div class="h-full flex flex-col bg-base overflow-hidden">
    <!-- Header -->
    <div class="border-b border-line bg-panel px-6 py-4 flex items-center justify-between shrink-0">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-xl shadow-md text-white">
          📱
        </div>
        <div>
          <h1 class="text-base font-bold text-ink flex items-center gap-2">
            Instant Local Share
            <span class="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono text-cyan-400">
              AirDrop-like
            </span>
          </h1>
          <p class="text-xs text-muted">
            Kirim file, foto, dan teks antara PC dan Smartphone secara instan di jaringan Wi-Fi yang sama
          </p>
        </div>
      </div>

      <!-- Quick Actions / Rescan -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:bg-line transition"
          @click="loadData"
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        <!-- Left Column: QR Code & Connection Card (5 Cols) -->
        <div class="lg:col-span-5 space-y-5">
          <!-- Connection & QR Card -->
          <div class="rounded-xl border border-line bg-panel p-5 shadow-sm space-y-4">
            <div class="flex items-center justify-between border-b border-line pb-3">
              <span class="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <span class="text-cyan-400">⚡</span> Scan untuk Terhubung
              </span>
              <span class="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LAN Ready
              </span>
            </div>

            <!-- QR Code Display -->
            <div class="flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-inner border border-gray-200">
              <template v-if="shareInfo?.qrCodeDataUrl">
                <img
                  :src="shareInfo.qrCodeDataUrl"
                  alt="QR Code Local Share"
                  class="w-56 h-56 rounded-lg object-contain"
                />
              </template>
              <div v-else class="w-56 h-56 flex items-center justify-center text-xs text-gray-400 animate-pulse">
                Menghasilkan QR Code...
              </div>
              <p class="mt-2 text-[11px] font-medium text-gray-600 text-center">
                Arahkan kamera smartphone Anda ke QR code ini
              </p>
            </div>

            <!-- URL & IP Selection -->
            <div class="space-y-2 pt-1">
              <div class="flex items-center justify-between text-[11px] text-muted">
                <span>Alamat Akses HP:</span>
                <button
                  type="button"
                  class="text-cyan-400 hover:underline flex items-center gap-1 font-mono"
                  @click="copyToClipboard(shareInfo?.shareUrl || '', 'URL Share')"
                >
                  📋 Copy URL
                </button>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  readonly
                  :value="shareInfo?.shareUrl || ''"
                  class="w-full rounded-lg border border-line bg-base px-3 py-2 text-xs font-mono text-cyan-300 select-all outline-none"
                />
              </div>

              <!-- Adapter Selector if multiple -->
              <div v-if="shareInfo && shareInfo.interfaces.length > 1" class="pt-2">
                <label class="block text-[10px] font-semibold uppercase text-muted mb-1">
                  Pilih Adapter Jaringan:
                </label>
                <select
                  v-model="selectedIp"
                  class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs text-ink outline-none"
                  @change="onIpChange"
                >
                  <option
                    v-for="net in shareInfo.interfaces"
                    :key="net.ip"
                    :value="net.ip"
                  >
                    {{ net.name }} — {{ net.ip }} {{ net.isWifi ? '(Wi-Fi)' : '' }}
                  </option>
                </select>
              </div>
            </div>
          </div>

          <!-- Fast Dropzone for PC to Mobile -->
          <div
            class="rounded-xl border-2 border-dashed transition-all p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-2 group"
            :class="
              isDragging
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-line bg-panel hover:border-cyan-500/50 hover:bg-elevated'
            "
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
            @click="fileInputRef?.click()"
          >
            <input
              ref="fileInputRef"
              type="file"
              multiple
              class="hidden"
              @change="onFileInputChange"
            />
            <div class="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-400 text-2xl group-hover:scale-110 transition-transform">
              📤
            </div>
            <div>
              <p class="text-xs font-bold text-ink">Drag & Drop file di sini</p>
              <p class="text-[11px] text-muted">atau klik untuk memilih file dari komputer</p>
            </div>
            <div v-if="uploading" class="w-full mt-2 space-y-1">
              <div class="h-1.5 w-full bg-line rounded-full overflow-hidden">
                <div
                  class="h-full bg-cyan-500 transition-all duration-200"
                  :style="{ width: `${uploadProgress}%` }"
                ></div>
              </div>
              <span class="text-[10px] text-cyan-400 font-mono">Mengunggah... {{ uploadProgress }}%</span>
            </div>
          </div>
        </div>

        <!-- Right Column: Tabs (Shared Files & Clipboard Sync) (7 Cols) -->
        <div class="lg:col-span-7 flex flex-col rounded-xl border border-line bg-panel shadow-sm overflow-hidden min-h-[500px]">
          <!-- Tab Navigation -->
          <div class="flex items-center justify-between border-b border-line px-4 pt-3">
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-bold transition"
                :class="
                  activeTab === 'files'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-muted hover:text-ink'
                "
                @click="activeTab = 'files'"
              >
                <span>📁 File Aktif</span>
                <span class="rounded-full bg-elevated px-1.5 py-0.2 text-[10px] text-ink font-mono">
                  {{ files.length }}
                </span>
              </button>

              <button
                type="button"
                class="flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-bold transition"
                :class="
                  activeTab === 'texts'
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-muted hover:text-ink'
                "
                @click="activeTab = 'texts'"
              >
                <span>📋 Live Clipboard / Teks</span>
                <span class="rounded-full bg-elevated px-1.5 py-0.2 text-[10px] text-ink font-mono">
                  {{ texts.length }}
                </span>
              </button>
            </div>

            <span class="text-[11px] text-muted flex items-center gap-1">
              <span class="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
              Live Sync
            </span>
          </div>

          <!-- Tab Content 1: Files List -->
          <div v-if="activeTab === 'files'" class="flex-1 p-4 overflow-y-auto space-y-2">
            <div v-if="files.length === 0" class="h-64 flex flex-col items-center justify-center text-center p-6 text-muted space-y-2">
              <span class="text-3xl opacity-40">📂</span>
              <p class="text-xs font-medium">Belum ada file yang di-share.</p>
              <p class="text-[11px] text-muted/70 max-w-xs">
                Unggah file dari kotak di sebelah kiri atau kirim foto/dokumen dari browser HP Anda.
              </p>
            </div>

            <div
              v-for="file in files"
              :key="file.id"
              class="flex items-center justify-between rounded-lg border border-line bg-base p-3 hover:border-cyan-500/40 transition group"
            >
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-elevated text-lg shrink-0">
                  📄
                </div>
                <div class="min-w-0">
                  <p class="text-xs font-bold text-ink truncate group-hover:text-cyan-300 transition-colors">
                    {{ file.name }}
                  </p>
                  <p class="text-[10px] font-mono text-muted flex items-center gap-2">
                    <span>{{ formatBytes(file.size) }}</span>
                    <span>•</span>
                    <span>{{ formatTime(file.uploadedAt) }}</span>
                    <span>•</span>
                    <span
                      class="px-1 rounded text-[9px] font-semibold uppercase"
                      :class="file.sender === 'PHONE' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'"
                    >
                      {{ file.sender === 'PHONE' ? '📱 Dari HP' : '💻 Dari PC' }}
                    </span>
                  </p>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-2 shrink-0">
                <a
                  :href="shareService.getDownloadUrl(file.id)"
                  download
                  class="flex items-center gap-1 rounded-md bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-1 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/30 transition"
                  title="Unduh file ke komputer"
                >
                  <span>⬇</span> Unduh
                </a>
                <button
                  type="button"
                  class="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:text-red-400 hover:bg-red-500/10 transition"
                  title="Hapus file"
                  @click="deleteFile(file.id, file.name)"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <!-- Tab Content 2: Live Clipboard & Text Sync -->
          <div v-else-if="activeTab === 'texts'" class="flex-1 p-4 flex flex-col space-y-4">
            <!-- Text Input Box -->
            <div class="space-y-2">
              <textarea
                v-model="newText"
                rows="3"
                placeholder="Ketik atau tempel teks / link URL di sini untuk langsung dikirim ke HP..."
                class="w-full rounded-lg border border-line bg-base p-3 text-xs text-ink outline-none placeholder:text-muted focus:border-cyan-500 transition resize-none"
                @keydown.ctrl.enter="submitText"
              ></textarea>
              <div class="flex items-center justify-between">
                <span class="text-[10px] text-muted">Tekan Ctrl+Enter untuk kirim</span>
                <button
                  type="button"
                  class="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-bold text-slate-900 hover:bg-cyan-400 transition disabled:opacity-50"
                  :disabled="!newText.trim() || isSubmittingText"
                  @click="submitText"
                >
                  {{ isSubmittingText ? 'Mengirim...' : 'Kirim ke HP 🚀' }}
                </button>
              </div>
            </div>

            <!-- Texts List -->
            <div class="flex-1 overflow-y-auto space-y-2.5 pr-1">
              <div v-if="texts.length === 0" class="h-40 flex flex-col items-center justify-center text-center text-muted text-xs">
                <span>💬 Belum ada pesan atau tautan.</span>
              </div>

              <div
                v-for="item in texts"
                :key="item.id"
                class="rounded-lg border border-line bg-base p-3 hover:border-cyan-500/40 transition space-y-1.5 group"
              >
                <div class="flex items-center justify-between text-[10px] text-muted">
                  <span
                    class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                    :class="item.sender === 'PHONE' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'"
                  >
                    {{ item.sender === 'PHONE' ? '📱 Dari HP' : '💻 Dari PC' }}
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="font-mono">{{ formatTime(item.createdAt) }}</span>
                    <button
                      type="button"
                      class="text-muted hover:text-red-400 transition"
                      title="Hapus"
                      @click="deleteText(item.id)"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div class="text-xs text-ink whitespace-pre-wrap break-words font-mono bg-panel p-2.5 rounded border border-line/60">
                  {{ item.content }}
                </div>

                <div class="flex justify-end pt-1">
                  <button
                    type="button"
                    class="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                    @click="copyToClipboard(item.content, 'Teks')"
                  >
                    📋 Salin Teks
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  </div>
</template>
