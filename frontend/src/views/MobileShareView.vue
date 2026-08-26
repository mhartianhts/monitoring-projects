<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { shareService } from "../services/share.service";
import type { ISharedFile, ISharedText } from "../types/share.types";
import { io, type Socket } from "socket.io-client";
import Swal from "sweetalert2";

const activeTab = ref<"upload" | "files" | "texts">("upload");
const files = ref<ISharedFile[]>([]);
const texts = ref<ISharedText[]>([]);
const loading = ref(true);

const uploading = ref(false);
const uploadProgress = ref(0);
const fileInputRef = ref<HTMLInputElement | null>(null);

const newText = ref("");
const isSubmittingText = ref(false);

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
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
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

const loadAll = async () => {
  loading.value = true;
  await Promise.all([loadFiles(), loadTexts()]);
  loading.value = false;
};

const handleFileInput = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) return;

  const fileList = target.files;
  uploading.value = true;
  uploadProgress.value = 0;

  try {
    for (let i = 0; i < fileList.length; i++) {
      await shareService.uploadFile(fileList[i], "PHONE");
      uploadProgress.value = Math.round(((i + 1) / fileList.length) * 100);
    }
    await loadFiles();
    Swal.fire({
      icon: "success",
      title: "Terkirim ke PC!",
      text: `${fileList.length} file berhasil terkirim ke komputer.`,
      timer: 1800,
      showConfirmButton: false,
      background: "#18181b",
      color: "#f4f4f5",
    });
    activeTab.value = "files";
  } catch (err: any) {
    Swal.fire({
      icon: "error",
      title: "Gagal Kirim",
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

const submitText = async () => {
  if (!newText.value.trim()) return;
  isSubmittingText.value = true;
  try {
    await shareService.addText(newText.value.trim(), "PHONE");
    newText.value = "";
    await loadTexts();
    Swal.fire({
      icon: "success",
      title: "Terkirim ke PC!",
      timer: 1200,
      showConfirmButton: false,
      background: "#18181b",
      color: "#f4f4f5",
    });
  } catch (err: any) {
    Swal.fire({ icon: "error", title: "Gagal", text: err.message, background: "#18181b", color: "#f4f4f5" });
  } finally {
    isSubmittingText.value = false;
  }
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    Swal.fire({
      icon: "success",
      title: "Disalin!",
      timer: 1200,
      showConfirmButton: false,
      background: "#18181b",
      color: "#f4f4f5",
    });
  } catch {
    // fallback
  }
};

onMounted(() => {
  void loadAll();

  // Connect socket
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
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
    <!-- Mobile App Header -->
    <header class="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-base shadow-sm">
          📱
        </div>
        <div>
          <h1 class="text-sm font-bold leading-tight">Local Share</h1>
          <p class="text-[10px] text-cyan-400 font-mono">Terhubung ke PC</p>
        </div>
      </div>
      <button
        type="button"
        class="rounded-lg bg-slate-800 p-2 text-xs text-slate-300 hover:text-white"
        @click="loadAll"
      >
        🔄
      </button>
    </header>

    <!-- Mobile Navigation Tab Bar -->
    <nav class="grid grid-cols-3 border-b border-slate-800 bg-slate-900/50 p-1 gap-1">
      <button
        type="button"
        class="py-2 text-xs font-bold rounded-lg transition text-center"
        :class="activeTab === 'upload' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'"
        @click="activeTab = 'upload'"
      >
        📤 Kirim ke PC
      </button>
      <button
        type="button"
        class="py-2 text-xs font-bold rounded-lg transition text-center relative"
        :class="activeTab === 'files' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'"
        @click="activeTab = 'files'"
      >
        📁 Dari PC ({{ files.length }})
      </button>
      <button
        type="button"
        class="py-2 text-xs font-bold rounded-lg transition text-center relative"
        :class="activeTab === 'texts' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'"
        @click="activeTab = 'texts'"
      >
        💬 Teks ({{ texts.length }})
      </button>
    </nav>

    <!-- Main Content Area -->
    <main class="flex-1 p-4 overflow-y-auto">
      <!-- 1. UPLOAD TAB -->
      <div v-if="activeTab === 'upload'" class="space-y-4">
        <div class="rounded-2xl border-2 border-dashed border-cyan-500/40 bg-slate-900/60 p-6 text-center space-y-4">
          <div class="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-400 text-3xl">
            📷
          </div>
          <div>
            <h2 class="text-base font-bold">Kirim File atau Foto</h2>
            <p class="text-xs text-slate-400 mt-1">
              Pilih foto dari galeri atau ambil foto langsung dari kamera untuk dikirim ke PC.
            </p>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            multiple
            class="hidden"
            @change="handleFileInput"
          />

          <button
            type="button"
            class="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 px-4 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 active:scale-98 transition"
            :disabled="uploading"
            @click="fileInputRef?.click()"
          >
            {{ uploading ? `Mengunggah... ${uploadProgress}%` : 'Pilih File / Buka Kamera' }}
          </button>

          <div v-if="uploading" class="space-y-1 pt-2">
            <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div class="h-full bg-cyan-400 transition-all" :style="{ width: `${uploadProgress}%` }"></div>
            </div>
          </div>
        </div>

        <!-- Quick Info Box -->
        <div class="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400 space-y-1.5">
          <p class="font-bold text-slate-200 flex items-center gap-1.5">
            <span>💡</span> Tips
          </p>
          <p>• File langsung masuk ke storage lokal PC tanpa lewat internet luar.</p>
          <p>• Kecepatan transfer secepat jaringan Wi-Fi lokal Anda.</p>
        </div>
      </div>

      <!-- 2. FILES TAB (Download dari PC) -->
      <div v-else-if="activeTab === 'files'" class="space-y-3">
        <div v-if="files.length === 0" class="py-16 text-center text-slate-500 space-y-2">
          <div class="text-4xl">📭</div>
          <p class="text-xs">Belum ada file di PC yang dibagikan.</p>
        </div>

        <div
          v-for="file in files"
          :key="file.id"
          class="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-xl shrink-0">
              📄
            </div>
            <div class="min-w-0">
              <p class="text-xs font-bold text-slate-100 truncate">{{ file.name }}</p>
              <p class="text-[10px] text-slate-400 font-mono mt-0.5">
                {{ formatBytes(file.size) }} • {{ formatTime(file.uploadedAt) }}
              </p>
            </div>
          </div>

          <a
            :href="shareService.getDownloadUrl(file.id)"
            download
            class="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 shrink-0 shadow active:scale-95"
          >
            <span>⬇</span> Unduh
          </a>
        </div>
      </div>

      <!-- 3. TEXTS / CLIPBOARD TAB -->
      <div v-else-if="activeTab === 'texts'" class="space-y-4">
        <!-- Send Text to PC Box -->
        <div class="space-y-2">
          <textarea
            v-model="newText"
            rows="3"
            placeholder="Ketik teks, URL website, atau nomor rekening untuk dikirim ke PC..."
            class="w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-cyan-500"
          ></textarea>
          <button
            type="button"
            class="w-full rounded-xl bg-cyan-500 py-2.5 text-xs font-bold text-slate-950 active:scale-98 disabled:opacity-50"
            :disabled="!newText.trim() || isSubmittingText"
            @click="submitText"
          >
            {{ isSubmittingText ? 'Mengirim...' : 'Kirim Teks ke PC 🚀' }}
          </button>
        </div>

        <!-- Texts List -->
        <div class="space-y-2.5 pt-2">
          <div v-if="texts.length === 0" class="py-8 text-center text-xs text-slate-500">
            Belum ada riwayat teks.
          </div>

          <div
            v-for="item in texts"
            :key="item.id"
            class="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2"
          >
            <div class="flex items-center justify-between text-[10px] text-slate-400">
              <span
                class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                :class="item.sender === 'PHONE' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'"
              >
                {{ item.sender === 'PHONE' ? '📱 Dari HP' : '💻 Dari PC' }}
              </span>
              <span class="font-mono">{{ formatTime(item.createdAt) }}</span>
            </div>

            <div class="text-xs text-slate-200 font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-800/80 whitespace-pre-wrap break-words">
              {{ item.content }}
            </div>

            <div class="flex justify-end">
              <button
                type="button"
                class="rounded-lg bg-slate-800 px-3 py-1 text-[11px] font-medium text-cyan-400 active:bg-slate-700"
                @click="copyToClipboard(item.content)"
              >
                📋 Salin Teks
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
