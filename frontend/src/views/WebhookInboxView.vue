<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import { getSocket } from "../composables/useSocket";
import type {
  IWebhookInboxItem,
  IWebhookInboxList,
  IWebhookThread,
  IWebhookThreadList,
  IWebhookVcard,
  IWebhookConfig,
  WebhookKind,
} from "../types/webhook.types";

const DEFAULT_SYSTEM_PROMPT =
  "Kamu adalah asisten virtual WhatsApp yang ramah, sopan, dan solutif. Jawablah pesan dari pengguna dengan jelas, ringkas, santun, dan dalam Bahasa Indonesia. Hindari jawaban yang terlalu panjang kecuali diminta secara spesifik.";

const loading = ref(true);
const error = ref<string | null>(null);

// Mode Tampilan: "threads" (Per Nomor / Percakapan) atau "messages" (Per Pesan / Log Aliran)
const viewMode = ref<"threads" | "messages">("threads");

// Data Threads (Per Nomor)
const threadsData = ref<IWebhookThreadList | null>(null);
const selectedSender = ref<string | null>(null);
const selectedThread = ref<IWebhookThread | null>(null);
const threadDetailLoading = ref(false);

// Data Flat Messages (Per Pesan)
const inbox = ref<IWebhookInboxList | null>(null);
const selectedId = ref<string | null>(null);
const selected = ref<IWebhookInboxItem | null>(null);
const detailLoading = ref(false);

// Modal Payload Mentah
const payloadModalItem = ref<IWebhookInboxItem | null>(null);

// Konfigurasi Auto-Reply (Dibaca untuk status badge)
const config = ref<IWebhookConfig>({
  autoReplyEnabled: true,
  model: "deepseek-v4-flash",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
});

const kindFilter = ref<"all" | WebhookKind>("all");
const chatTypeFilter = ref<"all" | "direct" | "group">("all");
const search = ref("");
const page = ref(1);

const kindLabel: Record<string, string> = {
  all: "Semua",
  text: "Teks",
  media: "Media",
  contact: "Kontak",
};

const kindIcon = (kind: string) => {
  if (kind === "media") return "📎";
  if (kind === "contact") return "👤";
  return "💬";
};

const formatTime = (iso?: string | null) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
};

const formatBubbleTime = (iso?: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
};

const formatPhoneNumber = (num?: string | null) => {
  if (!num || num === "unknown") return "Nomor Tidak Dikenal";
  if (num.startsWith("62") && num.length >= 10) {
    return `+62 ${num.slice(2, 5)}-${num.slice(5, 9)}-${num.slice(9)}`;
  }
  if (num.startsWith("62")) {
    return `+${num}`;
  }
  return num;
};

const formatBytes = (bytes?: number | null) => {
  if (bytes == null || Number.isNaN(bytes)) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const previewText = (item: IWebhookInboxItem) => {
  if (item.kind === "contact") {
    return contactNameOf(item) || "Kontak / vCard";
  }
  if (item.kind === "media") {
    return item.media?.filename || item.message || "[media]";
  }
  return item.message || "(pesan kosong)";
};

const contactInfoOf = (item: IWebhookInboxItem | null): IWebhookVcard | null => {
  if (!item) return null;
  const v = item.vcardData;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v;
  }
  if (typeof v === "string") {
    const fn = v.match(/^FN:(.+)$/im)?.[1]?.trim() || null;
    const phones = [...v.matchAll(/TEL[^:]*:([^\n]+)/gi)].map((m) => m[1].trim());
    return {
      displayName: fn,
      phoneNumbers: phones,
      emails: [],
      organization: null,
      title: null,
      note: null,
      raw: v,
    };
  }
  if (item.message?.includes("BEGIN:VCARD")) {
    const fn = item.message.match(/^FN:(.+)$/im)?.[1]?.trim() || null;
    return {
      displayName: fn,
      phoneNumbers: [],
      emails: [],
      organization: null,
      title: null,
      note: null,
      raw: item.message,
    };
  }
  return null;
};

const contactNameOf = (item: IWebhookInboxItem) => {
  const info = contactInfoOf(item);
  return info?.displayName || info?.phoneNumbers[0] || "";
};

const selectedContact = computed(() => contactInfoOf(selected.value));

const isImage = computed(() => {
  const mime = selected.value?.media?.mimetype || "";
  return mime.startsWith("image/");
});

const isAudio = computed(() => {
  const mime = selected.value?.media?.mimetype || "";
  return mime.startsWith("audio/");
});

const isVideo = computed(() => {
  const mime = selected.value?.media?.mimetype || "";
  return mime.startsWith("video/");
});

interface IMessageDateGroup {
  dateLabel: string;
  messages: IWebhookInboxItem[];
}

