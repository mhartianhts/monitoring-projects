<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import type {
  EnvFilesResponse,
  EnvFileContentResponse,
  EnvCompareResponse,
} from "../types/env";

const projectStore = useProjectStore();
const { selectedId, selected } = storeToRefs(projectStore);

// State
const loadingFiles = ref(false);
const loadingContent = ref(false);
const saving = ref(false);
const syncing = ref(false);

const filesData = ref<EnvFilesResponse | null>(null);
const selectedFilename = ref<string>(".env");
const fileContent = ref<EnvFileContentResponse | null>(null);
const rawEditorText = ref<string>("");

// Active Tab
const activeTab = ref<"visual" | "raw" | "doctor">("visual");

// Visual Editor State
const searchQuery = ref("");
const visualFilter = ref<"all" | "secrets" | "placeholders" | "configured">("all");
const unmaskedKeys = ref<Set<string>>(new Set());
const globalUnmask = ref(false);

// Editable KV entries in visual mode
interface VisualKvItem {
  id: string;
  key: string;
  value: string;
  inlineComment: string;
  isSecret: boolean;
  isPlaceholder: boolean;
  originalKey: string;
}
const visualKvList = ref<VisualKvItem[]>([]);

// New Variable Form State
const showAddModal = ref(false);
const newVarKey = ref("");
const newVarValue = ref("");
const newVarComment = ref("");

// Env Doctor / Diff Checker State
const baseCompareFile = ref<string>(".env.example");
const targetCompareFile = ref<string>(".env");
const compareData = ref<EnvCompareResponse | null>(null);
const loadingCompare = ref(false);
const selectedMissingKeys = ref<Set<string>>(new Set());

// Create Profile Modal State
const showCreateModal = ref(false);
const newProfileName = ref("");
const newProfileCopyFrom = ref<string>(".env.example");

// Detect variable type helper
const detectVarType = (key: string, value: string) => {
  const upper = key.toUpperCase();
  if (/SECRET|PASSWORD|PASS|KEY|TOKEN|AUTH|CREDENTIAL|PRIVATE|DB_PASS|APIKEY|API_KEY/i.test(upper)) {
    return { label: "SECRET", color: "bg-stopped/20 text-stopped border-stopped/30" };
  }
  if (/URL|URI|ENDPOINT|HOST/i.test(upper) || /https?:\/\//.test(value)) {
    return { label: "URL", color: "bg-accent/20 text-accent border-accent/30" };
  }
  if (/PORT/i.test(upper) || /^\d+$/.test(value)) {
    return { label: "NUMBER", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" };
  }
  if (/ENABLE|DISABLE|DEBUG|BOOL|TRUE|FALSE/i.test(upper) || /^(true|false|1|0)$/i.test(value)) {
    return { label: "BOOL", color: "bg-warn/20 text-warn border-warn/30" };
  }
  return { label: "STRING", color: "bg-muted/20 text-muted border-muted/30" };
};

// Filtered Visual KV list
const filteredKvList = computed(() => {
  let list = visualKvList.value;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter(
      (item) =>
        item.key.toLowerCase().includes(q) ||
        item.value.toLowerCase().includes(q) ||
        item.inlineComment.toLowerCase().includes(q)
    );
  }

  if (visualFilter.value === "secrets") {
    list = list.filter((item) => item.isSecret);
  } else if (visualFilter.value === "placeholders") {
    list = list.filter((item) => item.isPlaceholder);
  } else if (visualFilter.value === "configured") {
    list = list.filter((item) => !item.isPlaceholder && item.value.trim().length > 0);
  }

  return list;
});

// Load all env files for selected project
const loadFiles = async () => {
  if (!selectedId.value) return;
  loadingFiles.value = true;
  try {
    const res = await api.getEnvFiles(selectedId.value);
    filesData.value = res;

    // Check if currently selected file still exists, or default to .env or first file
    const exists = res.files.some((f) => f.name === selectedFilename.value);
    if (!exists) {
      selectedFilename.value = res.hasEnv ? ".env" : res.files[0]?.name || ".env";
    }

    if (res.hasExample) {
      baseCompareFile.value = ".env.example";
    } else if (res.files.length > 1) {
      baseCompareFile.value = res.files.find((f) => f.name !== ".env")?.name || res.files[0].name;
    }

    await loadFileContent();
  } catch (err: any) {
    notify.toastError(err.message || "Gagal memuat daftar file .env");
  } finally {
    loadingFiles.value = false;
  }
};

// Load content of selected env file
const loadFileContent = async () => {
  if (!selectedId.value || !selectedFilename.value) return;
  loadingContent.value = true;
  try {
    const res = await api.getEnvFileContent(selectedId.value, selectedFilename.value);
    fileContent.value = res;
    rawEditorText.value = res.raw;

    // Populate visual editor list
    const items: VisualKvItem[] = [];
    let idCounter = 1;
    for (const entry of res.entries) {
      if (entry.type === "kv" && entry.key) {
        items.push({
          id: `kv-${idCounter++}`,
          key: entry.key,
          value: entry.value || "",
          inlineComment: entry.inlineComment || "",
          isSecret: Boolean(entry.isSecret),
          isPlaceholder: Boolean(entry.isPlaceholder),
          originalKey: entry.key,
        });
      }
    }
    visualKvList.value = items;

    // Reset unmasked keys if switching files
    unmaskedKeys.value.clear();
    globalUnmask.value = false;
  } catch (err: any) {
    notify.toastError(err.message || "Gagal memuat isi file .env");
  } finally {
    loadingContent.value = false;
  }
};

