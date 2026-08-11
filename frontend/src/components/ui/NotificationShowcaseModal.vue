<script setup lang="ts">
import { ref } from "vue";
import { notify } from "../../services/notification.service";

const isOpen = ref(false);

const open = () => {
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const testSuccess = () => {
  notify.success("Berhasil Simpan!", "Data konfigurasi project telah berhasil disimpan.");
};

const testError = () => {
  notify.error("Terjadi Kesalahan!", "Gagal menghubungi service backend (HTTP 500).");
};

const testWarning = () => {
  notify.warning("Perhatian!", "Proses yang berjalan memerlukan resource CPU yang tinggi.");
};

const testInfo = () => {
  notify.info("Informasi Sistem", "Fitur AI Agent kini terintegrasi dengan Git repository Anda.");
};

const testConfirm = async () => {
  const confirmed = await notify.confirm(
    "Konfirmasi Tindakan",
    "Apakah Anda yakin ingin menghentikan seluruh proses project yang aktif?",
    "Ya, Hentikan",
    "Batal"
  );
  if (confirmed) {
    notify.toast("Tindakan dikonfirmasi!", "success");
  } else {
    notify.toast("Tindakan dibatalkan", "info");
  }
};

const testPrompt = async () => {
  const name = await notify.prompt(
    "Buat Branch Baru",
    "Masukkan nama branch Git yang ingin dibuat:",
    "feature/custom-alert",
    "ex: feature/sweet-alert"
  );
  if (name) {
    notify.success("Branch Dibuat", `Branch '${name}' berhasil dibuat.`);
  }
};

const testToast = (type: "success" | "error" | "warning" | "info") => {
  const msgs = {
    success: "Berhasil menyinkronkan data!",
    error: "Gagal memperbarui status!",
    warning: "Sinyal socket tidak stabil",
    info: "Log snapshot diperbarui",
  };
  notify.toast(msgs[type], type);
};

const testLoading = () => {
  notify.loading("Memproses Data...", "Sedang menggenerasi PDF dokumentasi AI...");
  setTimeout(() => {
    notify.close();
    notify.success("Selesai!", "Dokumentasi PDF berhasil digenerasi.");
  }, 2500);
};

defineExpose({ open, close });
</script>

<template>
  <button
    @click="open"
    class="flex items-center gap-1.5 rounded-md border border-line bg-elevated/80 px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-elevated hover:border-accent/40"
    title="Uji Notifikasi Custom SweetAlert"
  >
    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>
    <span>Alert Demo</span>
  </button>

  <!-- Modal Showcase -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="close"
    >
      <div class="w-full max-w-md rounded-xl border border-line bg-panel p-6 shadow-2xl">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <div class="flex items-center gap-2">
            <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </div>
            <h3 class="text-base font-semibold text-ink">Demo Notifikasi Custom</h3>
          </div>
          <button
            @click="close"
            class="rounded-lg p-1 text-muted hover:bg-elevated hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p class="mt-3 text-xs text-muted">
          Pilih tipe notifikasi SweetAlert custom di bawah untuk menguji tampilan dan perilakunya:
        </p>

        <div class="mt-4 grid grid-cols-2 gap-2.5">
          <button
            @click="testSuccess"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
          >
            <span>🟢 Alert Success</span>
          </button>
          <button
            @click="testError"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20"
          >
            <span>🔴 Alert Error</span>
          </button>
          <button
            @click="testWarning"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20"
          >
            <span>🟡 Alert Warning</span>
          </button>
          <button
            @click="testInfo"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-400 hover:bg-sky-500/20"
          >
            <span>🔵 Alert Info</span>
          </button>
          <button
            @click="testConfirm"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-medium text-teal-300 hover:bg-teal-500/20"
          >
            <span>❓ Confirm Dialog</span>
          </button>
          <button
            @click="testPrompt"
            class="flex items-center justify-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 hover:bg-purple-500/20"
          >
            <span>📝 Input Prompt</span>
          </button>
        </div>

        <div class="mt-4 border-t border-line pt-3">
          <p class="text-[11px] font-medium text-muted uppercase tracking-wider mb-2">Toast Notifications (Pojok Kanan)</p>
          <div class="flex gap-2">
            <button
              @click="testToast('success')"
              class="flex-1 rounded-md border border-line bg-elevated px-2 py-1.5 text-[11px] text-emerald-400 hover:border-emerald-500/40"
            >
              Toast Success
            </button>
            <button
              @click="testToast('error')"
              class="flex-1 rounded-md border border-line bg-elevated px-2 py-1.5 text-[11px] text-red-400 hover:border-red-500/40"
            >
              Toast Error
            </button>
            <button
              @click="testLoading"
              class="flex-1 rounded-md border border-line bg-elevated px-2 py-1.5 text-[11px] text-accent hover:border-accent/40"
            >
              ⏳ Loading
            </button>
          </div>
        </div>

        <div class="mt-5 flex justify-end">
          <button
            @click="close"
            class="rounded-lg border border-line bg-elevated px-4 py-1.5 text-xs font-medium text-ink hover:bg-line"
          >
            Tutup Demo
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
