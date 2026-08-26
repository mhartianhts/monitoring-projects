<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { storeToRefs } from "pinia";
import { useProjectStore } from "../stores/project.store";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import type {
  TelegramBot,
  TelegramCommand,
  TelegramActivityLog,
} from "../types/telegram";

const projectStore = useProjectStore();
const { projects } = storeToRefs(projectStore);

const loading = ref(false);
const bots = ref<TelegramBot[]>([]);
const activityLogs = ref<TelegramActivityLog[]>([]);

// Modal States
const showBotModal = ref(false);
const isEditingBot = ref(false);
const showCommandModal = ref(false);
const showSendModal = ref(false);
const showActivityModal = ref(false);
const showTesterModal = ref(false);

// Active Selection
const selectedBot = ref<TelegramBot | null>(null);

// Command Tester / Simulator State
const testerBot = ref<TelegramBot | null>(null);
const testerCommandText = ref("/status");
const testerSendToChat = ref(false);
const isRunningCommand = ref(false);
const testerOutput = ref<string | null>(null);
const testerResultMeta = ref<{ sentToTelegram?: boolean; timestamp?: string; command?: string; targetChatId?: string | null } | null>(null);

// Bot Form State
const botForm = ref({
  id: "",
  name: "",
  token: "",
  defaultChatId: "",
  allowedChatIdsText: "",
  pollingEnabled: true,
  enabled: true,
});
const showToken = ref(false);
const isTestingToken = ref(false);

// Command Form State
const commandForm = ref<TelegramCommand>({
  command: "",
  description: "",
  actionType: "built-in",
  action: "status",
  targetProjectId: null,
  customResponse: "",
});
const isEditingCommand = ref(false);
const isSyncingCommands = ref(false);

// Send Message Form State
const sendForm = ref({
  botId: "",
  chatId: "",
  message: "",
  parseMode: "Markdown",
});
const isSendingMessage = ref(false);

// Computed stats
const activeBotsCount = computed(
  () => bots.value.filter((b) => b.runtimeStatus === "listening" || (b.enabled && b.pollingEnabled)).length
);
const totalCommandsCount = computed(
  () => bots.value.reduce((acc, b) => acc + (b.commands?.length || 0), 0)
);

// Load Data
const fetchBots = async () => {
  loading.value = true;
  try {
    const data = await api.getTelegramBots();
    bots.value = data;
    // Update selectedBot reference if open
    if (selectedBot.value) {
      const refreshed = data.find((b) => b.id === selectedBot.value?.id);
      if (refreshed) selectedBot.value = refreshed;
    }
  } catch (err: any) {
    notify.toast(err.message || "Gagal memuat daftar Telegram bot", "error");
  } finally {
    loading.value = false;
  }
};

const fetchActivityLogs = async () => {
  try {
    activityLogs.value = await api.getTelegramActivity();
  } catch (_) {}
};

// Bot Modal Handlers
const openAddBotModal = () => {
  isEditingBot.value = false;
  botForm.value = {
    id: "",
    name: "",
    token: "",
    defaultChatId: "",
    allowedChatIdsText: "",
    pollingEnabled: true,
    enabled: true,
  };
  showToken.value = false;
  showBotModal.value = true;
};

const openEditBotModal = (bot: TelegramBot) => {
  isEditingBot.value = true;
  botForm.value = {
    id: bot.id,
    name: bot.name,
    token: bot.token,
    defaultChatId: bot.defaultChatId || "",
    allowedChatIdsText: (bot.allowedChatIds || []).join("\n"),
    pollingEnabled: bot.pollingEnabled,
    enabled: bot.enabled,
  };
  showToken.value = false;
  showBotModal.value = true;
};

const handleTestToken = async () => {
  if (!botForm.value.token) {
    notify.toast("Masukkan bot token terlebih dahulu", "warning");
    return;
  }
  isTestingToken.value = true;
  try {
    const res = await api.testTelegramBot({
      token: botForm.value.token,
      chatId: botForm.value.defaultChatId || undefined,
    });
    if (res.messageSent) {
      notify.success(
        "Koneksi Berhasil!",
        `Terhubung dengan @${res.bot.username}. Pesan tes berhasil dikirim ke Chat ID: ${botForm.value.defaultChatId}`
      );
    } else {
      notify.success(
        "Bot Ditemukan!",
        `Bot terverifikasi: @${res.bot.username} (${res.bot.name}). Chat ID belum diisi atau pesan tes dilewati.`
      );
    }
  } catch (err: any) {
    notify.error("Tes Koneksi Gagal", err.message || "Token tidak valid");
  } finally {
    isTestingToken.value = false;
  }
};

const handleSaveBot = async () => {
  if (!botForm.value.token) {
    notify.toast("Bot token wajib diisi", "warning");
    return;
  }

  const allowedChatIds = botForm.value.allowedChatIdsText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  loading.value = true;
  try {
    if (isEditingBot.value) {
      await api.updateTelegramBot(botForm.value.id, {
        name: botForm.value.name,
        token: botForm.value.token,
        defaultChatId: botForm.value.defaultChatId,
        allowedChatIds,
        pollingEnabled: botForm.value.pollingEnabled,
        enabled: botForm.value.enabled,
      });
      notify.toast("Bot berhasil diperbarui!", "success");
    } else {
      await api.createTelegramBot({
        name: botForm.value.name,
        token: botForm.value.token,
        defaultChatId: botForm.value.defaultChatId,
        allowedChatIds,
        pollingEnabled: botForm.value.pollingEnabled,
        enabled: botForm.value.enabled,
      });
      notify.toast("Bot baru berhasil ditambahkan!", "success");
    }
    showBotModal.value = false;
    await fetchBots();
  } catch (err: any) {
    notify.error("Gagal Menyimpan Bot", err.message);
  } finally {
    loading.value = false;
  }
};