// Toggle mask for a specific key
const toggleKeyMask = (key: string) => {
  if (unmaskedKeys.value.has(key)) {
    unmaskedKeys.value.delete(key);
  } else {
    unmaskedKeys.value.add(key);
  }
};

// Toggle all secrets masking
const toggleGlobalMask = () => {
  globalUnmask.value = !globalUnmask.value;
  if (globalUnmask.value) {
    visualKvList.value.forEach((item) => unmaskedKeys.value.add(item.key));
  } else {
    unmaskedKeys.value.clear();
  }
};

// Check if a key's value should be masked
const isValueMasked = (item: VisualKvItem) => {
  if (!item.isSecret) return false;
  if (globalUnmask.value) return false;
  return !unmaskedKeys.value.has(item.key);
};

// Mask string representation
const getMaskedValue = (val: string) => {
  if (!val) return "";
  return "•".repeat(Math.min(val.length, 14)) || "••••••••";
};

// Copy text to clipboard helper
const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    notify.toastSuccess(`${label} disalin ke clipboard!`);
  } catch {
    notify.toastError("Gagal menyalin ke clipboard");
  }
};

// Add variable to visual list
const handleAddVariable = () => {
  const key = newVarKey.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!key) {
    notify.toastError("Nama key variabel tidak boleh kosong");
    return;
  }

  // Check duplicate
  if (visualKvList.value.some((item) => item.key === key)) {
    notify.toastError(`Key ${key} sudah ada di konfigurasi`);
    return;
  }

  const isSecret = /SECRET|PASSWORD|PASS|KEY|TOKEN|AUTH|CREDENTIAL|PRIVATE|DB_PASS|APIKEY|API_KEY/i.test(key);
  const isPlaceholder = /^(your_|<.*>|changeme|xxx|todo|insert_|replace_|placeholder|\s*$)/i.test(newVarValue.value);

  visualKvList.value.push({
    id: `kv-${Date.now()}`,
    key,
    value: newVarValue.value,
    inlineComment: newVarComment.value.trim(),
    isSecret,
    isPlaceholder,
    originalKey: key,
  });

  newVarKey.value = "";
  newVarValue.value = "";
  newVarComment.value = "";
  showAddModal.value = false;
  notify.toastSuccess(`Variabel ${key} berhasil ditambahkan`);
};

// Delete variable from visual list
const handleDeleteVariable = (index: number, key: string) => {
  visualKvList.value.splice(index, 1);
  unmaskedKeys.value.delete(key);
  notify.toastSuccess(`Variabel ${key} dihapus`);
};

// Rebuild raw string from visual list preserving structure where possible
const serializeVisualToRaw = () => {
  if (!fileContent.value || !fileContent.value.entries.length) {
    return visualKvList.value
      .map((item) => {
        let val = item.value;
        if (val.includes(" ") || val.includes("\n")) val = `"${val}"`;
        const comment = item.inlineComment ? ` # ${item.inlineComment}` : "";
        return `${item.key}=${val}${comment}`;
      })
      .join("\n");
  }

  const kvLookup = new Map(visualKvList.value.map((item) => [item.key, item]));
  const seenKeys = new Set<string>();
  const outputLines: string[] = [];

  for (const entry of fileContent.value.entries) {
    if (entry.type === "blank") {
      outputLines.push("");
    } else if (entry.type === "comment") {
      outputLines.push(`# ${entry.comment}`);
    } else if (entry.type === "kv" && entry.key) {
      if (kvLookup.has(entry.key)) {
        const item = kvLookup.get(entry.key)!;
        seenKeys.add(entry.key);
        let val = item.value;
        if (entry.isQuoted === "single") val = `'${val}'`;
        else if (entry.isQuoted === "double" || val.includes(" ") || val.includes("\n")) val = `"${val}"`;
        const comment = item.inlineComment ? ` # ${item.inlineComment}` : "";
        outputLines.push(`${item.key}=${val}${comment}`);
      }
      // If deleted, we omit it
    } else if (entry.type === "unknown") {
      outputLines.push(entry.raw);
    }
  }

  // Append newly added keys that were not in original file
  const newlyAdded = visualKvList.value.filter((item) => !seenKeys.has(item.key));
  if (newlyAdded.length > 0) {
    outputLines.push("\n# --- Added Variables ---");
    for (const item of newlyAdded) {
      let val = item.value;
      if (val.includes(" ") || val.includes("\n")) val = `"${val}"`;
      const comment = item.inlineComment ? ` # ${item.inlineComment}` : "";
      outputLines.push(`${item.key}=${val}${comment}`);
    }
  }

  return outputLines.join("\n");
};

