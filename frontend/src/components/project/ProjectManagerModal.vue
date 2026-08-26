<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { api } from "../../services/api";
import { notify } from "../../services/notification.service";
import type { AvailableFolder, ManagedProject } from "../../types/project";

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "updated"): void;
}>();

const activeTab = ref<"scan" | "custom" | "managed">("scan");
const loading = ref(false);
const saving = ref(false);
const search = ref("");
const availableFolders = ref<AvailableFolder[]>([]);
const managedProjects = ref<ManagedProject[]>([]);

// State untuk checkbox selection di Tab 1
const selectedFolderPaths = ref<Set<string>>(new Set());

// State untuk form Tambah Projek Kustom di Tab 2
const customForm = ref({
  id: "",
  name: "",
  path: "",
  type: "node",
  start: "npm run dev",
  stop: "",
  port: "" as number | string,
  url: "",
  cwd: ".",
});

// State untuk edit projek di Tab 3
const editingProjectId = ref<string | null>(null);
const editForm = ref<Partial<ManagedProject>>({});

const loadAvailableFolders = async () => {
  loading.value = true;
  try {
    const folders = await api.getAvailableFolders();
    availableFolders.value = folders;
    
    // Set checked state berdasarkan folder yang sudah enabled atau isManaged
    const selected = new Set<string>();
    for (const folder of folders) {
      if (folder.enabled) {
        selected.add(folder.path);
      }
    }
    selectedFolderPaths.value = selected;
  } catch (err) {
    notify.error("Gagal memuat daftar folder", err instanceof Error ? err.message : undefined);
  } finally {
    loading.value = false;
  }
};

const loadManagedProjects = async () => {
  loading.value = true;
  try {
    const data = await api.getManagedProjects();
    managedProjects.value = data.projects;
  } catch (err) {
    notify.error("Gagal memuat projek tersimpan", err instanceof Error ? err.message : undefined);
  } finally {
    loading.value = false;
  }
};

const refreshAll = async () => {
  if (activeTab.value === "scan") {
    await loadAvailableFolders();
  } else if (activeTab.value === "managed") {
    await loadManagedProjects();
  }
};

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      void refreshAll();
    }
  },
  { immediate: true },
);

watch(activeTab, () => {
  void refreshAll();
});

const filteredFolders = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return availableFolders.value;
  return availableFolders.value.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.folderName.toLowerCase().includes(q) ||
      f.type.toLowerCase().includes(q) ||
      f.path.toLowerCase().includes(q),
  );
});

const toggleFolder = (folderPath: string) => {
  const next = new Set(selectedFolderPaths.value);
  if (next.has(folderPath)) {
    next.delete(folderPath);
  } else {
    next.add(folderPath);
  }
  selectedFolderPaths.value = next;
};

const selectAll = () => {
  const next = new Set(selectedFolderPaths.value);
  for (const folder of filteredFolders.value) {
    next.add(folder.path);
  }
  selectedFolderPaths.value = next;
};

const deselectAll = () => {
  const next = new Set(selectedFolderPaths.value);
  for (const folder of filteredFolders.value) {
    next.delete(folder.path);
  }
  selectedFolderPaths.value = next;
};

// Simpan pilihan folder (Tab 1)
const saveFolderSelection = async () => {
  saving.value = true;
  try {
    const payload = availableFolders.value.map((f) => ({
      path: f.path,
      enabled: selectedFolderPaths.value.has(f.path),
      name: f.name,
      type: f.type,
      start: f.start || undefined,
      port: f.port ?? undefined,
      stop: f.stop || undefined,
      url: f.url || undefined,
      cwd: f.cwd || undefined,
    }));

    await api.syncSelectedFolders(payload);
    notify.success("Daftar projek aktif berhasil diperbarui");
    emit("updated");
    emit("close");
  } catch (err) {
    notify.error("Gagal menyimpan pilihan projek", err instanceof Error ? err.message : undefined);
  } finally {
    saving.value = false;
  }
};