const handleDeleteBot = async (bot: TelegramBot) => {
  const confirmed = await notify.confirm(
    "Hapus Telegram Bot?",
    `Anda yakin ingin menghapus bot "${bot.name}" (@${bot.username || 'bot'})?`,
    "Ya, Hapus",
    "Batal"
  );
  if (!confirmed) return;

  try {
    await api.deleteTelegramBot(bot.id);
    notify.toast(`Bot ${bot.name} berhasil dihapus`, "success");
    if (selectedBot.value?.id === bot.id) {
      showCommandModal.value = false;
      selectedBot.value = null;
    }
    await fetchBots();
  } catch (err: any) {
    notify.error("Gagal Menghapus Bot", err.message);
  }
};

const handleToggleBot = async (bot: TelegramBot) => {
  try {
    const res = await api.toggleTelegramBot(bot.id);
    bot.pollingEnabled = res.pollingEnabled;
    bot.runtimeStatus = res.runtimeStatus as any;
    notify.toast(
      `Polling Bot ${bot.name} ${res.pollingEnabled ? "Diaktifkan (Mendengarkan)" : "Dihentikan"}`,
      res.pollingEnabled ? "success" : "info"
    );
  } catch (err: any) {
    notify.error("Gagal Mengubah Status Polling", err.message);
  }
};

const handleQuickTestBot = async (bot: TelegramBot) => {
  try {
    const res = await api.testTelegramBot({ botId: bot.id });
    if (res.messageSent) {
      notify.toast(`Tes berhasil! Pesan dikirim ke @${res.bot.username}`, "success");
    } else {
      notify.toast(`Bot @${res.bot.username} aktif, namun default chat ID belum diisi`, "info");
    }
  } catch (err: any) {
    notify.error("Gagal Mengetes Bot", err.message);
  }
};

// Command Manager Handlers
const openCommandModal = (bot: TelegramBot) => {
  selectedBot.value = bot;
  resetCommandForm();
  showCommandModal.value = true;
};

const resetCommandForm = () => {
  isEditingCommand.value = false;
  commandForm.value = {
    command: "",
    description: "",
    actionType: "built-in",
    action: "status",
    targetProjectId: null,
    customResponse: "",
  };
};

const editCommand = (cmd: TelegramCommand) => {
  isEditingCommand.value = true;
  commandForm.value = { ...cmd };
};