const formatDateGroupLabel = (iso: string) => {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    if (isToday) return "Hari Ini";

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday =
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear();
    if (isYesterday) return "Kemarin";

    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

const groupedThreadMessages = computed(() => {
  if (!selectedThread.value?.messages) return [];
  const groups: IMessageDateGroup[] = [];
  let currentLabel = "";
  let currentGroup: IMessageDateGroup | null = null;

  for (const msg of selectedThread.value.messages) {
    const label = formatDateGroupLabel(msg.receivedAt || msg.timestamp);
    if (label !== currentLabel || !currentGroup) {
      currentLabel = label;
      currentGroup = { dateLabel: label, messages: [] };
      groups.push(currentGroup);
    }
    currentGroup.messages.push(msg);
  }
  return groups;
});

const loadConfig = async () => {
  try {
    const res = await api.getWebhookConfig();
    if (res.config) {
      config.value = {
        autoReplyEnabled: res.config.autoReplyEnabled ?? true,
        model: res.config.model || "deepseek-v4-flash",
        systemPrompt: res.config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      };
    }
  } catch (err) {
    console.error("Gagal memuat status konfigurasi webhook:", err);
  }
};

const loadThreads = async (opts: { silent?: boolean } = {}) => {
  const silent = Boolean(opts.silent || threadsData.value);
  if (!silent) loading.value = true;
  error.value = null;
  try {
    threadsData.value = await api.getWebhookInboxThreads({
      kind: kindFilter.value,
      search: search.value.trim() || undefined,
      chatType: chatTypeFilter.value,
    });
    const threadList = threadsData.value.threads;
    const currentSelected = selectedSender.value;
    if (
      currentSelected &&
      !threadList.some((t) => (t.threadId || t.senderNumber) === currentSelected)
    ) {
      selectedSender.value = (threadList[0]?.threadId || threadList[0]?.senderNumber) || null;
    }
    if (!selectedSender.value && threadList[0]) {
      selectedSender.value = threadList[0].threadId || threadList[0].senderNumber;
    }
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
};

const chatFeedRef = ref<HTMLElement | null>(null);

const inputSimulateMessage = ref("");
const isSendingSimulate = ref(false);

const sendSimulatedMessage = async (customText?: string) => {
  const text = (customText ?? inputSimulateMessage.value).trim();
  if (!text || isSendingSimulate.value) return;

  const isGroup = selectedThread.value?.isGroup || false;
  const targetId =
    selectedThread.value?.threadId ||
    selectedSender.value ||
    "628222222222";
  const sender =
    selectedThread.value?.senderNumber ||
    (isGroup ? "628222222222" : targetId);
  const whatsappNum =
    selectedThread.value?.whatsappNumber || "628111111111";
  const devId =
    selectedThread.value?.deviceId || "device-web-dashboard";

  isSendingSimulate.value = true;
  try {
    await api.sendWebhookMessage({
      message: text,
      senderNumber: sender,
      whatsappNumber: whatsappNum,
      deviceId: devId,
      chatType: isGroup ? "group" : "direct",
      groupId: isGroup ? selectedThread.value?.groupId || null : null,
      groupName: isGroup ? selectedThread.value?.groupName || null : null,
    });
    if (!customText) {
      inputSimulateMessage.value = "";
    }
    if (targetId) {
      await loadThreadDetail(targetId);
    }
    await loadThreads({ silent: true });
    await scrollToBottom();
  } catch (err: any) {
    notify.toast(`Gagal mengirim pesan: ${err?.message}`, "error");
  } finally {
    isSendingSimulate.value = false;
  }
};

const scrollToBottom = async () => {
  await nextTick();
  if (chatFeedRef.value) {
    chatFeedRef.value.scrollTop = chatFeedRef.value.scrollHeight;
  }
};

const loadThreadDetail = async (threadIdOrSender: string) => {
  threadDetailLoading.value = true;
  try {
    selectedThread.value = await api.getWebhookInboxThread(threadIdOrSender);
    await scrollToBottom();
  } catch (err) {
    notify.toast((err as Error).message || "Gagal memuat detail percakapan", "error");
  } finally {
    threadDetailLoading.value = false;
  }
};

const loadInbox = async (opts: { silent?: boolean } = {}) => {
  const silent = Boolean(opts.silent || inbox.value);
  if (!silent) loading.value = true;
  error.value = null;
  try {
    inbox.value = await api.getWebhookInbox({
      page: page.value,
      limit: 40,
      kind: kindFilter.value,
      search: search.value.trim() || undefined,
      chatType: chatTypeFilter.value,
    });
    if (
      selectedId.value &&
      !inbox.value.data.some((item) => item.id === selectedId.value) &&
      page.value === 1
    ) {
      selectedId.value = inbox.value.data[0]?.id || null;
    }
    if (!selectedId.value && inbox.value.data[0]) {
      selectedId.value = inbox.value.data[0].id;
    }
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    loading.value = false;
  }
};

const loadDetail = async (id: string) => {
  detailLoading.value = true;
  try {
    selected.value = await api.getWebhookInboxItem(id);
  } catch (err) {
    notify.toast((err as Error).message || "Gagal memuat detail pesan", "error");
  } finally {
    detailLoading.value = false;
  }
};

const copyToClipboard = async (text: string, label = "Teks") => {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    notify.toast(`${label} disalin ke clipboard`, "success");
  } catch {
    notify.toast("Gagal menyalin", "error");
  }
};

const deleteThread = async (sender: string) => {
  const result = await notify.confirm(
    `Hapus seluruh riwayat chat untuk nomor ${sender}?`,
    "Semua pesan dan file media dari nomor ini akan dihapus permanen.",
    "Ya, Hapus Semua",
    "Batal",
  );
  if (!result) return;
  try {
    await api.deleteWebhookInboxThread(sender);
    notify.toast(`Riwayat percakapan nomor ${sender} dihapus`, "success");
    if (selectedSender.value === sender) {
      selectedSender.value = null;
      selectedThread.value = null;
    }
    await loadThreads();
    await loadInbox({ silent: true });
  } catch (err) {
    notify.toast((err as Error).message, "error");
  }
};

const deleteItemInThread = async (id: string) => {
  const result = await notify.confirm("Hapus pesan ini dari percakapan?");
  if (!result) return;
  try {
    await api.deleteWebhookInboxItem(id);
    notify.toast("Pesan berhasil dihapus", "success");
    if (selectedSender.value) {
      await loadThreadDetail(selectedSender.value);
    }
    await loadThreads({ silent: true });
    await loadInbox({ silent: true });
  } catch (err) {
    notify.toast((err as Error).message, "error");
  }
};

const deleteItem = async (id: string) => {
  const result = await notify.confirm("Hapus pesan ini dari inbox?");
  if (!result) return;
  try {
    await api.deleteWebhookInboxItem(id);
    if (selectedId.value === id) {
      selectedId.value = null;
      selected.value = null;
    }
    await loadInbox();
    await loadThreads({ silent: true });
  } catch (err) {
    notify.toast((err as Error).message, "error");
  }
};

const clearAll = async () => {
  const result = await notify.confirm("Hapus semua pesan webhook yang tersimpan?");
  if (!result) return;
  try {
    await api.clearWebhookInbox();
    selectedId.value = null;
    selected.value = null;
    selectedSender.value = null;
    selectedThread.value = null;
    await Promise.all([loadThreads(), loadInbox()]);
  } catch (err) {
    notify.toast((err as Error).message, "error");
  }
};

const refreshAll = async () => {
  if (viewMode.value === "threads") {
    await loadThreads();
    if (selectedSender.value) await loadThreadDetail(selectedSender.value);
  } else {
    await loadInbox();
    if (selectedId.value) await loadDetail(selectedId.value);
  }
};

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(kindFilter, () => {
  page.value = 1;
  void loadThreads({ silent: true });
  void loadInbox({ silent: true });
});
watch(chatTypeFilter, () => {
  page.value = 1;
  void loadThreads({ silent: true });
  void loadInbox({ silent: true });
});
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void loadThreads({ silent: true });
    void loadInbox({ silent: true });
  }, 250);
});