// Simpan projek kustom manual (Tab 2)
const submitCustomProject = async () => {
  if (!customForm.value.path.trim()) {
    notify.warning("Path folder projek wajib diisi");
    return;
  }
  if (!customForm.value.start.trim()) {
    notify.warning("Perintah start wajib diisi");
    return;
  }

  saving.value = true;
  try {
    await api.addCustomProject({
      id: customForm.value.id.trim() || undefined,
      name: customForm.value.name.trim() || undefined,
      path: customForm.value.path.trim(),
      type: customForm.value.type,
      start: customForm.value.start.trim(),
      stop: customForm.value.stop.trim() || null,
      port: customForm.value.port ? Number(customForm.value.port) : null,
      url: customForm.value.url.trim() || null,
      cwd: customForm.value.cwd.trim() || ".",
      enabled: true,
    });

    notify.success("Projek kustom berhasil ditambahkan");
    // Reset form
    customForm.value = {
      id: "",
      name: "",
      path: "",
      type: "node",
      start: "npm run dev",
      stop: "",
      port: "",
      url: "",
      cwd: ".",
    };
    emit("updated");
    activeTab.value = "managed";
  } catch (err) {
    notify.error("Gagal menambahkan projek kustom", err instanceof Error ? err.message : undefined);
  } finally {
    saving.value = false;
  }
};

// Toggle enable/disable di Tab 3
const toggleProjectEnabled = async (project: ManagedProject) => {
  try {
    await api.updateManagedProject(project.id, {
      enabled: !project.enabled,
    });
    project.enabled = !project.enabled;
    notify.info(`Projek ${project.name} ${project.enabled ? 'diaktifkan' : 'dinonaktifkan'}`);
    emit("updated");
  } catch (err) {
    notify.error("Gagal mengubah status projek", err instanceof Error ? err.message : undefined);
  }
};

// Mulai edit projek di Tab 3
const startEditProject = (project: ManagedProject) => {
  editingProjectId.value = project.id;
  editForm.value = { ...project };
};

const cancelEdit = () => {
  editingProjectId.value = null;
  editForm.value = {};
};

const saveEditProject = async (id: string) => {
  saving.value = true;
  try {
    const updated = await api.updateManagedProject(id, editForm.value);
    const idx = managedProjects.value.findIndex((p) => p.id === id);
    if (idx >= 0) {
      managedProjects.value[idx] = updated;
    }
    notify.success("Konfigurasi projek berhasil disimpan");
    editingProjectId.value = null;
    emit("updated");
  } catch (err) {
    notify.error("Gagal menyimpan perubahan projek", err instanceof Error ? err.message : undefined);
  } finally {
    saving.value = false;
  }
};

// Hapus projek dari monitoring di Tab 3
const removeProject = async (id: string, name: string) => {
  if (!confirm(`Hapus projek "${name}" dari monitoring? (File di disk tidak akan dihapus)`)) {
    return;
  }
  try {
    await api.removeManagedProject(id);
    managedProjects.value = managedProjects.value.filter((p) => p.id !== id);
    notify.success(`Projek ${name} dihapus dari monitoring`);
    emit("updated");
  } catch (err) {
    notify.error("Gagal menghapus projek", err instanceof Error ? err.message : undefined);
  }
};

