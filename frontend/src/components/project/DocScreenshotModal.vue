<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { DocScreenshotSlot, GitDocJob } from "../../types/project";
import { notify } from "../../services/notification.service";

const props = defineProps<{
  show: boolean;
  job: GitDocJob | null;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  (e: "submit", payload: { formData: FormData; uploadedCount: number }): void;
  (e: "skip"): void;
  (e: "close"): void;
}>();

// State penyimpanan file per slot: Map<slotId, { file: File, previewUrl: string }>
const filesMap = ref<Record<string, { file: File; previewUrl: string }>>({});
const isDraggingSlot = ref<string | null>(null);

// State slot kustom yang ditambahkan manual oleh user
const customSlots = ref<DocScreenshotSlot[]>([]);

const allSlots = computed<DocScreenshotSlot[]>(() => {
  const aiSlots = props.job?.requestedScreenshots || [];
  return [...aiSlots, ...customSlots.value];
});

const uploadedCount = computed(() => {
  return Object.keys(filesMap.value).length;
});

// Bersihkan object URL saat modal ditutup atau slot berubah
const clearPreviews = () => {
  for (const item of Object.values(filesMap.value)) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
  filesMap.value = {};
  customSlots.value = [];
};

watch(
  () => props.show,
  (val) => {
    if (!val) {
      clearPreviews();
    }
  },
);

const handleFileSelect = (slotId: string, event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  assignFileToSlot(slotId, file);
  input.value = ""; // reset input
};

const assignFileToSlot = (slotId: string, file: File) => {
  if (!file.type.startsWith("image/")) {
    notify.error("Format File Tidak Didukung", "Harap unggah file gambar (PNG, JPG, JPEG, WEBP)");
    return;
  }

  // Revoke preview lama jika ada
  if (filesMap.value[slotId]?.previewUrl) {
    URL.revokeObjectURL(filesMap.value[slotId].previewUrl);
  }

  const previewUrl = URL.createObjectURL(file);
  filesMap.value = {
    ...filesMap.value,
    [slotId]: {
      file,
      previewUrl,
    },
  };
};

const removeFileFromSlot = (slotId: string) => {
  if (filesMap.value[slotId]?.previewUrl) {
    URL.revokeObjectURL(filesMap.value[slotId].previewUrl);
  }
  const next = { ...filesMap.value };
  delete next[slotId];
  filesMap.value = next;
};

// Tambah slot baru manual
const addCustomSlot = () => {
  const count = customSlots.value.length + 1;
  const newId = `custom_slot_${Date.now()}_${count}`;
  customSlots.value.push({
    id: newId,
    section: `Langkah Tambahan ${count}`,
    instruction: "Screenshot antarmuka pendukung tambahan pilihan Anda.",
    sampleCaption: `Tampilan Langkah Tambahan ${count}`,
  });
};

// Tambah multiple file sekaligus
const handleBatchUpload = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  const fileList = Array.from(input.files);
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file.type.startsWith("image/")) continue;

    const newId = `custom_slot_${Date.now()}_${i + 1}`;
    const cleanFileName = file.name.replace(/\.[^/.]+$/, "").replace(/[_\-]/g, " ");

    customSlots.value.push({
      id: newId,
      section: `Langkah: ${cleanFileName}`,
      instruction: "Screenshot yang diunggah secara batch.",
      sampleCaption: cleanFileName,
    });

    const previewUrl = URL.createObjectURL(file);
    filesMap.value = {
      ...filesMap.value,
      [newId]: {
        file,
        previewUrl,
      },
    };
  }

  input.value = "";
  notify.toast(`${fileList.length} screenshot berhasil ditambahkan`, "success");
};

// Hapus slot kustom
const removeCustomSlot = (slotId: string) => {
  removeFileFromSlot(slotId);
  customSlots.value = customSlots.value.filter((s) => s.id !== slotId);
};

const onDragOver = (slotId: string, e: DragEvent) => {
  e.preventDefault();
  isDraggingSlot.value = slotId;
};