watch(selectedSender, (sender) => {
  if (sender) void loadThreadDetail(sender);
  else selectedThread.value = null;
});

watch(selectedId, (id) => {
  if (id) void loadDetail(id);
  else selected.value = null;
});

onMounted(async () => {
  try {
    await loadConfig();
  } catch (err) {
    error.value = (err as Error).message;
  }
  await Promise.all([loadThreads(), loadInbox()]);

  const socket = getSocket();
  socket.on("webhook:inbox", () => {
    void loadThreads({ silent: true });
    void loadInbox({ silent: true });
    if (selectedSender.value) void loadThreadDetail(selectedSender.value);
    if (selectedId.value) void loadDetail(selectedId.value);
  });
  socket.on("webhook:config", (updated: IWebhookConfig) => {
    config.value = updated;
  });
});

onUnmounted(() => {
  const socket = getSocket();
  socket.off("webhook:inbox");
  socket.off("webhook:config");
});
</script>

<template>
  <div class="h-full flex flex-col bg-base overflow-hidden">
    <!-- Top Header Bar -->
    <div class="border-b border-line bg-panel px-6 py-4 flex flex-wrap items-center justify-between shrink-0 gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xl shadow-md text-white shrink-0">
          💬
        </div>
        <div class="min-w-0">
          <h1 class="text-base font-bold text-ink flex items-center gap-2">
            Chatbot Inbox
            <RouterLink
              :to="{ name: 'webhook-config' }"
              v-if="config.autoReplyEnabled"
              class="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 hover:bg-emerald-500/25 transition cursor-pointer"
              title="Klik untuk mengubah model & prompt di Pengaturan"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Auto-Reply: {{ config.model }}
              <span class="text-[9px] opacity-70">⚙️</span>
            </RouterLink>
            <RouterLink
              :to="{ name: 'webhook-config' }"
              v-else
              class="rounded-full bg-line border border-line px-2.5 py-0.5 text-[10px] font-mono text-muted hover:text-ink transition cursor-pointer"
              title="Klik untuk mengaktifkan balas otomatis di Pengaturan"
            >
              skip_reply (nonaktif) ⚙️
            </RouterLink>
          </h1>
          <p class="text-xs text-muted truncate">
            {{
              config.autoReplyEnabled
                ? `Auto-reply AI aktif (${config.model}). Pesan WhatsApp tersusun per nomor obrolan.`
                : 'Terima pesan WhatsApp (teks, media, kontak). Auto-reply dinonaktifkan.'
            }}
          </p>
        </div>
      </div>

      <!-- Mode Switcher & Global Actions -->
      <div class="flex items-center gap-3 shrink-0">
        <!-- Segmented Tab Switcher: Per Nomor vs Per Pesan -->
        <div class="flex items-center bg-base border border-line p-1 rounded-xl shadow-inner">
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            :class="viewMode === 'threads' ? 'bg-emerald-600 text-white shadow-xs' : 'text-muted hover:text-ink'"
            @click="viewMode = 'threads'"
          >
            <span>💬</span>
            <span>Per Nomor</span>
            <span
              v-if="threadsData?.totalThreads"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-mono"
              :class="viewMode === 'threads' ? 'bg-white/20 text-white' : 'bg-line text-muted'"
            >
              {{ threadsData.totalThreads }}
            </span>
          </button>
          <button
            type="button"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
            :class="viewMode === 'messages' ? 'bg-emerald-600 text-white shadow-xs' : 'text-muted hover:text-ink'"
            @click="viewMode = 'messages'"
          >
            <span>📋</span>
            <span>Per Pesan</span>
            <span
              v-if="inbox?.total"
              class="rounded-full px-1.5 py-0.2 text-[10px] font-mono"
              :class="viewMode === 'messages' ? 'bg-white/20 text-white' : 'bg-line text-muted'"
            >
              {{ inbox.total }}
            </span>
          </button>
        </div>

        <!-- Tombol Buka Halaman Pengaturan Webhook & AI -->
        <RouterLink
          :to="{ name: 'webhook-config' }"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line transition shadow-xs"
          title="Buka Pengaturan Endpoint Webhook & Balas Otomatis AI"
        >
          <span>⚙️</span>
          <span>Pengaturan Webhook</span>
        </RouterLink>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:bg-line transition shadow-xs"
          @click="refreshAll"
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
          :disabled="!inbox?.counts.all && !threadsData?.totalMessages"
          @click="clearAll"
        >
          Hapus semua
        </button>
      </div>
    </div>

    <!-- Main Workspace -->
    <div class="flex-1 overflow-hidden p-6">
      <div class="h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Kolom Kiri: Daftar Kontak / Percakapan Masuk (Full Height Sidebar) -->
        <div class="lg:col-span-4 min-h-0 rounded-xl border border-line bg-panel flex flex-col overflow-hidden shadow-sm">
          <!-- Filter & Search Toolbar -->
          <div class="p-3 border-b border-line space-y-2.5">
            <div class="relative">
              <input
                v-model="search"
                type="search"
                :placeholder="viewMode === 'threads' ? 'Cari nomor, grup, nama kontak, pesan...' : 'Cari nomor, teks, atau filename...'"
                class="w-full rounded-lg border border-line bg-base pl-3 pr-8 py-1.5 text-xs text-ink outline-none placeholder:text-muted focus:border-emerald-500 transition"
              />
              <span v-if="search" class="absolute right-2.5 top-1.5 text-xs text-muted cursor-pointer" @click="search = ''">✕</span>
            </div>

            <!-- Filter Chat Type: Semua / Japri / Grup -->
            <div class="flex items-center gap-1 border-b border-line/60 pb-2">
              <button
                type="button"
                class="rounded px-2.5 py-1 text-[11px] font-medium transition cursor-pointer"
                :class="chatTypeFilter === 'all' ? 'bg-line text-ink font-bold' : 'text-muted hover:text-ink'"
                @click="chatTypeFilter = 'all'"
              >
                Semua Obrolan
              </button>
              <button
                type="button"
                class="rounded px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                :class="chatTypeFilter === 'direct' ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30' : 'text-muted hover:text-ink'"
                @click="chatTypeFilter = 'direct'"
              >
                <span>👤</span>
                <span>Japri</span>
              </button>
              <button
                type="button"
                class="rounded px-2.5 py-1 text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                :class="chatTypeFilter === 'group' ? 'bg-cyan-500/15 text-cyan-400 font-bold border border-cyan-500/30' : 'text-muted hover:text-ink'"
                @click="chatTypeFilter = 'group'"
              >
                <span>👥</span>
                <span>Grup</span>
              </button>
            </div>

            <!-- Filter Jenis Pesan (Teks / Media / Kontak) -->
            <div class="flex items-center justify-between gap-1">
              <div class="flex items-center gap-1 overflow-x-auto">
                <button
                  v-for="key in (['all', 'text', 'media', 'contact'] as const)"
                  :key="key"
                  type="button"
                  class="rounded px-2 py-0.5 text-[10px] font-medium transition shrink-0"
                  :class="kindFilter === key ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30' : 'text-muted hover:text-ink'"
                  @click="kindFilter = key"
                >
                  {{ kindLabel[key] }}
                  <span v-if="viewMode === 'messages'" class="font-mono">({{ inbox?.counts[key] || 0 }})</span>
                </button>
              </div>
              <span v-if="viewMode === 'threads'" class="text-[10px] font-mono text-muted shrink-0">
                {{ threadsData?.totalThreads || 0 }} percakapan
              </span>
            </div>
          </div>

          <!-- List Content: Threads Mode (Per Nomor & Per Grup) -->
          <div v-if="viewMode === 'threads'" class="flex-1 overflow-y-auto divide-y divide-line/60">
            <div v-if="loading && !threadsData" class="p-3 space-y-2">
              <div v-for="n in 5" :key="n" class="h-16 rounded-xl bg-elevated animate-pulse" />
            </div>
            <div v-else-if="error" class="p-6 text-center text-xs text-red-400">{{ error }}</div>
            <div
              v-else-if="!threadsData?.threads.length"
              class="h-48 flex flex-col items-center justify-center text-center p-6 text-muted space-y-2"
            >
              <span class="text-3xl opacity-40">📭</span>
              <p class="text-xs font-medium">Belum ada obrolan masuk.</p>
              <p class="text-[11px] text-muted/70 max-w-xs">
                Setelah webhook menerima pesan (baik chat personal maupun grup), daftar obrolan akan tersusun di sini.
              </p>
            </div>
            <template v-else>
              <button
                v-for="thread in threadsData.threads"
                :key="thread.threadId || thread.senderNumber"
                type="button"
                class="w-full text-left px-3.5 py-3 transition hover:bg-elevated/70 flex items-start gap-3 cursor-pointer"
                :class="selectedSender === (thread.threadId || thread.senderNumber) ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500' : ''"
                @click="selectedSender = (thread.threadId || thread.senderNumber)"
              >
                <!-- Avatar -->
                <div
                  class="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 shadow-inner"
                  :class="thread.isGroup ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-sm' : 'bg-base border border-line text-emerald-400'"
                >
                  {{ thread.isGroup ? '👥' : (thread.displayName || thread.senderNumber).slice(0, 2).toUpperCase() }}
                </div>
                <!-- Metadata Thread -->
                <div class="min-w-0 flex-1">
                  <div class="flex items-center justify-between gap-1.5">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <span v-if="thread.isGroup" class="rounded px-1.5 py-0.2 bg-cyan-500/15 border border-cyan-500/30 text-[9px] font-mono text-cyan-400 font-bold shrink-0">
                        GRUP
                      </span>
                      <span class="text-xs font-bold text-ink truncate" :class="thread.isGroup ? 'font-sans' : 'font-mono'">
                        {{ thread.isGroup ? (thread.groupName || thread.groupId) : formatPhoneNumber(thread.senderNumber) }}
                      </span>
                    </div>
                    <span class="text-[10px] font-mono text-muted shrink-0">
                      {{ formatTime(thread.lastReceivedAt) }}
                    </span>
                  </div>

                  <div v-if="!thread.isGroup && thread.displayName" class="text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1">
                    <span>👤</span>
                    <span>{{ thread.displayName }}</span>
                  </div>
                  <div v-else-if="thread.isGroup" class="text-[10px] font-mono text-muted truncate">
                    ID: {{ thread.groupId }}
                  </div>

                  <div class="flex items-center justify-between gap-2 mt-1">
                    <p class="text-[11px] text-muted truncate flex-1 flex items-center gap-1">
                      <span class="shrink-0">{{ kindIcon(thread.lastItem.kind) }}</span>
                      <span class="truncate">
                        <span v-if="thread.isGroup && thread.lastItem.senderNumber" class="text-ink/80 font-semibold">{{ thread.lastItem.senderNumber }}: </span>
                        {{ previewText(thread.lastItem) }}
                      </span>
                    </p>
                    <span class="rounded-full bg-elevated border border-line/80 px-1.5 py-0.2 text-[9px] font-mono text-muted shrink-0">
                      {{ thread.messageCount }} pesan
                    </span>
                  </div>
                </div>
              </button>
            </template>
          </div>

            <!-- List Content: Messages Mode (Per Pesan / Flat) -->
            <div v-else class="flex-1 overflow-y-auto">
              <div v-if="loading && !inbox" class="p-3 space-y-2">
                <div v-for="n in 6" :key="n" class="h-14 rounded-lg bg-elevated animate-pulse" />
              </div>
              <div v-else-if="error" class="p-6 text-center text-xs text-red-400">{{ error }}</div>
              <div v-else-if="!inbox?.data.length" class="h-48 flex flex-col items-center justify-center text-center p-6 text-muted space-y-2">
                <span class="text-3xl opacity-40">📭</span>
                <p class="text-xs font-medium">Belum ada pesan masuk.</p>
                <p class="text-[11px] text-muted/70 max-w-xs">
                  Setelah webhook dipasang, teks, media, dan kontak akan muncul di daftar ini.
                </p>
              </div>
              <template v-else>
                <button
                  v-for="item in inbox?.data || []"
                  :key="item.id"
                  type="button"
                  class="w-full text-left border-b border-line px-3 py-2.5 transition hover:bg-elevated cursor-pointer"
                  :class="selectedId === item.id ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500' : ''"
                  @click="selectedId = item.id"
                >
                  <div class="flex items-start gap-2 min-w-0">
                    <span class="text-base shrink-0">{{ kindIcon(item.kind) }}</span>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-bold text-ink truncate font-mono">
                          {{ item.senderNumber || "unknown" }}
                        </span>
                        <span class="text-[10px] font-mono text-muted shrink-0">
                          {{ formatTime(item.receivedAt) }}
                        </span>
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5">
                        <span
                          v-if="item.botReply?.text"
                          class="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.2 text-[9px] font-medium text-emerald-400 shrink-0"
                          title="Sudah dibalas otomatis"
                        >
                          🤖 Dibalas
                        </span>
                        <span
                          v-else-if="item.botReply?.error"
                          class="inline-flex items-center gap-0.5 rounded bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.2 text-[9px] font-medium text-amber-400 shrink-0"
                          title="Gagal membalas"
                        >
                          ⚠️ Gagal
                        </span>
                        <p class="text-[11px] text-muted truncate flex-1">{{ previewText(item) }}</p>
                      </div>
                    </div>
                  </div>
                </button>
              </template>
            </div>

            <!-- Pagination (Hanya saat mode Per Pesan) -->
            <div
              v-if="viewMode === 'messages' && inbox && inbox.totalPages > 1"
              class="border-t border-line p-2 flex items-center justify-between text-[11px] text-muted bg-panel"
            >
              <button
                type="button"
                class="rounded px-2 py-1 hover:bg-elevated disabled:opacity-40"
                :disabled="page <= 1"
                @click="page -= 1; loadInbox()"
              >
                Prev
              </button>
              <span class="font-mono">{{ page }} / {{ inbox.totalPages }}</span>
              <button
                type="button"
                class="rounded px-2 py-1 hover:bg-elevated disabled:opacity-40"
                :disabled="page >= inbox.totalPages"
                @click="page += 1; loadInbox()"
              >
                Next
              </button>
            </div>
          </div>

        <!-- Kolom Kanan: Tampilan Detail / Riwayat Chat -->
        <div class="lg:col-span-8 min-h-0 rounded-xl border border-line bg-panel flex flex-col overflow-hidden shadow-sm">
          <!-- VIEW 1: MODE PER NOMOR (THREAD CHAT STREAM) -->
          <template v-if="viewMode === 'threads'">
            <div v-if="threadDetailLoading && !selectedThread" class="flex-1 p-6 space-y-4">
              <div class="h-10 w-1/3 bg-elevated rounded-xl animate-pulse" />
              <div class="h-28 bg-elevated rounded-2xl animate-pulse" />
              <div class="h-28 bg-elevated rounded-2xl animate-pulse ml-auto max-w-xl" />
            </div>
            <div
              v-else-if="!selectedThread"
              class="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted space-y-3"
            >
              <span class="text-4xl opacity-40">💬</span>
              <p class="text-sm font-bold text-ink">Pilih nomor di sebelah kiri</p>
              <p class="text-xs text-muted max-w-sm leading-relaxed">
                Riwayat pesan masuk dan balasan otomatis AI untuk nomor tersebut akan tampil lengkap dalam format obrolan.
              </p>
            </div>
            <template v-else>
              <!-- Thread Header -->
              <div class="border-b border-line px-5 py-3.5 flex items-center justify-between gap-4 bg-panel shrink-0">
                <div class="flex items-center gap-3 min-w-0">
                  <div
                    class="h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                    :class="selectedThread.isGroup ? 'bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-lg' : 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'"
                  >
                    {{ selectedThread.isGroup ? '👥' : (selectedThread.displayName || selectedThread.senderNumber).slice(0, 2).toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span
                        v-if="selectedThread.isGroup"
                        class="rounded bg-cyan-500/15 border border-cyan-500/25 px-1.5 py-0.2 text-[10px] font-bold text-cyan-400 font-mono"
                      >
                        GRUP
                      </span>
                      <p
                        class="text-sm font-bold text-ink truncate"
                        :class="selectedThread.isGroup ? 'font-sans' : 'font-mono'"
                      >
                        {{ selectedThread.isGroup ? (selectedThread.groupName || selectedThread.groupId) : formatPhoneNumber(selectedThread.senderNumber) }}
                      </p>
                      <span
                        v-if="!selectedThread.isGroup && selectedThread.displayName"
                        class="rounded bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.2 text-[10px] font-medium text-emerald-400"
                      >
                        {{ selectedThread.displayName }}
                      </span>
                    </div>
                    <p class="text-[11px] text-muted truncate">
                      <span v-if="selectedThread.isGroup">ID Grup: {{ selectedThread.groupId }} · </span>
                      Total {{ selectedThread.messageCount }} pesan
                      <span v-if="selectedThread.whatsappNumber">· ke {{ selectedThread.whatsappNumber }}</span>
                      <span v-if="selectedThread.deviceId">· Device: {{ selectedThread.deviceId }}</span>
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs text-ink hover:bg-line transition shadow-xs"
                    @click="copyToClipboard(selectedThread.isGroup ? (selectedThread.groupId || '') : selectedThread.senderNumber, selectedThread.isGroup ? 'Group ID' : 'Nomor')"
                  >
                    <span>📋</span>
                    <span>{{ selectedThread.isGroup ? 'Salin Group ID' : 'Salin Nomor' }}</span>
                  </button>
                  <button
                    type="button"
                    class="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition shadow-xs"
                    @click="deleteThread(selectedThread.threadId || selectedThread.groupId || selectedThread.senderNumber)"
                  >
                    <span>🗑️</span>
                    <span>{{ selectedThread.isGroup ? 'Hapus Chat Grup' : 'Hapus Chat Nomor Ini' }}</span>
                  </button>
                </div>
              </div>

              <!-- Thread Chat Feed -->
              <div ref="chatFeedRef" class="flex-1 overflow-y-auto p-6 space-y-6 bg-base/50 scroll-smooth">
                <div v-for="group in groupedThreadMessages" :key="group.dateLabel" class="space-y-4">
                  <!-- Date Separator -->
                  <div class="flex items-center justify-center">
                    <span class="rounded-full bg-panel border border-line px-3 py-0.5 text-[10px] font-mono text-muted uppercase tracking-wider shadow-xs">
                      {{ group.dateLabel }}
                    </span>
                  </div>

                  <!-- Messages Stream -->
                  <div v-for="msg in group.messages" :key="msg.id" class="space-y-3">
                    <!-- User Message Bubble (Incoming / Left) -->
                    <div class="max-w-2xl bg-panel border border-line/90 rounded-2xl rounded-tl-sm p-4 space-y-3 shadow-xs">
                      <div class="flex items-center justify-between gap-3 text-[11px] border-b border-line/60 pb-2">
                        <div class="flex items-center gap-1.5 flex-wrap">
                          <span class="font-bold text-ink flex items-center gap-1">
                            <span>{{ kindIcon(msg.kind) }}</span>
                            <span>Pesan Masuk</span>
                          </span>
                          <span v-if="selectedThread.isGroup || msg.chatType === 'group'" class="rounded bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.2 text-[10px] font-mono text-cyan-400 font-semibold">
                            👤 {{ formatPhoneNumber(msg.senderNumber) }}
                          </span>
                          <span class="text-muted text-[10px] font-mono">({{ msg.messageType }})</span>
                        </div>
                        <div class="flex items-center gap-2">
                          <span class="text-[10px] font-mono text-muted">
                            {{ formatBubbleTime(msg.receivedAt || msg.timestamp) }}
                          </span>
                          <button
                            type="button"
                            class="text-[10px] text-muted hover:text-ink hover:underline cursor-pointer"
                            @click="payloadModalItem = msg"
                          >
                            🔍 Payload
                          </button>
                          <button
                            type="button"
                            class="text-[10px] text-red-400 hover:text-red-300 cursor-pointer ml-1"
                            title="Hapus pesan ini"
                            @click="deleteItemInThread(msg.id)"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <!-- Text Message -->
                      <div v-if="msg.kind === 'text'">
                        <p class="text-sm text-ink whitespace-pre-wrap leading-relaxed select-text font-sans">
                          {{ msg.message || "(pesan kosong)" }}
                        </p>
                      </div>

                      <!-- Media Message -->
                      <div v-else-if="msg.kind === 'media'" class="space-y-3">
                        <img
                          v-if="msg.media?.mimetype?.startsWith('image/') && msg.hasLocalMedia"
                          :src="api.getWebhookMediaUrl(msg.id)"
                          :alt="msg.media?.filename || 'media'"
                          class="max-h-72 rounded-lg border border-line object-contain bg-black/30"
                        />
                        <audio
                          v-else-if="msg.media?.mimetype?.startsWith('audio/') && msg.hasLocalMedia"
                          :src="api.getWebhookMediaUrl(msg.id)"
                          controls
                          class="w-full"
                        />
                        <video
                          v-else-if="msg.media?.mimetype?.startsWith('video/') && msg.hasLocalMedia"
                          :src="api.getWebhookMediaUrl(msg.id)"
                          controls
                          class="max-h-72 w-full rounded-lg bg-black"
                        />
                        <div class="flex items-center justify-between text-[11px] font-mono text-muted bg-base p-2.5 rounded-lg border border-line">
                          <span class="truncate">
                            📎 {{ msg.media?.filename || 'file' }} ({{ formatBytes(msg.media?.localSize || msg.media?.filesize) }})
                          </span>
                          <a
                            v-if="msg.hasLocalMedia"
                            :href="api.getWebhookMediaUrl(msg.id)"
                            download
                            class="text-emerald-400 font-semibold hover:underline ml-2 shrink-0"
                          >
                            Unduh
                          </a>
                        </div>
                        <p v-if="msg.message" class="text-xs text-ink/90 whitespace-pre-wrap">{{ msg.message }}</p>
                      </div>

                      <!-- Contact Message -->
                      <div v-else-if="msg.kind === 'contact'" class="bg-base p-3 rounded-lg border border-line space-y-2">
                        <div class="flex items-center gap-2">
                          <span class="text-xl">👤</span>
                          <div>
                            <p class="text-xs font-bold text-ink">
                              {{ contactNameOf(msg) || 'Kontak WhatsApp' }}
                            </p>
                            <p v-if="contactInfoOf(msg)?.organization" class="text-[10px] text-muted">
                              {{ contactInfoOf(msg)?.organization }}
                            </p>
                          </div>
                        </div>
                        <div v-if="contactInfoOf(msg)?.phoneNumbers?.length" class="space-y-1 pt-1.5 border-t border-line">
                          <div
                            v-for="phone in contactInfoOf(msg)?.phoneNumbers || []"
                            :key="phone"
                            class="flex items-center justify-between text-xs font-mono text-emerald-400"
                          >
                            <span>{{ phone }}</span>
                            <button
                              type="button"
                              class="text-[10px] text-muted hover:text-ink"
                              @click="copyToClipboard(phone, 'Nomor')"
                            >
                              Salin
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- AI Auto Reply or System Command Bubble (Outgoing / Right) -->
                    <div
                      v-if="msg.botReply?.text || msg.botReply?.payload"
                      class="max-w-2xl bg-gradient-to-br from-emerald-950/20 to-panel border border-emerald-500/30 rounded-2xl rounded-tr-sm p-4 space-y-3 ml-auto shadow-sm"
                    >
                      <div class="flex items-center justify-between gap-3 text-[11px] border-b border-emerald-500/20 pb-2">
                        <div class="flex items-center gap-1.5 font-bold" :class="msg.botReply.model === 'system-command' ? 'text-amber-400' : 'text-emerald-400'">
                          <span>{{ msg.botReply.model === 'system-command' ? '⚡' : '🤖' }}</span>
                          <span>{{ msg.botReply.model === 'system-command' ? 'Perintah Sistem (Tanpa AI)' : 'Balasan Otomatis WhatsApp' }}</span>
                          <span class="text-[10px] font-mono text-muted font-normal">({{ msg.botReply.model }})</span>
                        </div>
                        <span class="text-[10px] font-mono text-muted">
                          {{ formatBubbleTime(msg.botReply.repliedAt) }}
                        </span>
                      </div>

                      <!-- Interactive Buttons View -->
                      <div v-if="msg.botReply.payload?.type === 'interactive'" class="space-y-3">
                        <div v-if="msg.botReply.payload.title" class="font-bold text-ink text-sm flex items-center gap-1.5">
                          <span>{{ msg.botReply.payload.title }}</span>
                        </div>
                        <div class="rounded-lg bg-base/80 p-3 border border-emerald-500/20 text-sm text-ink whitespace-pre-wrap leading-relaxed select-text font-sans">
                          {{ msg.botReply.payload.body }}
                        </div>
                        <div v-if="msg.botReply.payload.footer" class="text-[10px] text-muted font-mono italic px-1">
                          {{ msg.botReply.payload.footer }}
                        </div>

                        <!-- Buttons Grid -->
                        <div class="pt-1 flex flex-wrap gap-2">
                          <button
                            v-for="btn in msg.botReply.payload.buttons || []"
                            :key="btn.id || btn.displayText"
                            type="button"
                            class="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25 hover:border-accent/60 transition shadow-2xs active:scale-95 cursor-pointer"
                            @click="sendSimulatedMessage(btn.id || btn.displayText)"
                            :title="`Kirim respon tombol: ${btn.displayText}`"
                          >
                            <span>{{ btn.displayText }}</span>
                          </button>
                        </div>
                      </div>

                      <!-- Text or Other View -->
                      <div v-else class="rounded-lg bg-base/80 p-3 border border-emerald-500/20 text-sm text-ink whitespace-pre-wrap leading-relaxed select-text font-sans">
                        {{ msg.botReply.text }}
                      </div>
                    </div>

                    <!-- AI Auto Reply Error Bubble -->
                    <div
                      v-else-if="msg.botReply?.error"
                      class="max-w-2xl bg-amber-950/20 border border-amber-500/30 rounded-2xl rounded-tr-sm p-3.5 space-y-1 ml-auto text-xs text-amber-300"
                    >
                      <div class="flex items-center gap-1.5 font-bold">
                        <span>⚠️</span>
                        <span>Balasan Otomatis Gagal Terkirim</span>
                      </div>
                      <p class="text-[11px] text-amber-200/80">{{ msg.botReply.error }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bottom Interactive Command Composer Bar -->
              <div class="border-t border-line bg-panel p-3 shrink-0 space-y-2">
                <!-- Quick Trigger Pills -->
                <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <span class="text-[11px] font-mono text-muted shrink-0 mr-1">Perintah:</span>
                  <button
                    type="button"
                    class="rounded-lg bg-accent/10 border border-accent/30 hover:bg-accent/20 px-2.5 py-1 text-[11px] font-semibold text-accent transition shrink-0 active:scale-95 cursor-pointer"
                    @click="sendSimulatedMessage('/start')"
                    title="Kirim /start untuk menampilkan menu interaktif"
                  >
                    ⚡ /start
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-elevated hover:bg-line border border-line px-2.5 py-1 text-[11px] font-mono text-ink transition shrink-0 active:scale-95 cursor-pointer"
                    @click="sendSimulatedMessage('/info')"
                    title="Kirim /info untuk menampilkan info sistem"
                  >
                    ℹ️ /info
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-elevated hover:bg-line border border-line px-2.5 py-1 text-[11px] font-mono text-ink transition shrink-0 active:scale-95 cursor-pointer"
                    @click="sendSimulatedMessage('/status')"
                    title="Kirim /status untuk menampilkan status real-time"
                  >
                    📊 /status
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-elevated hover:bg-line border border-line px-2.5 py-1 text-[11px] font-mono text-ink transition shrink-0 active:scale-95 cursor-pointer"
                    @click="sendSimulatedMessage('/clear')"
                    title="Kirim /clear untuk reset percakapan nomor ini"
                  >
                    🧹 /clear
                  </button>
                </div>

                <!-- Text Input Form -->
                <form class="flex items-center gap-2" @submit.prevent="sendSimulatedMessage()">
                  <input
                    v-model="inputSimulateMessage"
                    type="text"
                    placeholder="Kirim pesan WhatsApp (ketik /start, info, status, atau pertanyaan ke AI)..."
                    class="flex-1 rounded-xl border border-line bg-base px-3.5 py-2 text-xs text-ink placeholder:text-muted/60 focus:border-accent focus:outline-hidden"
                    :disabled="isSendingSimulate"
                  />
                  <button
                    type="submit"
                    class="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-xs font-semibold text-base hover:bg-accent-dim transition disabled:opacity-40 cursor-pointer shrink-0"
                    :disabled="!inputSimulateMessage.trim() || isSendingSimulate"
                  >
                    <span v-if="!isSendingSimulate">Kirim ➤</span>
                    <span v-else class="animate-spin text-xs">⏳</span>
                  </button>
                </form>
              </div>
            </template>
          </template>

          <!-- VIEW 2: MODE PER PESAN (SINGLE MESSAGE INSPECT) -->
          <template v-else>
            <div v-if="detailLoading && !selected" class="flex-1 p-6 space-y-3">
              <div class="h-6 w-1/3 bg-elevated rounded animate-pulse" />
              <div class="h-24 bg-elevated rounded animate-pulse" />
              <div class="h-40 bg-elevated rounded animate-pulse" />
            </div>
            <div v-else-if="!selected" class="flex-1 flex items-center justify-center text-xs text-muted">
              Pilih pesan di kiri untuk melihat detail.
            </div>
            <template v-else>
              <div class="border-b border-line px-5 py-3 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-bold text-ink font-mono truncate">
                    {{ selected.senderNumber || "unknown sender" }}
                  </p>
                  <p class="text-[11px] text-muted">
                    ke {{ selected.whatsappNumber || "-" }}
                    · {{ selected.deviceId || "-" }}
                    · {{ selected.messageType }}
                    · {{ selected.chatType }}
                  </p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10 cursor-pointer"
                  @click="deleteItem(selected.id)"
                >
                  Hapus
                </button>
              </div>

              <div class="flex-1 overflow-y-auto p-5 space-y-4">
                <div v-if="selected.kind === 'text'" class="rounded-lg border border-line bg-base p-4">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Pesan</p>
                  <p class="text-sm text-ink whitespace-pre-wrap break-words">{{ selected.message || "(kosong)" }}</p>
                </div>

                <div v-if="selected.kind === 'media'" class="rounded-lg border border-line bg-base p-4 space-y-3">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Media</p>
                  <img
                    v-if="isImage && selected.hasLocalMedia"
                    :src="api.getWebhookMediaUrl(selected.id)"
                    :alt="selected.media?.filename || 'media'"
                    class="max-h-80 rounded-lg border border-line object-contain bg-black/30"
                  />
                  <audio
                    v-else-if="isAudio && selected.hasLocalMedia"
                    :src="api.getWebhookMediaUrl(selected.id)"
                    controls
                    class="w-full"
                  />
                  <video
                    v-else-if="isVideo && selected.hasLocalMedia"
                    :src="api.getWebhookMediaUrl(selected.id)"
                    controls
                    class="max-h-80 w-full rounded-lg bg-black"
                  />
                  <div class="grid grid-cols-2 gap-2 text-[11px] font-mono text-muted">
                    <div>file: {{ selected.media?.filename || "-" }}</div>
                    <div>mime: {{ selected.media?.mimetype || "-" }}</div>
                    <div>size: {{ formatBytes(selected.media?.localSize || selected.media?.filesize) }}</div>
                    <div>local: {{ selected.hasLocalMedia ? "tersimpan" : "tidak ada" }}</div>
                  </div>
                  <p v-if="selected.media?.downloadError" class="text-[11px] text-amber-400">
                    {{ selected.media.downloadError }}
                  </p>
                  <a
                    v-if="selected.hasLocalMedia"
                    :href="api.getWebhookMediaUrl(selected.id)"
                    download
                    class="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-400"
                  >
                    Unduh file
                  </a>
                  <a
                    v-else-if="selected.media?.gcsUrl"
                    :href="selected.media.gcsUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    Buka gcs_url
                  </a>
                </div>

                <div v-if="selected.kind === 'contact'" class="rounded-lg border border-line bg-base p-4 space-y-3">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-muted">Kontak</p>
                  <p class="text-sm font-bold text-ink">
                    {{ selectedContact?.displayName || "Tanpa nama" }}
                  </p>
                  <div v-if="selectedContact?.phoneNumbers?.length" class="space-y-1">
                    <p
                      v-for="phone in selectedContact.phoneNumbers"
                      :key="phone"
                      class="text-xs font-mono text-emerald-300"
                    >
                      {{ phone }}
                    </p>
                  </div>
                  <p v-if="selectedContact?.organization" class="text-xs text-muted">
                    {{ selectedContact.organization }}
                  </p>
                  <pre
                    v-if="selectedContact?.raw"
                    class="text-[11px] font-mono text-ink whitespace-pre-wrap break-words bg-panel p-3 rounded border border-line/60"
                  >{{ selectedContact.raw }}</pre>
                  <pre
                    v-if="selected.contactsArray?.length"
                    class="text-[11px] font-mono text-ink whitespace-pre-wrap break-words bg-panel p-3 rounded border border-line/60"
                  >{{ JSON.stringify(selected.contactsArray, null, 2) }}</pre>
                </div>

                <!-- Tampilan Balasan Otomatis Bot jika ada -->
                <div
                  v-if="selected.botReply?.text"
                  class="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-panel p-4 space-y-3 shadow-sm"
                >
                  <div class="flex items-center justify-between text-xs">
                    <div class="flex items-center gap-2">
                      <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 text-base shadow-sm">
                        🤖
                      </span>
                      <div>
                        <p class="font-bold text-emerald-400 flex items-center gap-1.5">
                          Balasan Otomatis WhatsApp
                        </p>
                        <p class="text-[10px] text-muted font-mono">
                          Model: {{ selected.botReply.model }}
                        </p>
                      </div>
                    </div>
                    <span v-if="selected.botReply.repliedAt" class="text-[10px] font-mono text-muted">
                      {{ formatTime(selected.botReply.repliedAt) }}
                    </span>
                  </div>
                  <div class="rounded-lg bg-base/80 p-3.5 border border-emerald-500/20 shadow-inner">
                    <p class="text-sm text-ink whitespace-pre-wrap leading-relaxed select-text font-sans">
                      {{ selected.botReply.text }}
                    </p>
                  </div>
                </div>

                <div
                  v-else-if="selected.botReply?.error"
                  class="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3.5 text-xs text-amber-300 space-y-1"
                >
                  <div class="flex items-center gap-1.5 font-bold">
                    <span>⚠️</span>
                    <span>Balasan Otomatis Gagal Terkirim</span>
                  </div>
                  <p class="text-[11px] text-amber-200/80">{{ selected.botReply.error }}</p>
                </div>

                <div
                  v-else
                  class="rounded-lg border border-line/60 bg-base/40 px-3.5 py-2.5 text-xs text-muted flex items-center justify-between"
                >
                  <span>Pesan ini tidak dibalas otomatis</span>
                  <span class="text-[10px] font-mono opacity-60">skip_reply: true</span>
                </div>

                <div class="rounded-lg border border-line bg-base p-4">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Payload mentah</p>
                  <pre class="text-[10px] font-mono text-muted whitespace-pre-wrap break-words max-h-64 overflow-auto">{{ JSON.stringify(selected.raw || selected, null, 2) }}</pre>
                </div>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>

    <!-- Modal Payload Mentah -->
    <div
      v-if="payloadModalItem"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div class="bg-panel border border-line rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div class="px-5 py-3.5 border-b border-line flex items-center justify-between bg-panel">
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-ink">Payload Mentah Webhook</span>
            <span class="font-mono text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {{ payloadModalItem.id }}
            </span>
          </div>
          <button
            type="button"
            class="text-muted hover:text-ink text-sm p-1 rounded hover:bg-elevated cursor-pointer"
            @click="payloadModalItem = null"
          >
            ✕
          </button>
        </div>
        <div class="p-4 overflow-auto flex-1 bg-base">
          <pre class="font-mono text-xs text-ink/90 whitespace-pre-wrap leading-relaxed select-text">{{ JSON.stringify(payloadModalItem.raw || payloadModalItem, null, 2) }}</pre>
        </div>
        <div class="px-5 py-3 border-t border-line flex items-center justify-between bg-panel">
          <span class="text-[11px] text-muted font-mono">
            {{ formatTime(payloadModalItem.receivedAt) }}
          </span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg border border-line bg-elevated text-xs text-ink hover:bg-line transition cursor-pointer"
              @click="copyToClipboard(JSON.stringify(payloadModalItem.raw || payloadModalItem, null, 2), 'Payload JSON')"
            >
              Salin JSON
            </button>
            <button
              type="button"
              class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer"
              @click="payloadModalItem = null"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