const getTypeBadgeClass = (type: string) => {
  switch (type.toLowerCase()) {
    case "vue":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "react":
    case "next":
      return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    case "node":
      return "bg-lime-500/15 text-lime-400 border-lime-500/30";
    case "php":
      return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
    case "python":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "docker":
      return "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    default:
      return "bg-muted/15 text-muted border-muted/30";
  }
};
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in"
    @click.self="emit('close')"
  >
    <div
      class="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden animate-scale-up"
    >
      <!-- Header Modal -->
      <div class="flex items-center justify-between border-b border-line px-6 py-4 bg-elevated/40">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dim text-lg shadow-sm">
            ⚙️
          </div>
          <div>
            <h2 class="text-base font-bold text-ink">Kelola & Pilih Projek</h2>
            <p class="text-xs text-muted">
              Pilih projek mana saja yang ingin ditampilkan dan dipantau di dashboard
            </p>
          </div>
        </div>

        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-panel text-muted hover:bg-elevated hover:text-ink transition"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex items-center justify-between border-b border-line px-6 bg-base/50">
        <div class="flex gap-2">
          <button
            type="button"
            class="flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition"
            :class="
              activeTab === 'scan'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            "
            @click="activeTab = 'scan'"
          >
            <span>📁</span>
            <span>Pilih dari Root Folder (Checklist)</span>
            <span class="rounded-full bg-line px-2 py-0.5 text-[10px] text-muted">
              {{ availableFolders.length }}
            </span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition"
            :class="
              activeTab === 'custom'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            "
            @click="activeTab = 'custom'"
          >
            <span>➕</span>
            <span>Tambah Projek Kustom (Manual Path)</span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition"
            :class="
              activeTab === 'managed'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-ink'
            "
            @click="activeTab = 'managed'"
          >
            <span>📋</span>
            <span>Daftar Projek Tersimpan</span>
            <span class="rounded-full bg-line px-2 py-0.5 text-[10px] text-muted">
              {{ managedProjects.length }}
            </span>
          </button>
        </div>

        <button
          type="button"
          class="text-xs text-muted hover:text-accent flex items-center gap-1.5 py-1 px-2.5 rounded-md hover:bg-elevated transition"
          :disabled="loading"
          @click="refreshAll"
        >
          <span :class="{ 'animate-spin': loading }">🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      <!-- Tab Content Area -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- ================= TAB 1: SCAN ROOT FOLDERS ================= -->
        <div v-if="activeTab === 'scan'" class="space-y-4">
          <!-- Filter & Action Toolbar -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="relative flex-1 min-w-[260px]">
              <input
                v-model="search"
                type="search"
                placeholder="Cari folder berdasarkan nama, framework, atau path..."
                class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs text-ink placeholder:text-muted focus:border-accent outline-none"
              />
              <span v-if="search" class="absolute right-3 top-2.5 cursor-pointer text-xs text-muted" @click="search = ''">✕</span>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:border-accent/40 transition"
                @click="selectAll"
              >
                Pilih Semua
              </button>
              <button
                type="button"
                class="rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-muted hover:text-ink hover:border-line transition"
                @click="deselectAll"
              >
                Batal Semua
              </button>
              <span class="text-xs font-semibold text-accent px-2">
                {{ selectedFolderPaths.size }} dipilih
              </span>
            </div>
          </div>

          <!-- Loading State -->
          <div v-if="loading" class="flex flex-col items-center justify-center py-16 text-muted">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3"></div>
            <p class="text-xs">Memindai folder projek...</p>
          </div>

          <!-- Empty State -->
          <div v-else-if="filteredFolders.length === 0" class="flex flex-col items-center justify-center py-16 text-muted border border-dashed border-line rounded-xl">
            <span class="text-3xl mb-2">📂</span>
            <p class="text-xs font-medium">Tidak ada folder yang cocok</p>
          </div>

          <!-- List of Folders with Checkboxes -->
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="folder in filteredFolders"
              :key="folder.path"
              class="group relative flex items-start gap-3 rounded-xl border p-3.5 transition cursor-pointer"
              :class="
                selectedFolderPaths.has(folder.path)
                  ? 'border-accent/50 bg-accent/5 shadow-xs'
                  : 'border-line bg-elevated/40 hover:border-line/80 hover:bg-elevated/70'
              "
              @click="toggleFolder(folder.path)"
            >
              <!-- Checkbox -->
              <input
                type="checkbox"
                :checked="selectedFolderPaths.has(folder.path)"
                class="mt-1 h-4 w-4 rounded border-line text-accent focus:ring-accent accent-accent cursor-pointer"
                @click.stop="toggleFolder(folder.path)"
              />

              <!-- Folder Details -->
              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-semibold text-xs text-ink truncate group-hover:text-accent transition-colors">
                    {{ folder.name }}
                  </span>
                  <span
                    class="rounded-md border px-2 py-0.5 text-[10px] font-mono font-medium uppercase shrink-0"
                    :class="getTypeBadgeClass(folder.type)"
                  >
                    {{ folder.type }}
                  </span>
                </div>

                <p class="text-[11px] font-mono text-muted truncate" :title="folder.path">
                  {{ folder.path }}
                </p>

                <div class="flex items-center gap-2 text-[10px] text-muted pt-1">
                  <span v-if="folder.start" class="truncate bg-base/80 px-1.5 py-0.5 rounded font-mono">
                    ▶ {{ folder.start }}
                  </span>
                  <span v-if="folder.port" class="bg-base/80 px-1.5 py-0.5 rounded font-mono text-accent">
                    :{{ folder.port }}
                  </span>
                  <span
                    v-if="folder.configSource === 'file'"
                    class="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded ml-auto"
                    title="Config manual dari project.config.json"
                  >
                    JSON Config
                  </span>
                  <span
                    v-else-if="folder.configSource === 'auto'"
                    class="text-[9px] text-sky-400 bg-sky-500/10 px-1 py-0.5 rounded ml-auto"
                    title="Otomatis terdeteksi framework"
                  >
                    Auto-Detected
                  </span>
                  <span
                    v-else
                    class="text-[9px] text-warn bg-warn/10 px-1 py-0.5 rounded ml-auto"
                  >
                    No Config
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ================= TAB 2: TAMBAH PROJEK KUSTOM ================= -->
        <div v-else-if="activeTab === 'custom'" class="max-w-2xl mx-auto space-y-5">
          <div class="rounded-xl border border-line bg-elevated/40 p-4 space-y-1">
            <h3 class="text-xs font-bold text-ink">Tambah Projek dari Direktori Mana Saja</h3>
            <p class="text-xs text-muted">
              Gunakan form ini untuk memonitor projek yang lokasinya berada di luar root default (misal di drive C:\, XAMPP, atau repositori terpisah).
            </p>
          </div>

          <form class="space-y-4" @submit.prevent="submitCustomProject">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-muted mb-1.5">Nama Projek</label>
                <input
                  v-model="customForm.name"
                  type="text"
                  placeholder="Contoh: DMS 2024 Cery"
                  class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs text-ink placeholder:text-muted focus:border-accent outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-muted mb-1.5">ID Projek (Opsional)</label>
                <input
                  v-model="customForm.id"
                  type="text"
                  placeholder="Contoh: dms2024cery"
                  class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs text-ink placeholder:text-muted focus:border-accent outline-none"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-muted mb-1.5">
                Path Direktori Projek <span class="text-stopped">*</span>
              </label>
              <input
                v-model="customForm.path"
                type="text"
                required
                placeholder="Contoh: C:\xampp\htdocs\dms2024cery atau D:\other\my-app"
                class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-accent outline-none"
              />
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label class="block text-xs font-semibold text-muted mb-1.5">Tipe Framework</label>
                <select
                  v-model="customForm.type"
                  class="w-full rounded-xl border border-line bg-base px-3 py-2 text-xs text-ink focus:border-accent outline-none"
                >
                  <option value="node">Node.js / Express</option>
                  <option value="vue">Vue / Nuxt / Vite</option>
                  <option value="react">React / Next.js</option>
                  <option value="php">PHP / Laravel</option>
                  <option value="python">Python / FastAPI</option>
                  <option value="docker">Docker Compose</option>
                  <option value="custom">Custom Process</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-semibold text-muted mb-1.5">Port (Opsional)</label>
                <input
                  v-model="customForm.port"
                  type="number"
                  placeholder="3000, 8000, 5173"
                  class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-accent outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-muted mb-1.5">CWD (Working Dir)</label>
                <input
                  v-model="customForm.cwd"
                  type="text"
                  placeholder="."
                  class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-accent outline-none"
                />
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-muted mb-1.5">
                  Perintah Start <span class="text-stopped">*</span>
                </label>
                <input
                  v-model="customForm.start"
                  type="text"
                  required
                  placeholder="npm run dev, docker compose up, python main.py"
                  class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-accent outline-none"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-muted mb-1.5">Perintah Stop (Opsional)</label>
                <input
                  v-model="customForm.stop"
                  type="text"
                  placeholder="docker compose down (kosongkan jika via SIGINT)"
                  class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-accent outline-none"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-muted mb-1.5">Custom URL Browser (Opsional)</label>
              <input
                v-model="customForm.url"
                type="text"
                placeholder="http://localhost/dms2024cery (kosongkan jika otomatis via port)"
                class="w-full rounded-xl border border-line bg-base px-3.5 py-2 text-xs font-mono text-ink placeholder:text-muted focus:border-accent outline-none"
              />
            </div>

            <div class="pt-3">
              <button
                type="submit"
                class="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-dim py-2.5 text-xs font-bold text-base shadow-md hover:brightness-110 transition disabled:opacity-50"
                :disabled="saving"
              >
                <span>{{ saving ? "Menyimpan..." : "➕ Simpan & Tambahkan ke Monitoring" }}</span>
              </button>
            </div>
          </form>
        </div>

        <!-- ================= TAB 3: MANAGED PROJECTS LIST ================= -->
        <div v-else-if="activeTab === 'managed'" class="space-y-4">
          <div v-if="loading" class="flex flex-col items-center justify-center py-16 text-muted">
            <div class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3"></div>
            <p class="text-xs">Memuat daftar projek...</p>
          </div>

          <div v-else-if="managedProjects.length === 0" class="flex flex-col items-center justify-center py-16 text-muted border border-dashed border-line rounded-xl">
            <span class="text-3xl mb-2">📦</span>
            <p class="text-xs font-medium">Belum ada projek yang tersimpan di whitelist</p>
            <p class="text-[11px] text-muted mt-1">Pilih folder di Tab 1 atau Tambah Projek Kustom di Tab 2</p>
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="proj in managedProjects"
              :key="proj.id"
              class="rounded-xl border border-line bg-elevated/40 p-4 transition hover:border-line/80 space-y-3"
            >
              <!-- View Mode -->
              <div v-if="editingProjectId !== proj.id" class="flex items-center justify-between gap-4">
                <div class="min-w-0 flex-1 space-y-1">
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-xs text-ink truncate">{{ proj.name }}</span>
                    <span
                      class="rounded-md border px-2 py-0.5 text-[10px] font-mono font-medium uppercase"
                      :class="getTypeBadgeClass(proj.type)"
                    >
                      {{ proj.type }}
                    </span>
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      :class="proj.enabled ? 'bg-running/15 text-running' : 'bg-stopped/15 text-stopped'"
                    >
                      {{ proj.enabled ? 'Aktif' : 'Nonaktif' }}
                    </span>
                  </div>

                  <p class="text-[11px] font-mono text-muted truncate">{{ proj.path }}</p>

                  <div class="flex items-center gap-2 text-[10px] text-muted pt-0.5">
                    <span class="bg-base px-2 py-0.5 rounded font-mono">▶ {{ proj.start }}</span>
                    <span v-if="proj.port" class="bg-base px-2 py-0.5 rounded font-mono text-accent">:{{ proj.port }}</span>
                  </div>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    class="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-muted hover:text-ink transition"
                    :title="proj.enabled ? 'Sembunyikan dari Dashboard' : 'Tampilkan di Dashboard'"
                    @click="toggleProjectEnabled(proj)"
                  >
                    {{ proj.enabled ? '👁️ Aktif' : '🙈 Tersembunyi' }}
                  </button>

                  <button
                    type="button"
                    class="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-muted hover:text-accent transition"
                    title="Edit Konfigurasi"
                    @click="startEditProject(proj)"
                  >
                    ✏️ Edit
                  </button>

                  <button
                    type="button"
                    class="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-muted hover:text-stopped transition"
                    title="Hapus dari Monitoring"
                    @click="removeProject(proj.id, proj.name)"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <!-- Inline Edit Form -->
              <div v-else class="space-y-3 pt-1">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[10px] font-semibold text-muted mb-1">Nama Projek</label>
                    <input
                      v-model="editForm.name"
                      type="text"
                      class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs text-ink focus:border-accent outline-none"
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] font-semibold text-muted mb-1">Tipe Framework</label>
                    <input
                      v-model="editForm.type"
                      type="text"
                      class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs text-ink focus:border-accent outline-none"
                    />
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label class="block text-[10px] font-semibold text-muted mb-1">Perintah Start</label>
                    <input
                      v-model="editForm.start"
                      type="text"
                      class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs font-mono text-ink focus:border-accent outline-none"
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] font-semibold text-muted mb-1">Perintah Stop</label>
                    <input
                      v-model="editForm.stop"
                      type="text"
                      class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs font-mono text-ink focus:border-accent outline-none"
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] font-semibold text-muted mb-1">Port</label>
                    <input
                      v-model="editForm.port"
                      type="number"
                      class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs font-mono text-ink focus:border-accent outline-none"
                    />
                  </div>
                </div>

                <div class="flex items-center justify-end gap-2 pt-2 border-t border-line">
                  <button
                    type="button"
                    class="rounded-lg border border-line bg-panel px-3 py-1 text-xs text-muted hover:text-ink"
                    @click="cancelEdit"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-accent px-3.5 py-1 text-xs font-bold text-base hover:brightness-110"
                    :disabled="saving"
                    @click="saveEditProject(proj.id)"
                  >
                    {{ saving ? "Menyimpan..." : "Simpan Perubahan" }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Modal (Tab 1 Action) -->
      <div
        v-if="activeTab === 'scan'"
        class="flex items-center justify-between border-t border-line px-6 py-4 bg-elevated/40"
      >
        <div class="text-xs text-muted">
          {{ selectedFolderPaths.size }} folder terpilih untuk dimonitor
        </div>

        <div class="flex items-center gap-3">
          <button
            type="button"
            class="rounded-xl border border-line bg-panel px-4 py-2 text-xs font-semibold text-muted hover:bg-elevated hover:text-ink transition"
            @click="emit('close')"
          >
            Batal
          </button>

          <button
            type="button"
            class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-dim px-5 py-2 text-xs font-bold text-base shadow-md hover:brightness-110 transition disabled:opacity-50"
            :disabled="saving"
            @click="saveFolderSelection"
          >
            <span>{{ saving ? "Menyimpan..." : "💾 Terapkan Pilihan Projek" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
