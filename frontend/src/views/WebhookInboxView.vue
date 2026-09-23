<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import { getSocket } from "../composables/useSocket";
import type {
  IWebhookInboxItem,
  IWebhookInboxList,
  IWebhookInfo,
  IWebhookVcard,
  WebhookKind,
} from "../types/webhook.types";

const loading = ref(true);
const error = ref<string | null>(null);
const info = ref<IWebhookInfo | null>(null);
const inbox = ref<IWebhookInboxList | null>(null);
const selectedId = ref<string | null>(null);
const selected = ref<IWebhookInboxItem | null>(null);
const detailLoading = ref(false);

const kindFilter = ref<"all" | WebhookKind>("all");
const search = ref("");
const page = ref(1);
const selectedWebhookUrl = ref("");

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

const formatTime = (iso: string) => {
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

const loadInfo = async () => {
  info.value = await api.getWebhookInfo();
  selectedWebhookUrl.value = info.value.lanUrls[0] || info.value.localUrl;
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

const copyUrl = async () => {
  try {
    await navigator.clipboard.writeText(selectedWebhookUrl.value);
    notify.toast("URL webhook disalin", "success");
  } catch {
    notify.toast("Gagal menyalin URL", "error");
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
    await loadInbox();
  } catch (err) {
    notify.toast((err as Error).message, "error");
  }
};

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(kindFilter, () => {
  page.value = 1;
  void loadInbox({ silent: true });
});
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    void loadInbox({ silent: true });
  }, 250);
});

watch(selectedId, (id) => {
  if (id) void loadDetail(id);
  else selected.value = null;
});

onMounted(async () => {
  try {
    await loadInfo();
  } catch (err) {
    error.value = (err as Error).message;
  }
  await loadInbox();

  const socket = getSocket();
  socket.on("webhook:inbox", () => {
    void loadInbox({ silent: true });
    if (selectedId.value) void loadDetail(selectedId.value);
  });
});

onUnmounted(() => {
  const socket = getSocket();
  socket.off("webhook:inbox");
});
</script>

<template>
  <div class="h-full flex flex-col bg-base overflow-hidden">
    <div class="border-b border-line bg-panel px-6 py-4 flex items-center justify-between shrink-0 gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xl shadow-md text-white shrink-0">
          💬
        </div>
        <div class="min-w-0">
          <h1 class="text-base font-bold text-ink flex items-center gap-2">
            Chatbot Inbox
            <span class="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
              skip_reply
            </span>
          </h1>
          <p class="text-xs text-muted truncate">
            Terima pesan WhatsApp (teks, media, kontak). Auto-reply belum diaktifkan.
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:bg-line transition"
          @click="() => loadInbox()"
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition disabled:opacity-40"
          :disabled="!inbox?.counts.all"
          @click="clearAll"
        >
          Hapus semua
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-hidden p-6">
      <div class="h-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div class="lg:col-span-4 flex flex-col gap-4 min-h-0">
          <div class="rounded-xl border border-line bg-panel p-4 space-y-3 shrink-0">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-wider text-muted">Endpoint Webhook</span>
              <span class="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-mono text-emerald-400">
                POST · 200
              </span>
            </div>
            <select
              v-if="info && (info.lanUrls.length > 0 || info.localUrl)"
              v-model="selectedWebhookUrl"
              class="w-full rounded-lg border border-line bg-base px-2.5 py-1.5 text-[11px] font-mono text-ink outline-none"
            >
              <option :value="info.localUrl">Local · {{ info.localUrl }}</option>
              <option v-for="url in info.lanUrls" :key="url" :value="url">
                LAN · {{ url }}
              </option>
            </select>
            <div class="flex items-center gap-2">
              <input
                type="text"
                readonly
                :value="selectedWebhookUrl"
                class="w-full rounded-lg border border-line bg-base px-3 py-2 text-[11px] font-mono text-emerald-300 select-all outline-none"
              />
              <button
                type="button"
                class="shrink-0 rounded-lg border border-line bg-elevated px-2.5 py-2 text-xs text-ink hover:bg-line"
                @click="copyUrl"
              >
                Salin
              </button>
            </div>
            <p class="text-[10px] text-muted leading-relaxed">
              Tempel URL ini di dashboard chatbot. Respons selalu
              <code class="text-emerald-400">{ "skip_reply": true }</code>
              — pesan tetap disimpan di sini.
            </p>
          </div>

          <div class="flex-1 min-h-0 rounded-xl border border-line bg-panel flex flex-col overflow-hidden">
            <div class="p-3 border-b border-line space-y-2">
              <input
                v-model="search"
                type="search"
                placeholder="Cari nomor, teks, atau filename..."
                class="w-full rounded-lg border border-line bg-base px-3 py-1.5 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
              />
              <div class="flex items-center gap-1 overflow-x-auto">
                <button
                  v-for="key in (['all', 'text', 'media', 'contact'] as const)"
                  :key="key"
                  type="button"
                  class="rounded px-2 py-0.5 text-[10px] font-medium transition shrink-0"
                  :class="kindFilter === key ? 'bg-accent/20 text-accent font-bold' : 'text-muted hover:text-ink'"
                  @click="kindFilter = key"
                >
                  {{ kindLabel[key] }}
                  <span class="font-mono">({{ inbox?.counts[key] || 0 }})</span>
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto">
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
                  class="w-full text-left border-b border-line px-3 py-2.5 transition hover:bg-elevated"
                  :class="selectedId === item.id ? 'bg-accent/10' : ''"
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
                      <p class="text-[11px] text-muted truncate">{{ previewText(item) }}</p>
                    </div>
                  </div>
                </button>
              </template>
            </div>

            <div v-if="inbox && inbox.totalPages > 1" class="border-t border-line p-2 flex items-center justify-between text-[11px] text-muted">
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
        </div>

        <div class="lg:col-span-8 min-h-0 rounded-xl border border-line bg-panel flex flex-col overflow-hidden">
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
                class="shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
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

              <div class="rounded-lg border border-line bg-base p-4">
                <p class="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Payload mentah</p>
                <pre class="text-[10px] font-mono text-muted whitespace-pre-wrap break-words max-h-64 overflow-auto">{{ JSON.stringify(selected.raw || selected, null, 2) }}</pre>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