const onDragLeave = (slotId: string, e: DragEvent) => {
  e.preventDefault();
  if (isDraggingSlot.value === slotId) {
    isDraggingSlot.value = null;
  }
};

const onDrop = (slotId: string, e: DragEvent) => {
  e.preventDefault();
  isDraggingSlot.value = null;
  if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
  const file = e.dataTransfer.files[0];
  assignFileToSlot(slotId, file);
};

const handleSubmit = () => {
  const formData = new FormData();
  const slotsMeta = [];

  for (const slot of allSlots.value) {
    const uploaded = filesMap.value[slot.id];
    if (uploaded) {
      formData.append(`screenshot_${slot.id}`, uploaded.file, uploaded.file.name);
      slotsMeta.push({
        id: slot.id,
        section: slot.section,
        sampleCaption: slot.sampleCaption,
      });
    }
  }

  formData.append("slots", JSON.stringify(slotsMeta));
  emit("submit", { formData, uploadedCount: uploadedCount.value });
};

const handleSkip = () => {
  emit("skip");
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
    @click.self="emit('close')"
  >
    <div
      class="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-panel shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b border-line bg-panel/90 px-6 py-4">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent text-lg">
            📸
          </div>
          <div>
            <h3 class="text-base font-bold text-ink">Permintaan Screenshot Dokumentasi AI</h3>
            <p class="text-xs text-muted mt-0.5">
              Unggah gambar antarmuka pendukung tanpa batasan untuk menyempurnakan User Guide.
            </p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-muted hover:text-ink hover:border-accent transition cursor-pointer"
          :disabled="submitting"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body (List Screenshot Slots) -->
      <div class="flex-1 overflow-y-auto p-6 space-y-5 bg-base/40">
        <div class="rounded-lg border border-accent/30 bg-accent/5 p-3.5 text-xs text-ink/90 flex items-start gap-2.5">
          <span class="text-base shrink-0">💡</span>
          <div class="flex-1">
            <p class="font-medium text-accent">Petunjuk Pengisian & Fleksibilitas:</p>
            <p class="mt-0.5 text-muted leading-relaxed">
              Anda dapat mengunggah screenshot pada slot yang direkomendasikan AI di bawah, atau menambahkan screenshot custom tambahan sebanyak yang diinginkan.
            </p>
          </div>
        </div>

        <div class="space-y-4">
          <div
            v-for="(slot, idx) in allSlots"
            :key="slot.id"
            class="rounded-lg border border-line bg-panel p-4 shadow-2xs transition hover:border-line-hover"
          >
            <!-- Slot Header -->
            <div class="flex items-start justify-between gap-3 mb-2.5">
              <div class="flex items-center gap-2 flex-1">
                <span
                  class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent"
                >
                  {{ idx + 1 }}
                </span>
                <input
                  v-if="slot.id.startsWith('custom_slot_')"
                  v-model="slot.section"
                  type="text"
                  class="text-xs font-bold text-ink bg-base/70 border border-line rounded px-2 py-0.5 w-full max-w-sm focus:border-accent outline-hidden"
                  placeholder="Nama Langkah / Fitur"
                />
                <h4 v-else class="text-xs font-bold text-ink">{{ slot.section }}</h4>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <span
                  v-if="filesMap[slot.id]"
                  class="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  ✓ Siap Disematkan
                </span>
                <span
                  v-else
                  class="inline-flex items-center rounded bg-muted/10 px-2 py-0.5 text-[10px] font-medium text-muted"
                >
                  Opsional
                </span>

                <button
                  v-if="slot.id.startsWith('custom_slot_')"
                  type="button"
                  class="text-xs text-muted hover:text-stopped transition cursor-pointer px-1"
                  title="Hapus slot ini"
                  @click="removeCustomSlot(slot.id)"
                >
                  🗑️
                </button>
              </div>
            </div>

            <!-- AI Instruction Box -->
            <div class="mb-3 rounded border border-line/60 bg-base p-2.5 text-xs">
              <p class="font-medium text-ink/90">{{ slot.instruction }}</p>
              <div class="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                <span>Caption:</span>
                <input
                  v-model="slot.sampleCaption"
                  type="text"
                  class="bg-panel border border-line/60 rounded px-1.5 py-0.5 text-[11px] text-ink w-full max-w-xs focus:border-accent outline-hidden"
                  placeholder="Keterangan gambar..."
                />
              </div>
            </div>

            <!-- Dropzone / Upload Area -->
            <div>
              <!-- Already Uploaded Preview State -->
              <div
                v-if="filesMap[slot.id]"
                class="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <img
                    :src="filesMap[slot.id].previewUrl"
                    alt="Preview"
                    class="h-14 w-20 shrink-0 rounded object-cover border border-line shadow-2xs bg-black/10"
                  />
                  <div class="min-w-0">
                    <p class="text-xs font-semibold text-ink truncate">
                      {{ filesMap[slot.id].file.name }}
                    </p>
                    <p class="text-[11px] text-muted">
                      {{ formatFileSize(filesMap[slot.id].file.size) }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <label
                    :for="`file-input-${slot.id}`"
                    class="cursor-pointer rounded border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-ink hover:border-accent transition"
                  >
                    Ganti
                  </label>
                  <button
                    type="button"
                    class="cursor-pointer rounded border border-line bg-panel px-2.5 py-1 text-[11px] font-medium text-stopped hover:bg-stopped/10 transition"
                    @click="removeFileFromSlot(slot.id)"
                  >
                    Hapus
                  </button>
                </div>
              </div>

              <!-- Empty Dropzone State -->
              <label
                v-else
                :for="`file-input-${slot.id}`"
                class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition"
                :class="[
                  isDraggingSlot === slot.id
                    ? 'border-accent bg-accent/10'
                    : 'border-line hover:border-accent hover:bg-elevated/40',
                ]"
                @dragover="onDragOver(slot.id, $event)"
                @dragleave="onDragLeave(slot.id, $event)"
                @drop="onDrop(slot.id, $event)"
              >
                <span class="text-xl mb-1">🖼️</span>
                <p class="text-xs font-medium text-ink">
                  Klik untuk unggah atau seret file gambar ke sini
                </p>
                <p class="text-[10px] text-muted mt-0.5">Mendukung PNG, JPG, JPEG, WEBP</p>
              </label>

              <input
                :id="`file-input-${slot.id}`"
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/webp"
                class="hidden"
                @change="handleFileSelect(slot.id, $event)"
              />
            </div>
          </div>
        </div>

        <!-- Custom Slot / Batch Upload Actions -->
        <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-dashed border-accent/50 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/10 transition"
              @click="addCustomSlot"
            >
              <span>➕</span>
              <span>Tambah Slot Screenshot Baru</span>
            </button>

            <label
              for="batch-file-input"
              class="cursor-pointer inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-medium text-ink hover:border-accent hover:bg-elevated/50 transition"
            >
              <span>📁</span>
              <span>Unggah Banyak Gambar Sekaligus</span>
            </label>
            <input
              id="batch-file-input"
              type="file"
              multiple
              accept="image/png, image/jpeg, image/jpg, image/webp"
              class="hidden"
              @change="handleBatchUpload"
            />
          </div>

          <span class="text-xs text-muted">
            Total: {{ uploadedCount }} gambar siap disematkan
          </span>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex items-center justify-between border-t border-line bg-panel px-6 py-4">
        <button
          type="button"
          class="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink hover:border-line-hover transition cursor-pointer"
          :disabled="submitting"
          @click="handleSkip"
        >
          Lewati Semua (Buat PDF Tanpa Gambar)
        </button>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-line-hover transition cursor-pointer"
            :disabled="submitting"
            @click="emit('close')"
          >
            Batal
          </button>
          <button
            type="button"
            class="cursor-pointer flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition disabled:opacity-50 shadow-xs"
            :disabled="submitting"
            @click="handleSubmit"
          >
            <span v-if="submitting" class="inline-block animate-spin">⏳</span>
            <span>
              {{ submitting ? 'Memproses...' : `Lanjutkan & Buat PDF (${uploadedCount} Gambar)` }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