// Save Env File
const handleSave = async () => {
  if (!selectedId.value || !selectedFilename.value) return;

  const contentToSave = activeTab.value === "raw" ? rawEditorText.value : serializeVisualToRaw();

  saving.value = true;
  try {
    const res = await api.saveEnvFileContent(selectedId.value, selectedFilename.value, contentToSave, true);
    notify.toastSuccess(`File ${res.name} berhasil disimpan! (Backup dibuat: ${res.backupCreated ? 'Ya' : 'Tidak'})`);
    await loadFiles();
  } catch (err: any) {
    notify.toastError(err.message || "Gagal menyimpan file .env");
  } finally {
    saving.value = false;
  }
};

// Run Env Doctor / Diff Comparison
const runComparison = async () => {
  if (!selectedId.value) return;
  loadingCompare.value = true;
  try {
    const res = await api.compareEnvFiles(selectedId.value, baseCompareFile.value, targetCompareFile.value);
    compareData.value = res;
    // Auto-select all missing keys
    selectedMissingKeys.value = new Set(res.missingKeys.map((m) => m.key));
  } catch (err: any) {
    notify.toastError(err.message || "Gagal membandingkan file .env");
  } finally {
    loadingCompare.value = false;
  }
};

// Sync missing keys from comparison
const handleSyncMissing = async (specificKey?: string) => {
  if (!selectedId.value) return;
  const keysToSync = specificKey ? [specificKey] : Array.from(selectedMissingKeys.value);
  if (keysToSync.length === 0) {
    notify.toastError("Pilih minimal 1 key untuk di-sync");
    return;
  }

  syncing.value = true;
  try {
    const res = await api.syncEnvMissingKeys(selectedId.value, targetCompareFile.value, baseCompareFile.value, keysToSync);
    notify.toastSuccess(`${res.appendedCount} key berhasil di-sync ke ${targetCompareFile.value}!`);
    await runComparison();
    await loadFiles();
  } catch (err: any) {
    notify.toastError(err.message || "Gagal melakukan sync keys");
  } finally {
    syncing.value = false;
  }
};

// Generate .env.example from active .env
const handleGenerateExample = async () => {
  if (!selectedId.value) return;
  const confirmed = await notify.confirm(
    "Generate .env.example?",
    `Akan membuat template .env.example dari ${selectedFilename.value} dengan mengosongkan/sanitasi semua secret value.`
  );
  if (!confirmed) return;

  try {
    const res = await api.generateEnvExample(selectedId.value, selectedFilename.value, ".env.example");
    notify.toastSuccess(`Template ${res.target} berhasil digenerate!`);
    await loadFiles();
  } catch (err: any) {
    notify.toastError(err.message || "Gagal men-generate .env.example");
  }
};

// Switch Active Profile (e.g. .env.staging -> .env)
const handleSwitchProfile = async (sourceFile: string) => {
  if (!selectedId.value) return;
  const confirmed = await notify.confirm(
    `Aktifkan Profil ${sourceFile}?`,
    `File .env yang sedang aktif akan di-backup menjadi .env.backup dan digantikan dengan isi dari ${sourceFile}.`
  );
  if (!confirmed) return;

  try {
    const res = await api.switchEnvProfile(selectedId.value, sourceFile);
    notify.toastSuccess(`Profil ${res.activeProfile} berhasil diaktifkan sebagai .env utama!`);
    selectedFilename.value = ".env";
    await loadFiles();
  } catch (err: any) {
    notify.toastError(err.message || "Gagal berganti profil .env");
  }
};

// Create New Profile
const handleCreateProfile = async () => {
  if (!selectedId.value) return;
  const name = newProfileName.value.trim();
  if (!name) {
    notify.toastError("Nama profil tidak boleh kosong");
    return;
  }

  let finalName = name;
  if (!finalName.startsWith(".env")) {
    finalName = `.env.${finalName}`;
  }

  try {
    await api.createEnvFile(selectedId.value, finalName, newProfileCopyFrom.value || undefined);
    notify.toastSuccess(`File ${finalName} berhasil dibuat!`);
    showCreateModal.value = false;
    newProfileName.value = "";
    selectedFilename.value = finalName;
    await loadFiles();
  } catch (err: any) {
    notify.toastError(err.message || "Gagal membuat file environment");
  }
};

// Delete Profile
const handleDeleteFile = async (filename: string) => {
  if (!selectedId.value) return;
  const confirmed = await notify.confirm(
    `Hapus ${filename}?`,
    "File ini akan dihapus permanen dari folder project."
  );
  if (!confirmed) return;

  try {
    await api.deleteEnvFile(selectedId.value, filename);
    notify.toastSuccess(`File ${filename} berhasil dihapus`);
    selectedFilename.value = ".env";
    await loadFiles();
  } catch (err: any) {
    notify.toastError(err.message || "Gagal menghapus file");
  }
};

// Watchers
watch(
  () => selectedId.value,
  () => {
    void loadFiles();
  }
);