const handleSaveCommand = async () => {
  if (!selectedBot.value) return;
  const cmd = commandForm.value.command.replace(/^\//, "").trim();
  if (!cmd) {
    notify.toast("Nama perintah (command) tidak boleh kosong", "warning");
    return;
  }
  if (!commandForm.value.description) {
    notify.toast("Deskripsi perintah wajib diisi", "warning");
    return;
  }

  try {
    const updated = await api.saveTelegramCommand(selectedBot.value.id, {
      ...commandForm.value,
      command: cmd,
    });
    selectedBot.value = updated;
    const idx = bots.value.findIndex((b) => b.id === updated.id);
    if (idx !== -1) bots.value[idx] = updated;

    notify.toast(`Perintah /${cmd} berhasil disimpan!`, "success");
    resetCommandForm();
  } catch (err: any) {
    notify.error("Gagal Menyimpan Perintah", err.message);
  }
};

const handleDeleteCommand = async (cmdName: string) => {
  if (!selectedBot.value) return;
  const confirmed = await notify.confirm(
    "Hapus Perintah?",
    `Anda yakin ingin menghapus perintah /${cmdName}?`,
    "Ya, Hapus",
    "Batal"
  );
  if (!confirmed) return;

  try {
    const updated = await api.deleteTelegramCommand(selectedBot.value.id, cmdName);
    selectedBot.value = updated;
    const idx = bots.value.findIndex((b) => b.id === updated.id);
    if (idx !== -1) bots.value[idx] = updated;
    notify.toast(`Perintah /${cmdName} berhasil dihapus`, "success");
  } catch (err: any) {
    notify.error("Gagal Menghapus Perintah", err.message);
  }
};

const handleSyncCommandsToTelegram = async () => {
  if (!selectedBot.value) return;
  isSyncingCommands.value = true;
  try {
    const res = await api.syncTelegramCommands(selectedBot.value.id);
    notify.success(
      "Sinkronisasi Berhasil!",
      `${res.count} perintah berhasil didaftarkan ke menu Telegram (@${selectedBot.value.username || selectedBot.value.name}). Saat membuka chat di Telegram, daftar perintah akan otomatis muncul saat mengetik '/'.`
    );
  } catch (err: any) {
    notify.error("Gagal Sinkronisasi Commands", err.message);
  } finally {
    isSyncingCommands.value = false;
  }
};

// Command Tester Handlers
const openTesterModal = (bot: TelegramBot, defaultCmd = "/status") => {
  testerBot.value = bot;
  testerCommandText.value = defaultCmd.startsWith("/") ? defaultCmd : `/${defaultCmd}`;
  testerOutput.value = null;
  testerResultMeta.value = null;
  testerSendToChat.value = false;
  showTesterModal.value = true;
};

const handleRunTestCommand = async () => {
  if (!testerBot.value) return;
  const rawText = testerCommandText.value.trim();
  if (!rawText) {
    notify.toast("Perintah tidak boleh kosong", "warning");
    return;
  }
  isRunningCommand.value = true;
  testerOutput.value = null;
  testerResultMeta.value = null;
  try {
    let res;
    if (typeof api.runTelegramCommand === "function") {
      res = await api.runTelegramCommand(testerBot.value.id, {
        command: rawText,
        sendToChat: testerSendToChat.value,
      });
    } else {
      // Fallback jika browser masih me-load cache lama api.ts
      const response = await fetch(`/api/telegram/bots/${testerBot.value.id}/run-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: rawText,
          sendToChat: testerSendToChat.value,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Gagal menjalankan perintah");
      res = data.data;
    }

    testerOutput.value = res.output;
    testerResultMeta.value = {
      sentToTelegram: res.sentToTelegram,
      timestamp: new Date().toLocaleTimeString("id-ID"),
      command: res.command,
      targetChatId: res.targetChatId,
    };
    if (res.sentToTelegram) {
      notify.toast("Perintah dieksekusi & dikirim ke Telegram Chat!", "success");
    } else {
      notify.toast("Perintah berhasil disimulasikan di dashboard!", "success");
    }
  } catch (err: any) {
    testerOutput.value = `❌ ERROR: ${err.message}`;
    notify.error("Gagal Menjalankan Perintah", err.message);
  } finally {
    isRunningCommand.value = false;
  }
};

// Send / Broadcast Message Handlers
const openSendModal = (bot?: TelegramBot) => {
  sendForm.value = {
    botId: bot ? bot.id : (bots.value[0]?.id || ""),
    chatId: bot ? (bot.defaultChatId || "") : "",
    message: "",
    parseMode: "Markdown",
  };
  showSendModal.value = true;
};

const handleSendMessage = async () => {
  if (!sendForm.value.message.trim()) {
    notify.toast("Pesan tidak boleh kosong", "warning");
    return;
  }
  isSendingMessage.value = true;
  try {
    await api.sendTelegramMessage({
      botId: sendForm.value.botId || undefined,
      chatId: sendForm.value.chatId || undefined,
      message: sendForm.value.message,
      parseMode: sendForm.value.parseMode,
    });
    notify.toast("Pesan berhasil dikirim ke Telegram!", "success");
    showSendModal.value = false;
    sendForm.value.message = "";
  } catch (err: any) {
    notify.error("Gagal Mengirim Pesan", err.message);
  } finally {
    isSendingMessage.value = false;
  }
};

// Open Activity Logs
const openActivityDrawer = async () => {
  await fetchActivityLogs();
  showActivityModal.value = true;
};

onMounted(() => {
  void fetchBots();
  if (projects.value.length === 0) {
    void projectStore.fetchProjects();
  }
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden bg-base text-ink">
    <!-- Top Header Bar -->
    <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-panel px-6 py-4 shrink-0 shadow-xs">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dim text-xl shadow-md">
          🤖
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h1 class="text-base font-bold text-ink tracking-tight">Telegram Bot & Command Center</h1>
            <span class="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent border border-accent/30">
              Multi-Bot
            </span>
          </div>
          <p class="text-xs text-muted">
            Hubungkan bot Telegram, kelola perintah custom, dan monitor status server dari mana saja.
          </p>
        </div>
      </div>

      <!-- Quick Stats & Actions -->
      <div class="flex items-center gap-2.5">
        <div class="hidden sm:flex items-center gap-2 border-r border-line pr-3 mr-1 text-xs">
          <div class="flex items-center gap-1.5 rounded-lg bg-elevated px-2.5 py-1.5 border border-line">
            <span class="h-2 w-2 rounded-full bg-running animate-pulse"></span>
            <span class="text-muted">Bot Aktif:</span>
            <span class="font-bold text-ink">{{ activeBotsCount }} / {{ bots.length }}</span>
          </div>
          <div class="flex items-center gap-1.5 rounded-lg bg-elevated px-2.5 py-1.5 border border-line">
            <span class="text-muted">Perintah:</span>
            <span class="font-bold text-accent">{{ totalCommandsCount }}</span>
          </div>
        </div>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink hover:bg-line transition"
          title="Lihat Log Aktivitas Bot"
          @click="openActivityDrawer"
        >
          <span>📋</span>
          <span class="hidden md:inline">Log Aktivitas</span>
        </button>

        <button
          v-if="bots.length > 0"
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent hover:text-base transition"
          title="Uji Coba Command Langsung"
          @click="openTesterModal(bots[0])"
        >
          <span>🧪</span>
          <span>Coba Command</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink hover:bg-line transition"
          title="Kirim Pesan Cepat / Broadcast"
          @click="openSendModal()"
        >
          <span>📨</span>
          <span class="hidden md:inline">Kirim Pesan</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink hover:bg-line transition"
          title="Refresh Data"
          @click="fetchBots"
        >
          <span :class="loading ? 'animate-spin' : ''">🔄</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-bold text-base hover:bg-accent-dim transition shadow-sm"
          @click="openAddBotModal"
        >
          <span>+</span>
          <span>Tambah Bot</span>
        </button>
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 overflow-y-auto p-6 space-y-6">
      <!-- Loading State -->
      <div v-if="loading && bots.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
        <div class="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
        <p class="mt-4 text-sm text-muted">Memuat daftar bot Telegram...</p>
      </div>

      <!-- Empty State / Setup Guide -->
      <div
        v-else-if="bots.length === 0"
        class="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-panel/50 p-10 text-center max-w-2xl mx-auto my-8 shadow-sm"
      >
        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-3xl text-accent mb-4 border border-accent/20">
          🤖
        </div>
        <h2 class="text-lg font-bold text-ink">Belum Ada Telegram Bot yang Terhubung</h2>
        <p class="mt-2 text-xs text-muted leading-relaxed max-w-md">
          Hubungkan bot Telegram untuk menerima notifikasi status server, mengontrol project melalui command <code class="text-accent">/status</code>, <code class="text-accent">/start</code>, <code class="text-accent">/restart</code>, dan lainnya.
        </p>

        <!-- Quick 3 Step Guide -->
        <div class="mt-6 w-full text-left bg-base/60 rounded-xl p-4 border border-line space-y-2 text-xs">
          <p class="font-bold text-accent uppercase tracking-wider text-[10px]">Cara Membuat Bot Telegram (1 Menit):</p>
          <div class="flex items-start gap-2 text-muted">
            <span class="font-bold text-ink shrink-0">1.</span>
            <span>Buka Telegram dan cari akun resmi <a href="https://t.me/BotFather" target="_blank" class="text-accent underline font-semibold">@BotFather</a>.</span>
          </div>
          <div class="flex items-start gap-2 text-muted">
            <span class="font-bold text-ink shrink-0">2.</span>
            <span>Kirim perintah <code class="text-ink font-mono bg-elevated px-1 py-0.5 rounded">/newbot</code>, lalu ikuti instruksi nama dan username bot.</span>
          </div>
          <div class="flex items-start gap-2 text-muted">
            <span class="font-bold text-ink shrink-0">3.</span>
            <span>Salin <strong>HTTP API Token</strong> yang diberikan BotFather dan klik tombol di bawah.</span>
          </div>
        </div>

        <button
          type="button"
          class="mt-6 flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-xs font-bold text-base hover:bg-accent-dim transition shadow-md"
          @click="openAddBotModal"
        >
          <span>🚀</span>
          <span>Hubungkan Bot Telegram Sekarang</span>
        </button>
      </div>

      <!-- Bot Cards Grid -->
      <div v-else class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xs font-bold uppercase tracking-wider text-muted">
            Daftar Bot Terdaftar ({{ bots.length }})
          </h2>
          <span class="text-xs text-muted">
            Klik tombol <strong>Kelola Perintah</strong> pada bot untuk menambah perintah baru.
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="bot in bots"
            :key="bot.id"
            class="flex flex-col rounded-xl border border-line bg-panel p-5 transition hover:border-accent/40 hover:shadow-lg relative group"
          >
            <!-- Card Header -->
            <div class="flex items-start justify-between gap-3 pb-3 border-b border-line">
              <div class="flex items-center gap-3 min-w-0">
                <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-elevated border border-line text-2xl">
                  🤖
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5">
                    <h3 class="text-sm font-bold text-ink truncate">{{ bot.name }}</h3>
                  </div>
                  <a
                    v-if="bot.username"
                    :href="`https://t.me/${bot.username}`"
                    target="_blank"
                    class="text-[11px] font-mono text-accent hover:underline flex items-center gap-1 truncate"
                  >
                    <span>@{{ bot.username }}</span>
                    <span class="text-[9px]">↗</span>
                  </a>
                  <span v-else class="text-[10px] text-muted">Username belum terverifikasi</span>
                </div>
              </div>

              <!-- Status Badge -->
              <div class="shrink-0 flex flex-col items-end gap-1">
                <span
                  v-if="bot.runtimeStatus === 'listening'"
                  class="flex items-center gap-1.5 rounded-full bg-running/15 px-2.5 py-1 text-[10px] font-bold text-running border border-running/30"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-running animate-pulse"></span>
                  Listening
                </span>
                <span
                  v-else-if="bot.runtimeStatus === 'error'"
                  class="flex items-center gap-1.5 rounded-full bg-stopped/15 px-2.5 py-1 text-[10px] font-bold text-stopped border border-stopped/30"
                  :title="bot.lastError || 'Error pada bot'"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-stopped"></span>
                  Error
                </span>
                <span
                  v-else
                  class="flex items-center gap-1.5 rounded-full bg-muted/15 px-2.5 py-1 text-[10px] font-semibold text-muted border border-line"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-muted"></span>
                  Nonaktif
                </span>
              </div>
            </div>

            <!-- Card Body / Specs -->
            <div class="py-4 space-y-2.5 text-xs flex-1">
              <div class="flex items-center justify-between text-muted">
                <span>Default Chat ID:</span>
                <span class="font-mono text-ink bg-elevated px-2 py-0.5 rounded border border-line">
                  {{ bot.defaultChatId || 'Belum diatur' }}
                </span>
              </div>

              <div class="flex items-center justify-between text-muted">
                <span>Whitelist Chat ID:</span>
                <span class="text-ink font-semibold">
                  {{ bot.allowedChatIds?.length ? `${bot.allowedChatIds.length} ID diizinkan` : 'Semua (Bebas)' }}
                </span>
              </div>

              <div class="flex items-center justify-between text-muted">
                <span>Jumlah Perintah (Commands):</span>
                <span class="font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                  {{ bot.commands?.length || 0 }} Perintah
                </span>
              </div>

              <div v-if="bot.lastError" class="rounded-lg bg-stopped/10 p-2 text-[11px] text-stopped border border-stopped/20">
                <p class="font-bold">Error Terakhir:</p>
                <p class="truncate">{{ bot.lastError }}</p>
              </div>
            </div>

            <!-- Card Actions -->
            <div class="pt-3 border-t border-line flex flex-col gap-2">
              <!-- Row 1: Primary action (Manage commands, test run, ping) -->
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  class="flex items-center justify-center gap-1 rounded-lg bg-accent/15 border border-accent/30 py-2 text-[11px] font-bold text-accent hover:bg-accent hover:text-base transition"
                  @click="openCommandModal(bot)"
                >
                  <span>⚙️</span>
                  <span>Kelola</span>
                </button>

                <button
                  type="button"
                  class="flex items-center justify-center gap-1 rounded-lg bg-elevated border border-line py-2 text-[11px] font-bold text-ink hover:border-accent/40 hover:text-accent transition"
                  title="Coba dan Simulasikan Command"
                  @click="openTesterModal(bot)"
                >
                  <span>🧪</span>
                  <span>Coba</span>
                </button>

                <button
                  type="button"
                  class="flex items-center justify-center gap-1 rounded-lg border border-line bg-elevated py-2 text-[11px] font-semibold text-muted hover:text-ink hover:border-accent/40 transition"
                  title="Kirim Pesan Ping / Tes Koneksi"
                  @click="handleQuickTestBot(bot)"
                >
                  <span>⚡</span>
                  <span>Ping</span>
                </button>
              </div>

              <!-- Row 2: Secondary buttons (Toggle polling, edit, delete) -->
              <div class="flex items-center justify-between gap-2 pt-1 text-xs">
                <button
                  type="button"
                  class="flex-1 flex items-center justify-center gap-1 rounded-md border border-line py-1 px-2 font-medium transition text-[11px]"
                  :class="bot.pollingEnabled ? 'bg-running/10 text-running border-running/30 hover:bg-running/20' : 'bg-elevated text-muted hover:text-ink'"
                  @click="handleToggleBot(bot)"
                >
                  <span>{{ bot.pollingEnabled ? '⏸ Matikan Polling' : '▶ Aktifkan Polling' }}</span>
                </button>

                <button
                  type="button"
                  class="rounded-md border border-line bg-elevated p-1.5 text-muted hover:text-ink hover:bg-line transition"
                  title="Edit Pengaturan Bot"
                  @click="openEditBotModal(bot)"
                >
                  ✏️
                </button>

                <button
                  type="button"
                  class="rounded-md border border-stopped/30 bg-stopped/10 p-1.5 text-stopped hover:bg-stopped hover:text-base transition"
                  title="Hapus Bot"
                  @click="handleDeleteBot(bot)"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- MODAL: Tambah / Edit Bot -->
    <div
      v-if="showBotModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-xs"
    >
      <div class="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 shadow-2xl space-y-4">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">🤖</span>
            <h2 class="text-base font-bold text-ink">
              {{ isEditingBot ? "Edit Telegram Bot" : "Tambah Telegram Bot Baru" }}
            </h2>
          </div>
          <button
            type="button"
            class="text-muted hover:text-ink font-bold text-base"
            @click="showBotModal = false"
          >
            ✕
          </button>
        </div>

        <div class="space-y-4 text-xs">
          <!-- Bot Name -->
          <div>
            <label class="block font-semibold text-muted mb-1">Nama Bot / Label</label>
            <input
              v-model="botForm.name"
              type="text"
              placeholder="Contoh: Server Alert Bot / DevOps Controller"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent"
            />
          </div>

          <!-- Bot Token -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-semibold text-muted">Telegram Bot Token <span class="text-accent">*</span></label>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                class="text-[10px] text-accent hover:underline flex items-center gap-0.5"
              >
                Dapatkan token di @BotFather ↗
              </a>
            </div>
            <div class="relative">
              <input
                v-model="botForm.token"
                :type="showToken ? 'text' : 'password'"
                placeholder="123456789:ABCdefGhIJKlmNoPQRstUVwxyZ"
                class="w-full rounded-lg border border-line bg-base pl-3 pr-20 py-2 text-ink font-mono outline-none focus:border-accent"
              />
              <div class="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button
                  type="button"
                  class="text-[10px] text-muted hover:text-ink px-1.5 py-1 rounded bg-elevated"
                  @click="showToken = !showToken"
                >
                  {{ showToken ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Default Chat ID -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="font-semibold text-muted">Default Chat ID (Untuk Notifikasi/Alert)</label>
              <span class="text-[10px] text-muted">Gunakan @userinfobot untuk cek Chat ID Anda</span>
            </div>
            <input
              v-model="botForm.defaultChatId"
              type="text"
              placeholder="Contoh: 123456789 atau -1001234567890 (Grup)"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink font-mono outline-none focus:border-accent"
            />
          </div>

          <!-- Allowed Chat IDs (Whitelist) -->
          <div>
            <label class="block font-semibold text-muted mb-1">
              Allowed Chat IDs (Security Whitelist)
            </label>
            <p class="text-[11px] text-muted mb-1.5">
              Hanya Chat ID di bawah yang diizinkan menjalankan perintah bot. Pisahkan dengan baris baru atau koma. (Kosongkan jika terbuka).
            </p>
            <textarea
              v-model="botForm.allowedChatIdsText"
              rows="2"
              placeholder="123456789&#10;987654321"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink font-mono outline-none focus:border-accent resize-none"
            ></textarea>
          </div>

          <!-- Polling Checkbox -->
          <div class="flex items-center gap-2 pt-1">
            <input
              id="pollingToggle"
              v-model="botForm.pollingEnabled"
              type="checkbox"
              class="rounded border-line bg-base text-accent focus:ring-accent"
            />
            <label for="pollingToggle" class="font-medium text-ink cursor-pointer">
              Aktifkan Long Polling (Bot otomatis merespon command Telegram secara realtime)
            </label>
          </div>

          <!-- Test Button Inside Modal -->
          <div class="pt-1">
            <button
              type="button"
              class="w-full flex items-center justify-center gap-1.5 rounded-lg border border-line bg-elevated py-2 font-semibold text-ink hover:border-accent/40 transition"
              :disabled="isTestingToken"
              @click="handleTestToken"
            >
              <span :class="isTestingToken ? 'animate-spin' : ''">⚡</span>
              <span>{{ isTestingToken ? "Memeriksa Token..." : "Uji Koneksi Token & Kirim Pesan Tes" }}</span>
            </button>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button
            type="button"
            class="rounded-lg border border-line bg-elevated px-4 py-2 text-xs font-semibold text-muted hover:text-ink transition"
            @click="showBotModal = false"
          >
            Batal
          </button>
          <button
            type="button"
            class="rounded-lg bg-accent px-5 py-2 text-xs font-bold text-base hover:bg-accent-dim transition"
            @click="handleSaveBot"
          >
            {{ isEditingBot ? "Simpan Perubahan" : "Tambahkan Bot" }}
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: Kelola Perintah (Command Manager) -->
    <div
      v-if="showCommandModal && selectedBot"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-xs"
    >
      <div class="w-full max-w-3xl rounded-2xl border border-line bg-panel p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-line pb-3 shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold">
              ⌨️
            </div>
            <div>
              <h2 class="text-base font-bold text-ink">
                Kelola Perintah: {{ selectedBot.name }}
              </h2>
              <p class="text-xs text-muted font-mono">
                @{{ selectedBot.username || 'bot' }} • {{ selectedBot.commands?.length || 0 }} Perintah Terdaftar
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-lg bg-accent/15 border border-accent/30 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent hover:text-base transition"
              :disabled="isSyncingCommands"
              title="Daftarkan perintah ke Telegram agar muncul di autocomplete menu aplikasi Telegram"
              @click="handleSyncCommandsToTelegram"
            >
              <span :class="isSyncingCommands ? 'animate-spin' : ''">🔄</span>
              <span>Sync ke Telegram App</span>
            </button>

            <button
              type="button"
              class="text-muted hover:text-ink font-bold text-base px-1"
              @click="showCommandModal = false"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto space-y-5 pr-1 text-xs">
          <!-- Form Tambah / Edit Command -->
          <div class="rounded-xl border border-accent/30 bg-base/70 p-4 space-y-3">
            <div class="flex items-center justify-between border-b border-line/60 pb-2">
              <h3 class="font-bold text-accent text-xs">
                {{ isEditingCommand ? `Edit Perintah: /${commandForm.command}` : "+ Tambah Perintah Kustom Baru" }}
              </h3>
              <button
                v-if="isEditingCommand"
                type="button"
                class="text-[11px] text-muted hover:text-ink underline"
                @click="resetCommandForm"
              >
                Batal Edit
              </button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <!-- Command Name -->
              <div>
                <label class="block font-semibold text-muted mb-1">Nama Perintah <span class="text-accent">*</span></label>
                <div class="flex items-center">
                  <span class="rounded-l-lg border border-r-0 border-line bg-elevated px-2.5 py-2 font-mono text-muted">/</span>
                  <input
                    v-model="commandForm.command"
                    type="text"
                    placeholder="misal: start_backend, status_db"
                    class="w-full rounded-r-lg border border-line bg-base px-3 py-2 text-ink font-mono outline-none focus:border-accent"
                  />
                </div>
              </div>

              <!-- Action Type -->
              <div>
                <label class="block font-semibold text-muted mb-1">Tipe Aksi <span class="text-accent">*</span></label>
                <select
                  v-model="commandForm.actionType"
                  class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent"
                >
                  <option value="built-in">Built-in (Status / Start / Stop / Restart / Logs / Help)</option>
                  <option value="project_action">Project Spesifik (Jalankan / Hentikan Project Tertentu)</option>
                  <option value="custom_response">Respon Teks Kustom (Balas Pesan Otomatis)</option>
                </select>
              </div>
            </div>

            <!-- Dynamic Settings based on Action Type -->
            <div v-if="commandForm.actionType === 'built-in'" class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-muted mb-1">Pilih Aksi Built-in</label>
                <select
                  v-model="commandForm.action"
                  class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent"
                >
                  <option value="status">status — Cek status & resource semua project</option>
                  <option value="start">start — Jalankan project (/start &lt;id&gt;)</option>
                  <option value="stop">stop — Hentikan project (/stop &lt;id&gt;)</option>
                  <option value="restart">restart — Restart project (/restart &lt;id&gt;)</option>
                  <option value="logs">logs — Tampilkan log project (/logs &lt;id&gt;)</option>
                  <option value="help">help — Panduan perintah bot</option>
                </select>
              </div>
            </div>

            <div v-else-if="commandForm.actionType === 'project_action'" class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block font-semibold text-muted mb-1">Target Project</label>
                <select
                  v-model="commandForm.targetProjectId"
                  class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent"
                >
                  <option :value="null">-- Pilih Target Project --</option>
                  <option v-for="proj in projects" :key="proj.id" :value="proj.id">
                    {{ proj.name }} ({{ proj.id }})
                  </option>
                </select>
              </div>

              <div>
                <label class="block font-semibold text-muted mb-1">Aksi Project</label>
                <select
                  v-model="commandForm.action"
                  class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent"
                >
                  <option value="start">Mulai Project (Start)</option>
                  <option value="stop">Hentikan Project (Stop)</option>
                  <option value="restart">Restart Project (Restart)</option>
                  <option value="logs">Lihat Log Project (Logs)</option>
                </select>
              </div>
            </div>

            <div v-else-if="commandForm.actionType === 'custom_response'">
              <label class="block font-semibold text-muted mb-1">
                Teks Balasan (Mendukung placeholder: {date}, {time}, {uptime})
              </label>
              <textarea
                v-model="commandForm.customResponse"
                rows="2"
                placeholder="Halo Admin! Server berjalan normal sejak {uptime}."
                class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent resize-none"
              ></textarea>
            </div>

            <!-- Description -->
            <div>
              <label class="block font-semibold text-muted mb-1">Deskripsi Perintah (Muncul di Telegram)</label>
              <input
                v-model="commandForm.description"
                type="text"
                placeholder="Contoh: Mulai backend aira secara instan"
                class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent"
              />
            </div>

            <div class="flex justify-end pt-1">
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-bold text-base hover:bg-accent-dim transition"
                @click="handleSaveCommand"
              >
                <span>💾</span>
                <span>{{ isEditingCommand ? "Update Perintah" : "Simpan Perintah" }}</span>
              </button>
            </div>
          </div>

          <!-- Existing Commands Table / List -->
          <div class="space-y-2">
            <h3 class="font-bold text-ink text-xs uppercase tracking-wider">
              Daftar Perintah Aktif ({{ selectedBot.commands?.length || 0 }})
            </h3>

            <div class="divide-y divide-line rounded-xl border border-line bg-base/50 overflow-hidden">
              <div
                v-for="cmd in selectedBot.commands"
                :key="cmd.command"
                class="flex items-center justify-between p-3 transition hover:bg-elevated/60"
              >
                <div class="flex items-start gap-3 min-w-0">
                  <span class="rounded bg-accent/15 px-2 py-1 font-mono font-bold text-accent text-xs shrink-0">
                    /{{ cmd.command }}
                  </span>
                  <div class="min-w-0">
                    <p class="font-medium text-ink truncate">{{ cmd.description }}</p>
                    <div class="flex items-center gap-2 text-[11px] text-muted mt-0.5">
                      <span class="rounded bg-elevated px-1.5 py-0.5 border border-line text-[10px]">
                        {{ cmd.actionType }}
                      </span>
                      <span v-if="cmd.targetProjectId" class="text-accent">
                        Target: {{ cmd.targetProjectId }} ({{ cmd.action }})
                      </span>
                      <span v-else-if="cmd.action">
                        Aksi: {{ cmd.action }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 shrink-0 ml-3">
                  <button
                    type="button"
                    class="flex items-center gap-1 rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent hover:text-base transition"
                    title="Uji Coba Perintah Ini"
                    @click="openTesterModal(selectedBot, cmd.command)"
                  >
                    <span>▶</span>
                    <span>Coba</span>
                  </button>

                  <button
                    type="button"
                    class="rounded-md border border-line bg-elevated p-1 text-muted hover:text-ink transition text-xs"
                    title="Edit Perintah"
                    @click="editCommand(cmd)"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-stopped/30 bg-stopped/10 p-1 text-stopped hover:bg-stopped hover:text-base transition text-xs"
                    title="Hapus Perintah"
                    @click="handleDeleteCommand(cmd.command)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-line pt-3 flex justify-end shrink-0">
          <button
            type="button"
            class="rounded-lg border border-line bg-elevated px-4 py-1.5 text-xs font-semibold text-muted hover:text-ink transition"
            @click="showCommandModal = false"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: Kirim Pesan Cepat / Broadcast -->
    <div
      v-if="showSendModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-xs"
    >
      <div class="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl space-y-4 text-xs">
        <div class="flex items-center justify-between border-b border-line pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">📨</span>
            <h2 class="text-base font-bold text-ink">Kirim Pesan ke Telegram</h2>
          </div>
          <button
            type="button"
            class="text-muted hover:text-ink font-bold text-base"
            @click="showSendModal = false"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3">
          <!-- Pilih Bot -->
          <div>
            <label class="block font-semibold text-muted mb-1">Pilih Bot Pengirim</label>
            <select
              v-model="sendForm.botId"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent"
            >
              <option value="">Broadcast ke Semua Bot</option>
              <option v-for="b in bots" :key="b.id" :value="b.id">
                {{ b.name }} (@{{ b.username || 'bot' }})
              </option>
            </select>
          </div>

          <!-- Target Chat ID -->
          <div>
            <label class="block font-semibold text-muted mb-1">Target Chat ID (Opsional jika pakai default bot)</label>
            <input
              v-model="sendForm.chatId"
              type="text"
              placeholder="Contoh: 123456789"
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink font-mono outline-none focus:border-accent"
            />
          </div>

          <!-- Message -->
          <div>
            <label class="block font-semibold text-muted mb-1">Isi Pesan (Format Markdown didukung)</label>
            <textarea
              v-model="sendForm.message"
              rows="4"
              placeholder="Contoh: *Pemberitahuan:* Server sedang dalam proses maintenance."
              class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink outline-none focus:border-accent resize-none"
            ></textarea>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button
            type="button"
            class="rounded-lg border border-line bg-elevated px-4 py-2 font-semibold text-muted hover:text-ink transition"
            @click="showSendModal = false"
          >
            Batal
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 font-bold text-base hover:bg-accent-dim transition"
            :disabled="isSendingMessage"
            @click="handleSendMessage"
          >
            <span :class="isSendingMessage ? 'animate-spin' : ''">🚀</span>
            <span>{{ isSendingMessage ? "Mengirim..." : "Kirim Sekarang" }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL / DRAWER: Log Aktivitas -->
    <div
      v-if="showActivityModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-xs"
    >
      <div class="w-full max-w-2xl rounded-2xl border border-line bg-panel p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col text-xs">
        <div class="flex items-center justify-between border-b border-line pb-3 shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-xl">📋</span>
            <h2 class="text-base font-bold text-ink">Log Aktivitas Telegram Realtime</h2>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-md border border-line bg-elevated px-2.5 py-1 text-muted hover:text-ink transition"
              @click="fetchActivityLogs"
            >
              🔄 Refresh
            </button>
            <button
              type="button"
              class="text-muted hover:text-ink font-bold text-base px-1"
              @click="showActivityModal = false"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
          <div v-if="activityLogs.length === 0" class="text-center py-10 text-muted">
            Belum ada aktivitas Telegram tercatat.
          </div>
          <div
            v-for="log in activityLogs"
            :key="log.id"
            class="flex items-start gap-3 rounded-lg border border-line bg-base/60 p-2.5 font-mono text-[11px]"
          >
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase shrink-0"
              :class="{
                'bg-accent/20 text-accent': log.type === 'command',
                'bg-running/20 text-running': log.type === 'message',
                'bg-warn/20 text-warn': log.type === 'alert',
                'bg-stopped/20 text-stopped': log.type === 'error',
                'bg-elevated text-muted': log.type === 'system',
              }"
            >
              {{ log.type }}
            </span>
            <div class="flex-1 min-w-0">
              <p class="text-ink break-words">{{ log.details }}</p>
              <p class="text-[10px] text-muted mt-0.5">{{ new Date(log.timestamp).toLocaleString("id-ID") }}</p>
            </div>
          </div>
        </div>

        <div class="border-t border-line pt-3 flex justify-end shrink-0">
          <button
            type="button"
            class="rounded-lg border border-line bg-elevated px-4 py-1.5 font-semibold text-muted hover:text-ink transition"
            @click="showActivityModal = false"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: Interactive Command Simulator & Tester Terminal -->
    <div
      v-if="showTesterModal && testerBot"
      class="fixed inset-0 z-50 flex items-center justify-center bg-base/80 p-4 backdrop-blur-xs"
    >
      <div class="w-full max-w-2xl rounded-2xl border border-line bg-panel p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col text-xs">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-line pb-3 shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15 text-accent font-bold text-base">
              🧪
            </div>
            <div>
              <h2 class="text-base font-bold text-ink">
                Interactive Command Tester & Simulator
              </h2>
              <p class="text-xs text-muted font-mono">
                Bot: {{ testerBot.name }} (@{{ testerBot.username || 'bot' }})
              </p>
            </div>
          </div>
          <button
            type="button"
            class="text-muted hover:text-ink font-bold text-base px-1"
            @click="showTesterModal = false"
          >
            ✕
          </button>
        </div>

        <div class="space-y-4 overflow-y-auto pr-1">
          <!-- Command Quick Chips -->
          <div>
            <label class="block font-semibold text-muted mb-1.5">Pilih Cepat Perintah Terdaftar:</label>
            <div class="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto">
              <button
                v-for="cmd in testerBot.commands"
                :key="cmd.command"
                type="button"
                class="rounded-md border border-line bg-elevated px-2.5 py-1 text-[11px] font-mono text-ink hover:border-accent hover:text-accent transition flex items-center gap-1"
                :class="testerCommandText === `/${cmd.command}` ? 'border-accent text-accent bg-accent/10 font-bold' : ''"
                @click="testerCommandText = `/${cmd.command}`"
              >
                <span>/{{ cmd.command }}</span>
              </button>
            </div>
          </div>

          <!-- Command Input & Execute Button -->
          <div class="space-y-2">
            <label class="block font-semibold text-muted">Ketik Perintah (Format sama seperti di Telegram):</label>
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <input
                  v-model="testerCommandText"
                  type="text"
                  placeholder="Contoh: /status atau /start all atau /logs aira"
                  class="w-full rounded-lg border border-line bg-base px-3 py-2 text-ink font-mono outline-none focus:border-accent text-xs"
                  @keyup.enter="handleRunTestCommand"
                />
              </div>

              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-base hover:bg-accent-dim transition shrink-0 shadow-sm"
                :disabled="isRunningCommand"
                @click="handleRunTestCommand"
              >
                <span :class="isRunningCommand ? 'animate-spin' : ''">▶</span>
                <span>{{ isRunningCommand ? "Menjalankan..." : "Jalankan Command" }}</span>
              </button>
            </div>

            <!-- Send to Telegram Toggle Option -->
            <div class="flex items-center justify-between pt-1 text-[11px] text-muted">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  v-model="testerSendToChat"
                  type="checkbox"
                  class="rounded border-line bg-base text-accent focus:ring-accent"
                />
                <span>Kirim juga balasan ini ke Telegram Chat (Chat ID: <code class="font-mono text-ink">{{ testerBot.defaultChatId || 'Belum diatur' }}</code>)</span>
              </label>
            </div>
          </div>

          <!-- Live Output Terminal Box -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-muted uppercase tracking-wider text-[10px]">
                Output Balasan Bot (Live Terminal):
              </span>
              <div v-if="testerResultMeta" class="flex items-center gap-2 text-[10px] text-muted font-mono">
                <span v-if="testerResultMeta.sentToTelegram" class="text-running">● Terkirim ke Telegram</span>
                <span v-else class="text-muted">● Simulasi Lokal</span>
                <span>{{ testerResultMeta.timestamp }}</span>
              </div>
            </div>

            <div class="rounded-xl border border-line bg-log p-3.5 font-mono text-[11px] text-ink min-h-[140px] max-h-[300px] overflow-y-auto whitespace-pre-wrap select-text leading-relaxed">
              <p v-if="isRunningCommand" class="text-accent animate-pulse">⚙️ Sedang mengeksekusi perintah...</p>
              <div v-else-if="testerOutput !== null" class="text-ink">
                {{ testerOutput }}
              </div>
              <p v-else class="text-muted/60 italic">
                Klik tombol "Jalankan Command" untuk melihat simulasi output balasan bot di sini.
              </p>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between border-t border-line pt-3 shrink-0">
          <button
            type="button"
            class="text-[11px] text-muted hover:text-ink underline"
            @click="testerOutput = null; testerResultMeta = null"
          >
            Bersihkan Output
          </button>
          <button
            type="button"
            class="rounded-lg border border-line bg-elevated px-4 py-1.5 font-semibold text-muted hover:text-ink transition"
            @click="showTesterModal = false"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