watch(
  () => selectedFilename.value,
  () => {
    void loadFileContent();
  }
);

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === "doctor") {
      void runComparison();
    }
  }
);

onMounted(() => {
  void loadFiles();
});
</script>

<template>
  <div class="flex h-full flex-1 flex-col overflow-hidden bg-base">
    <!-- Header Bar -->
    <header class="border-b border-line bg-panel px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent text-lg border border-accent/30 shadow-xs shrink-0">
          🔐
        </div>
        <div class="min-w-0">
          <h1 class="text-sm font-extrabold text-ink leading-tight flex items-center gap-2 truncate">
            Environment & Secrets Manager
            <span v-if="selected" class="rounded-full bg-accent/20 text-accent px-2 py-0.5 text-[10px] font-mono font-bold border border-accent/30">
              {{ selected.name }}
            </span>
            <span v-if="filesData" class="rounded-full bg-elevated text-muted px-2 py-0.5 text-[10px] font-mono border border-line">
              {{ filesData.files.length }} Profiles
            </span>
          </h1>
          <p class="text-[11px] text-muted truncate">
            Visual .env Editor, Secret Masking, Environment Profiles, & Doctor Diff Checker
          </p>
        </div>
      </div>

      <!-- Main Action Buttons -->
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Tab Switcher -->
        <div class="flex items-center rounded-lg border border-line bg-base p-0.5">
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
            :class="activeTab === 'visual' ? 'bg-accent text-base font-bold shadow-xs' : 'text-muted hover:text-ink'"
            @click="activeTab = 'visual'"
          >
            <span>📋</span>
            <span>Visual Editor</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
            :class="activeTab === 'raw' ? 'bg-accent text-base font-bold shadow-xs' : 'text-muted hover:text-ink'"
            @click="activeTab = 'raw'"
          >
            <span>📝</span>
            <span>Raw Code</span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition"
            :class="activeTab === 'doctor' ? 'bg-accent text-base font-bold shadow-xs' : 'text-muted hover:text-ink'"
            @click="activeTab = 'doctor'"
          >
            <span>🩺</span>
            <span>Env Doctor & Diff</span>
          </button>
        </div>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent/40 transition shadow-xs"
          title="Buat profil environment baru (misal .env.staging)"
          @click="showCreateModal = true"
        >
          <span>➕</span>
          <span>New Profile</span>
        </button>

        <button
          v-if="activeTab !== 'doctor'"
          type="button"
          class="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-bold text-base hover:bg-accent/90 transition shadow-sm disabled:opacity-50"
          :disabled="saving || loadingContent"
          @click="handleSave"
        >
          <span v-if="saving" class="inline-block animate-spin">⏳</span>
          <span v-else>💾</span>
          <span>{{ saving ? 'Saving...' : 'Save Changes' }}</span>
        </button>
      </div>
    </header>

    <!-- Empty State if No Project Selected -->
    <div v-if="!selected" class="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div class="h-16 w-16 rounded-2xl bg-elevated border border-line flex items-center justify-center text-3xl mb-4 text-muted">
        📂
      </div>
      <h3 class="text-base font-bold text-ink mb-1">Pilih Project Terlebih Dahulu</h3>
      <p class="text-xs text-muted max-w-sm">
        Pilih salah satu project di sidebar kiri untuk mengelola variabel environment (.env) dan melihat status kelengkapan konfigurasinya.
      </p>
    </div>

    <!-- Main Workspace Content -->
    <div v-else class="flex flex-1 min-h-0 flex-col overflow-hidden">
      <!-- Secondary Toolbar: File Selector & Stats -->
      <div class="border-b border-line bg-panel/60 px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-muted font-medium text-[11px]">Active File:</span>
          <div class="flex items-center gap-1 overflow-x-auto max-w-xl py-0.5">
            <button
              v-for="f in filesData?.files || []"
              :key="f.name"
              type="button"
              class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono font-medium transition border shrink-0"
              :class="
                selectedFilename === f.name
                  ? 'bg-accent/15 border-accent text-accent font-bold shadow-xs'
                  : 'bg-elevated/70 border-line text-muted hover:text-ink hover:border-line'
              "
              @click="selectedFilename = f.name"
            >
              <span v-if="f.name === '.env'">🟢</span>
              <span v-else-if="f.isExample">📄</span>
              <span v-else>⚙️</span>
              <span>{{ f.name }}</span>
              <span class="text-[10px] text-muted/60">({{ f.keyCount }} keys)</span>
            </button>
          </div>

          <!-- If non-standard .env selected, provide Switch to .env button -->
          <button
            v-if="selectedFilename !== '.env' && selectedFilename !== '.env.example'"
            type="button"
            class="flex items-center gap-1 rounded bg-warn/15 border border-warn/30 text-warn px-2 py-0.5 text-[11px] font-semibold hover:bg-warn/25 transition"
            title="Gunakan profil ini sebagai .env utama yang aktif"
            @click="handleSwitchProfile(selectedFilename)"
          >
            <span>⚡ Set as Active .env</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <!-- Action to generate .env.example -->
          <button
            v-if="selectedFilename === '.env'"
            type="button"
            class="flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline px-2 py-1 rounded hover:bg-elevated transition"
            title="Generate .env.example template from current variables"
            @click="handleGenerateExample"
          >
            <span>✨ Generate .env.example</span>
          </button>

          <!-- Delete profile button (only for custom profiles, not .env or .env.example) -->
          <button
            v-if="selectedFilename !== '.env' && selectedFilename !== '.env.example'"
            type="button"
            class="flex items-center gap-1 text-[11px] font-semibold text-stopped/80 hover:text-stopped hover:underline px-2 py-1 rounded hover:bg-elevated transition"
            @click="handleDeleteFile(selectedFilename)"
          >
            <span>🗑️ Delete File</span>
          </button>
        </div>
      </div>

      <!-- TAB 1: VISUAL TABLE EDITOR -->
      <div v-if="activeTab === 'visual'" class="flex-1 flex flex-col min-h-0 overflow-hidden">
        <!-- Visual Editor Search & Filter Bar -->
        <div class="border-b border-line bg-panel/40 px-4 py-2 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-1 max-w-md">
            <div class="relative w-full">
              <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
              <input
                v-model="searchQuery"
                type="search"
                placeholder="Filter by key, value, or comment..."
                class="w-full rounded-lg border border-line bg-base pl-8 pr-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div class="flex items-center gap-2 flex-wrap">
            <!-- Filter Chips -->
            <div class="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                class="rounded-md px-2 py-1 font-medium transition"
                :class="visualFilter === 'all' ? 'bg-accent/20 text-accent font-bold' : 'text-muted hover:text-ink'"
                @click="visualFilter = 'all'"
              >
                All ({{ visualKvList.length }})
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1 font-medium transition"
                :class="visualFilter === 'secrets' ? 'bg-stopped/20 text-stopped font-bold' : 'text-muted hover:text-ink'"
                @click="visualFilter = 'secrets'"
              >
                🔒 Secrets ({{ visualKvList.filter(i => i.isSecret).length }})
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1 font-medium transition"
                :class="visualFilter === 'placeholders' ? 'bg-warn/20 text-warn font-bold' : 'text-muted hover:text-ink'"
                @click="visualFilter = 'placeholders'"
              >
                ⚠️ Placeholders ({{ visualKvList.filter(i => i.isPlaceholder).length }})
              </button>
              <button
                type="button"
                class="rounded-md px-2 py-1 font-medium transition"
                :class="visualFilter === 'configured' ? 'bg-running/20 text-running font-bold' : 'text-muted hover:text-ink'"
                @click="visualFilter = 'configured'"
              >
                ✅ Configured
              </button>
            </div>

            <!-- Global Unmask Toggle -->
            <button
              type="button"
              class="flex items-center gap-1 rounded-md border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink transition"
              @click="toggleGlobalMask"
            >
              <span>{{ globalUnmask ? '🔒 Mask All Secrets' : '👁️ Reveal All Secrets' }}</span>
            </button>

            <!-- Add Variable Button -->
            <button
              type="button"
              class="flex items-center gap-1 rounded-md bg-accent/15 border border-accent/40 text-accent px-2.5 py-1 text-xs font-bold hover:bg-accent/25 transition"
              @click="showAddModal = true"
            >
              <span>➕ Add Variable</span>
            </button>
          </div>
        </div>

        <!-- Table View -->
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="loadingContent" class="flex flex-col items-center justify-center py-16 text-muted">
            <span class="animate-spin text-2xl mb-2">⏳</span>
            <span class="text-xs">Memuat variabel environment...</span>
          </div>

          <div v-else-if="filteredKvList.length === 0" class="flex flex-col items-center justify-center py-16 text-muted text-center">
            <span class="text-3xl mb-2">🍃</span>
            <p class="text-sm font-semibold text-ink">Tidak ada variabel ditemukan</p>
            <p class="text-xs text-muted max-w-sm mt-1">
              {{ searchQuery ? 'Tidak ada variabel yang sesuai kata kunci pencarian.' : 'File ini belum memiliki variabel konfigurasi. Klik "Add Variable" untuk mulai menambahkan.' }}
            </p>
          </div>

          <div v-else class="space-y-2 max-w-6xl mx-auto">
            <div
              v-for="(item, idx) in filteredKvList"
              :key="item.id"
              class="rounded-xl border border-line bg-panel p-3.5 shadow-xs transition hover:border-accent/30 group"
            >
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <!-- Left: Key Name & Type Badge -->
                <div class="flex items-center gap-2.5 min-w-[240px] md:max-w-xs">
                  <span class="text-[10px] font-mono text-muted/60 w-5 text-right shrink-0">{{ idx + 1 }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs font-bold text-ink truncate select-all">{{ item.key }}</span>
                      <span
                        class="rounded px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase border shrink-0"
                        :class="detectVarType(item.key, item.value).color"
                      >
                        {{ detectVarType(item.key, item.value).label }}
                      </span>
                    </div>
                    <p v-if="item.inlineComment" class="text-[10px] text-muted truncate mt-0.5">
                      # {{ item.inlineComment }}
                    </p>
                  </div>
                </div>

                <!-- Center: Value Input / Masked Display -->
                <div class="flex-1 min-w-0">
                  <div class="relative flex items-center">
                    <input
                      v-if="!isValueMasked(item)"
                      v-model="item.value"
                      type="text"
                      placeholder="<EMPTY VALUE>"
                      class="w-full rounded-lg border border-line bg-base px-3 py-1.5 font-mono text-xs text-ink placeholder:text-muted/40 focus:border-accent focus:outline-none"
                    />
                    <div
                      v-else
                      class="w-full rounded-lg border border-line bg-base/80 px-3 py-1.5 font-mono text-xs text-muted flex items-center justify-between cursor-pointer hover:border-accent/40"
                      @click="toggleKeyMask(item.key)"
                    >
                      <span class="tracking-widest font-bold text-muted/80 select-none">
                        {{ getMaskedValue(item.value) }}
                      </span>
                      <span class="text-[10px] text-muted hover:text-ink">👁️ Klik untuk tampilkan</span>
                    </div>
                  </div>
                </div>

                <!-- Right: Row Actions -->
                <div class="flex items-center gap-1 shrink-0 justify-end">
                  <button
                    v-if="item.isSecret"
                    type="button"
                    class="rounded-md border border-line bg-elevated p-1.5 text-xs text-muted hover:text-ink hover:border-line transition"
                    :title="isValueMasked(item) ? 'Lihat nilai asli' : 'Sembunyikan nilai (mask)'"
                    @click="toggleKeyMask(item.key)"
                  >
                    <span>{{ isValueMasked(item) ? '👁️' : '🔒' }}</span>
                  </button>

                  <button
                    type="button"
                    class="rounded-md border border-line bg-elevated p-1.5 text-xs text-muted hover:text-ink hover:border-line transition"
                    title="Salin Key"
                    @click="copyToClipboard(item.key, 'Key')"
                  >
                    <span>🏷️</span>
                  </button>

                  <button
                    type="button"
                    class="rounded-md border border-line bg-elevated p-1.5 text-xs text-muted hover:text-ink hover:border-line transition"
                    title="Salin Value"
                    @click="copyToClipboard(item.value, 'Value')"
                  >
                    <span>📋</span>
                  </button>

                  <button
                    type="button"
                    class="rounded-md border border-line bg-elevated p-1.5 text-xs text-stopped/70 hover:text-stopped hover:bg-stopped/10 transition"
                    title="Hapus Variabel"
                    @click="handleDeleteVariable(idx, item.key)"
                  >
                    <span>🗑️</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: RAW CODE EDITOR -->
      <div v-else-if="activeTab === 'raw'" class="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
        <div class="flex items-center justify-between border-b border-line bg-panel px-4 py-2 rounded-t-xl">
          <div class="flex items-center gap-2">
            <span class="font-mono text-xs font-bold text-accent">{{ selectedFilename }}</span>
            <span class="text-[11px] text-muted">Direct Plain Text Editor</span>
          </div>
          <span class="text-[10px] text-muted font-mono">Format: KEY=VALUE (# comment)</span>
        </div>
        <textarea
          v-model="rawEditorText"
          spellcheck="false"
          placeholder="Paste or write .env variables here..."
          class="flex-1 w-full rounded-b-xl border border-t-0 border-line bg-log p-4 font-mono text-xs text-ink leading-relaxed placeholder:text-muted/40 focus:border-accent focus:outline-none resize-none overflow-y-auto"
        ></textarea>
      </div>

      <!-- TAB 3: ENV DOCTOR & DIFF CHECKER -->
      <div v-else-if="activeTab === 'doctor'" class="flex-1 flex flex-col min-h-0 overflow-hidden">
        <!-- Diff Selector Toolbar -->
        <div class="border-b border-line bg-panel/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-semibold text-muted">Reference (Base):</span>
              <select
                v-model="baseCompareFile"
                class="rounded-lg border border-line bg-base px-2.5 py-1 text-xs text-ink font-mono focus:border-accent focus:outline-none"
                @change="runComparison"
              >
                <option v-for="f in filesData?.files || []" :key="f.name" :value="f.name">
                  {{ f.name }} {{ f.isExample ? '(Example)' : '' }}
                </option>
              </select>
            </div>

            <span class="text-muted font-bold">⇄</span>

            <div class="flex items-center gap-1.5">
              <span class="text-xs font-semibold text-muted">Target Environment:</span>
              <select
                v-model="targetCompareFile"
                class="rounded-lg border border-line bg-base px-2.5 py-1 text-xs text-ink font-mono focus:border-accent focus:outline-none"
                @change="runComparison"
              >
                <option v-for="f in filesData?.files || []" :key="f.name" :value="f.name">
                  {{ f.name }} {{ f.isDefault ? '(Active .env)' : '' }}
                </option>
              </select>
            </div>

            <button
              type="button"
              class="rounded-lg border border-line bg-elevated px-2.5 py-1 text-xs font-semibold text-ink hover:text-accent transition"
              @click="runComparison"
            >
              🔄 Refresh Diff
            </button>
          </div>

          <!-- One Click Sync Action -->
          <div class="flex items-center gap-2">
            <button
              v-if="compareData && compareData.missingKeys.length > 0"
              type="button"
              class="flex items-center gap-1.5 rounded-lg bg-warn px-3 py-1.5 text-xs font-bold text-base hover:bg-warn/90 transition shadow-xs disabled:opacity-50"
              :disabled="syncing"
              @click="handleSyncMissing()"
            >
              <span v-if="syncing" class="inline-block animate-spin">⏳</span>
              <span v-else>⚡</span>
              <span>Sync All Missing Keys ({{ compareData.missingKeys.length }})</span>
            </button>
          </div>
        </div>

        <!-- Doctor Summary & Health Score Cards -->
        <div class="p-4 border-b border-line bg-panel/20">
          <div v-if="compareData" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 max-w-6xl mx-auto">
            <!-- Health Score Card -->
            <div class="rounded-xl border border-line bg-panel p-3.5 flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Health Score</p>
                <h4 class="text-xl font-extrabold font-mono mt-0.5" :class="compareData.healthScore >= 90 ? 'text-running' : compareData.healthScore >= 60 ? 'text-warn' : 'text-stopped'">
                  {{ compareData.healthScore }}%
                </h4>
                <p class="text-[10px] text-muted mt-0.5">
                  {{ compareData.isHealthy ? 'Semua key lengkap & siap!' : 'Perlu konfigurasi tambahan' }}
                </p>
              </div>
              <div class="h-11 w-11 rounded-full border-2 flex items-center justify-center text-lg font-bold shrink-0"
                :class="compareData.healthScore >= 90 ? 'border-running text-running bg-running/10' : compareData.healthScore >= 60 ? 'border-warn text-warn bg-warn/10' : 'border-stopped text-stopped bg-stopped/10'"
              >
                {{ compareData.healthScore >= 90 ? '✅' : compareData.healthScore >= 60 ? '⚠️' : '🚨' }}
              </div>
            </div>

            <!-- Missing Keys Card -->
            <div class="rounded-xl border border-line bg-panel p-3.5 flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Missing Keys</p>
                <h4 class="text-xl font-extrabold font-mono text-stopped mt-0.5">
                  {{ compareData.summary.totalMissing }}
                </h4>
                <p class="text-[10px] text-muted mt-0.5">Ada di {{ baseCompareFile }}, belum ada di {{ targetCompareFile }}</p>
              </div>
              <span class="text-2xl">❌</span>
            </div>

            <!-- Placeholders Card -->
            <div class="rounded-xl border border-line bg-panel p-3.5 flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Placeholders</p>
                <h4 class="text-xl font-extrabold font-mono text-warn mt-0.5">
                  {{ compareData.summary.totalPlaceholders }}
                </h4>
                <p class="text-[10px] text-muted mt-0.5">Masih bernilai default / kosong</p>
              </div>
              <span class="text-2xl">⚠️</span>
            </div>

            <!-- Matched Keys Card -->
            <div class="rounded-xl border border-line bg-panel p-3.5 flex items-center justify-between gap-3">
              <div>
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Matched Keys</p>
                <h4 class="text-xl font-extrabold font-mono text-running mt-0.5">
                  {{ compareData.summary.totalMatched }}
                </h4>
                <p class="text-[10px] text-muted mt-0.5">Key terdefinisi di kedua file</p>
              </div>
              <span class="text-2xl">🔗</span>
            </div>
          </div>
        </div>

        <!-- Side by Side Diff List -->
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="loadingCompare" class="flex flex-col items-center justify-center py-16 text-muted">
            <span class="animate-spin text-2xl mb-2">⏳</span>
            <span class="text-xs">Membandingkan environment files...</span>
          </div>

          <div v-else-if="compareData" class="space-y-4 max-w-6xl mx-auto">
            <!-- Section 1: Missing Keys Alert Table -->
            <div v-if="compareData.missingKeys.length > 0" class="rounded-xl border border-stopped/30 bg-stopped/5 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-base">🚨</span>
                  <h3 class="text-xs font-bold text-stopped uppercase tracking-wider">
                    Missing Variables (Belum ada di {{ targetCompareFile }})
                  </h3>
                </div>
                <span class="text-[11px] font-mono text-stopped">{{ compareData.missingKeys.length }} missing</span>
              </div>

              <div class="space-y-2">
                <div
                  v-for="item in compareData.missingKeys"
                  :key="item.key"
                  class="flex items-center justify-between rounded-lg border border-stopped/20 bg-panel p-2.5 text-xs"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono font-bold text-ink truncate">{{ item.key }}</span>
                    <span v-if="item.isSecret" class="rounded bg-stopped/20 text-stopped text-[9px] font-mono px-1">SECRET</span>
                    <span v-if="item.exampleValue" class="text-muted font-mono text-[11px] truncate">
                      (Example: {{ item.exampleValue }})
                    </span>
                  </div>

                  <button
                    type="button"
                    class="rounded-md bg-accent/15 border border-accent/40 text-accent px-2.5 py-1 text-xs font-semibold hover:bg-accent/25 transition shrink-0"
                    @click="handleSyncMissing(item.key)"
                  >
                    ⚡ Sync Key
                  </button>
                </div>
              </div>
            </div>

            <!-- Section 2: Placeholder / Empty Keys Table -->
            <div v-if="compareData.placeholderKeys.length > 0" class="rounded-xl border border-warn/30 bg-warn/5 p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-base">⚠️</span>
                  <h3 class="text-xs font-bold text-warn uppercase tracking-wider">
                    Placeholder / Empty Values in {{ targetCompareFile }}
                  </h3>
                </div>
                <span class="text-[11px] font-mono text-warn">{{ compareData.placeholderKeys.length }} unconfigured</span>
              </div>

              <div class="space-y-2">
                <div
                  v-for="item in compareData.placeholderKeys"
                  :key="item.key"
                  class="flex items-center justify-between rounded-lg border border-warn/20 bg-panel p-2.5 text-xs"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-mono font-bold text-ink truncate">{{ item.key }}</span>
                    <span class="font-mono text-warn text-[11px] truncate">Current: "{{ item.value }}"</span>
                  </div>
                  <span class="text-[10px] text-muted">Perlu diisi dengan credentials yang valid</span>
                </div>
              </div>
            </div>

            <!-- Section 3: Extra Keys (Only in Target) -->
            <div v-if="compareData.extraKeys.length > 0" class="rounded-xl border border-line bg-panel p-4">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-base">➕</span>
                  <h3 class="text-xs font-bold text-ink uppercase tracking-wider">
                    Extra Variables (Hanya ada di {{ targetCompareFile }})
                  </h3>
                </div>
                <span class="text-[11px] font-mono text-muted">{{ compareData.extraKeys.length }} extra</span>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div
                  v-for="item in compareData.extraKeys"
                  :key="item.key"
                  class="rounded-lg border border-line bg-base p-2.5 text-xs flex items-center justify-between"
                >
                  <span class="font-mono font-bold text-ink truncate">{{ item.key }}</span>
                  <span v-if="item.isSecret" class="rounded bg-stopped/20 text-stopped text-[9px] font-mono px-1">SECRET</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: ADD NEW VARIABLE -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-xs p-4"
    >
      <div class="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-sm font-bold text-ink flex items-center gap-2">
            <span>➕</span> Tambah Variabel Environment
          </h3>
          <button type="button" class="text-muted hover:text-ink font-bold text-xs" @click="showAddModal = false">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-semibold text-muted mb-1">Key Name (UPPERCASE):</label>
            <input
              v-model="newVarKey"
              type="text"
              placeholder="e.g. DATABASE_URL, JWT_SECRET, PORT"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label class="block font-semibold text-muted mb-1">Value:</label>
            <input
              v-model="newVarValue"
              type="text"
              placeholder="e.g. postgresql://user:pass@localhost:5432/mydb"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label class="block font-semibold text-muted mb-1">Inline Comment (Opsional):</label>
            <input
              v-model="newVarComment"
              type="text"
              placeholder="e.g. Secret token for OAuth2"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button
            type="button"
            class="rounded-lg border border-line bg-elevated px-4 py-2 text-xs font-semibold text-muted hover:text-ink transition"
            @click="showAddModal = false"
          >
            Batal
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-base hover:bg-accent/90 transition shadow-xs"
            @click="handleAddVariable"
          >
            Simpan Variabel
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: CREATE NEW PROFILE -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base/80 backdrop-blur-xs p-4"
    >
      <div class="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <h3 class="text-sm font-bold text-ink flex items-center gap-2">
            <span>⚙️</span> Buat Profile Environment Baru
          </h3>
          <button type="button" class="text-muted hover:text-ink font-bold text-xs" @click="showCreateModal = false">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="block font-semibold text-muted mb-1">Nama File Profile:</label>
            <div class="flex items-center">
              <span class="rounded-l-lg border border-r-0 border-line bg-elevated px-2.5 py-2 font-mono text-xs text-muted">.env.</span>
              <input
                v-model="newProfileName"
                type="text"
                placeholder="staging, production, local, docker"
                class="flex-1 rounded-r-lg border border-line bg-base px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label class="block font-semibold text-muted mb-1">Salin Template Dari (Opsional):</label>
            <select
              v-model="newProfileCopyFrom"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 font-mono text-xs text-ink focus:border-accent focus:outline-none"
            >
              <option value="">-- Kosong (File Baru) --</option>
              <option v-for="f in filesData?.files || []" :key="f.name" :value="f.name">
                {{ f.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button
            type="button"
            class="rounded-lg border border-line bg-elevated px-4 py-2 text-xs font-semibold text-muted hover:text-ink transition"
            @click="showCreateModal = false"
          >
            Batal
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-base hover:bg-accent/90 transition shadow-xs"
            @click="handleCreateProfile"
          >
            Buat Profil
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
