<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { api } from "../services/api";
import { notify } from "../services/notification.service";
import { getSocket } from "../composables/useSocket";
import type { IWebhookConfig, IWebhookInfo } from "../types/webhook.types";
import type { TokenPortalModel } from "../types/project";

const DEFAULT_SYSTEM_PROMPT =
  "Kamu adalah asisten virtual WhatsApp yang ramah, sopan, dan solutif. Jawablah pesan dari pengguna dengan jelas, ringkas, santun, dan dalam Bahasa Indonesia. Hindari jawaban yang terlalu panjang kecuali diminta secara spesifik.";

const loading = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

const info = ref<IWebhookInfo | null>(null);
const selectedWebhookUrl = ref("");

const config = ref<IWebhookConfig>({
  autoReplyEnabled: true,
  model: "deepseek-v4-flash",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  senderMode: "all",
  allowedSenders: [],
  skipKeywords: [],
  groupMode: "off",
  allowedGroups: [],
});
const allowedSendersInput = ref("");
const skipKeywordsInput = ref("");
const allowedGroupsInput = ref("");
const availableModels = ref<TokenPortalModel[]>([]);

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

const loadData = async () => {
  loading.value = true;
  error.value = null;
  try {
    const [infoRes, configRes] = await Promise.all([
      api.getWebhookInfo(),
      api.getWebhookConfig(),
    ]);
    info.value = infoRes;
    selectedWebhookUrl.value =
      infoRes.lanUrls?.[0] || infoRes.localUrl || "";

    if (configRes.config) {
      config.value = {
        autoReplyEnabled: configRes.config.autoReplyEnabled ?? true,
        model: configRes.config.model || "deepseek-v4-flash",
        systemPrompt: configRes.config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        senderMode: configRes.config.senderMode || "all",
        allowedSenders: configRes.config.allowedSenders || [],
        skipKeywords: configRes.config.skipKeywords || [],
        groupMode: configRes.config.groupMode || "off",
        allowedGroups: configRes.config.allowedGroups || [],
      };
      allowedSendersInput.value = (configRes.config.allowedSenders || []).join("\n");
      skipKeywordsInput.value = (configRes.config.skipKeywords || []).join(", ");
      allowedGroupsInput.value = (configRes.config.allowedGroups || []).join("\n");
    }
    if (configRes.models?.length) {
      availableModels.value = configRes.models;
    }
  } catch (err) {
    error.value = (err as Error).message || "Gagal memuat konfigurasi webhook";
  } finally {
    loading.value = false;
  }
};

const saveConfig = async () => {
  saving.value = true;
  try {
    const parsedAllowed = allowedSendersInput.value
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedSkip = skipKeywordsInput.value
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const parsedGroups = allowedGroupsInput.value
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const updated = await api.updateWebhookConfig({
      autoReplyEnabled: config.value.autoReplyEnabled,
      model: config.value.model,
      systemPrompt: config.value.systemPrompt,
      senderMode: config.value.senderMode,
      allowedSenders: parsedAllowed,
      skipKeywords: parsedSkip,
      groupMode: config.value.groupMode,
      allowedGroups: parsedGroups,
    });
    config.value = {
      autoReplyEnabled: updated.autoReplyEnabled,
      model: updated.model,
      systemPrompt: updated.systemPrompt,
      senderMode: updated.senderMode || "all",
      allowedSenders: updated.allowedSenders || [],
      skipKeywords: updated.skipKeywords || [],
      groupMode: updated.groupMode || "off",
      allowedGroups: updated.allowedGroups || [],
    };
    allowedSendersInput.value = (updated.allowedSenders || []).join("\n");
    skipKeywordsInput.value = (updated.skipKeywords || []).join(", ");
    allowedGroupsInput.value = (updated.allowedGroups || []).join("\n");
    notify.toast(
      updated.autoReplyEnabled
        ? `Konfigurasi disimpan. Balas otomatis aktif (${updated.model})`
        : "Konfigurasi disimpan. Balas otomatis dinonaktifkan.",
      "success",
    );
  } catch (err) {
    notify.toast((err as Error).message || "Gagal menyimpan konfigurasi", "error");
  } finally {
    saving.value = false;
  }
};

const resetPrompt = () => {
  config.value.systemPrompt = DEFAULT_SYSTEM_PROMPT;
  notify.toast("Prompt di-reset ke pengaturan default", "info");
};

onMounted(() => {
  void loadData();

  const socket = getSocket();
  socket.on("webhook:config", (updated: IWebhookConfig) => {
    config.value = {
      ...config.value,
      ...updated,
    };
  });
});

onUnmounted(() => {
  const socket = getSocket();
  socket.off("webhook:config");
});
</script>

<template>
  <div class="h-full flex flex-col bg-base overflow-y-auto">
    <!-- Top Header Bar -->
    <div class="border-b border-line bg-panel px-6 py-4 flex flex-wrap items-center justify-between shrink-0 gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-xl shadow-md text-white shrink-0">
          ⚙️
        </div>
        <div class="min-w-0">
          <h1 class="text-base font-bold text-ink flex items-center gap-2">
            Pengaturan Webhook & Balas Otomatis AI
            <span
              v-if="config.autoReplyEnabled"
              class="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 flex items-center gap-1"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Auto-Reply Aktif ({{ config.model }})
            </span>
            <span
              v-else
              class="rounded-full bg-line border border-line px-2 py-0.5 text-[10px] font-mono text-muted"
            >
              Auto-Reply Nonaktif
            </span>
          </h1>
          <p class="text-xs text-muted truncate">
            Kelola URL endpoint penerima webhook WhatsApp, token keamanan, dan konfigurasi bot AI penjawab otomatis.
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-3 shrink-0">
        <RouterLink
          :to="{ name: 'webhook' }"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line transition shadow-xs"
        >
          <span>💬</span>
          <span>Buka Chat Inbox</span>
        </RouterLink>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink hover:bg-line transition shadow-xs"
          @click="loadData"
        >
          <span>🔄</span>
          <span>Refresh</span>
        </button>

        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-1.5 text-xs transition shadow-sm disabled:opacity-50 cursor-pointer"
          :disabled="saving"
          @click="saveConfig"
        >
          <span v-if="saving" class="animate-spin text-xs">⏳</span>
          <span>{{ saving ? "Menyimpan..." : "Simpan Perubahan" }}</span>
        </button>
      </div>
    </div>

    <!-- Main Content Container -->
    <div class="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
      <div v-if="loading" class="space-y-4">
        <div class="h-44 bg-panel rounded-2xl border border-line animate-pulse" />
        <div class="h-96 bg-panel rounded-2xl border border-line animate-pulse" />
      </div>

      <div v-else-if="error" class="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-center text-sm text-red-400">
        {{ error }}
      </div>

      <template v-else>
        <!-- Card 1: Konfigurasi Endpoint Webhook -->
        <div class="rounded-2xl border border-line bg-panel p-6 shadow-sm space-y-5">
          <div class="flex items-center justify-between pb-3 border-b border-line">
            <div class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 text-lg">
                🌐
              </span>
              <div>
                <h2 class="text-sm font-bold text-ink">Endpoint Webhook WhatsApp</h2>
                <p class="text-xs text-muted">URL penerima callback JSON dari dashboard chatbot atau gateway WhatsApp.</p>
              </div>
            </div>
            <span class="rounded-full bg-emerald-400/10 border border-emerald-400/30 px-2.5 py-0.5 text-[11px] font-mono text-emerald-400">
              POST · HTTP 200
            </span>
          </div>

          <div class="space-y-3">
            <label class="text-xs font-bold uppercase tracking-wider text-muted block">
              Pilih Antarmuka Jaringan (Local / LAN)
            </label>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                v-if="info?.localUrl"
                type="button"
                class="text-left p-3 rounded-xl border transition cursor-pointer"
                :class="selectedWebhookUrl === info.localUrl ? 'border-emerald-500 bg-emerald-500/10' : 'border-line bg-base hover:bg-elevated'"
                @click="selectedWebhookUrl = info.localUrl"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-bold text-ink">Localhost</span>
                  <span class="text-[10px] font-mono text-muted">127.0.0.1</span>
                </div>
                <p class="text-[11px] text-muted truncate font-mono">{{ info.localUrl }}</p>
              </button>

              <button
                v-for="url in info?.lanUrls || []"
                :key="url"
                type="button"
                class="text-left p-3 rounded-xl border transition cursor-pointer"
                :class="selectedWebhookUrl === url ? 'border-emerald-500 bg-emerald-500/10' : 'border-line bg-base hover:bg-elevated'"
                @click="selectedWebhookUrl = url"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-bold text-ink">Jaringan LAN / WiFi</span>
                  <span class="text-[10px] font-mono text-emerald-400">Rekomendasi</span>
                </div>
                <p class="text-[11px] text-muted truncate font-mono">{{ url }}</p>
              </button>

              <button
                v-if="info?.frontendProxyUrl"
                type="button"
                class="text-left p-3 rounded-xl border transition cursor-pointer"
                :class="selectedWebhookUrl === info.frontendProxyUrl ? 'border-emerald-500 bg-emerald-500/10' : 'border-line bg-base hover:bg-elevated'"
                @click="selectedWebhookUrl = info.frontendProxyUrl"
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-bold text-ink">Frontend Proxy</span>
                  <span class="text-[10px] font-mono text-muted">Port 7070</span>
                </div>
                <p class="text-[11px] text-muted truncate font-mono">{{ info.frontendProxyUrl }}</p>
              </button>
            </div>

            <!-- URL Copy Field -->
            <div class="pt-2">
              <label class="text-[11px] font-bold uppercase tracking-wider text-muted block mb-1.5">
                Target Webhook URL Lengkap
              </label>
              <div class="flex items-center gap-2">
                <input
                  type="text"
                  readonly
                  :value="selectedWebhookUrl"
                  class="flex-1 rounded-xl border border-line bg-base px-3.5 py-2.5 text-xs font-mono text-emerald-300 select-all outline-none shadow-inner"
                />
                <button
                  type="button"
                  class="shrink-0 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  @click="copyToClipboard(selectedWebhookUrl, 'URL Webhook')"
                >
                  <span>📋</span>
                  <span>Salin URL</span>
                </button>
              </div>
            </div>

            <!-- Format Respon & Cara Kerja -->
            <div class="rounded-xl bg-base/60 border border-line/80 p-4 text-xs text-muted space-y-2 leading-relaxed">
              <div class="flex items-center gap-2 text-ink font-semibold">
                <span>💡</span>
                <span>Cara Kerja & Format Respons:</span>
              </div>
              <p>
                Setiap pesan masuk dari WhatsApp akan disimpan ke Inbox. Jika
                <strong class="text-ink">Balas Otomatis AI Aktif</strong>, respons ke gateway WhatsApp berupa:
                <code class="text-emerald-400 font-mono bg-panel px-1.5 py-0.5 rounded border border-line/60">
                  { "reply": "Jawaban asisten AI..." }
                </code>.
              </p>
              <p>
                Jika dinonaktifkan, respons berupa:
                <code class="text-muted font-mono bg-panel px-1.5 py-0.5 rounded border border-line/60">
                  { "skip_reply": true }
                </code>.
              </p>
            </div>
          </div>
        </div>

        <!-- Card 2: Pengaturan Balas Otomatis AI -->
        <div class="rounded-2xl border border-line bg-panel p-6 shadow-sm space-y-6">
          <div class="flex items-center justify-between pb-3 border-b border-line">
            <div class="flex items-center gap-3">
              <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 text-lg">
                🤖
              </span>
              <div>
                <h2 class="text-sm font-bold text-ink">Balas Otomatis AI (LLM Auto-Reply)</h2>
                <p class="text-xs text-muted">Atur status aktif, pilihan model bahasa besar (LLM), dan persona jawaban bot.</p>
              </div>
            </div>

            <!-- Switch On/Off -->
            <div class="flex items-center gap-3">
              <span class="text-xs font-semibold" :class="config.autoReplyEnabled ? 'text-emerald-400' : 'text-muted'">
                {{ config.autoReplyEnabled ? 'Aktif' : 'Nonaktif' }}
              </span>
              <button
                type="button"
                role="switch"
                :aria-checked="config.autoReplyEnabled"
                class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="config.autoReplyEnabled ? 'bg-emerald-500' : 'bg-muted/30'"
                @click="config.autoReplyEnabled = !config.autoReplyEnabled"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out"
                  :class="config.autoReplyEnabled ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Pilihan Model AI -->
            <div class="space-y-2">
              <label class="text-xs font-bold uppercase tracking-wider text-muted block">
                Model AI (LLM Provider)
              </label>
              <select
                v-model="config.model"
                class="w-full rounded-xl border border-line bg-base px-3.5 py-2.5 text-xs text-ink font-mono outline-none focus:border-emerald-500 transition"
              >
                <option value="deepseek-v4-flash">
                  DeepSeek V4 Flash (1M Context · Rekomendasi Hemat & Cepat)
                </option>
                <option
                  v-for="m in availableModels.filter(m => m.id !== 'deepseek-v4-flash')"
                  :key="m.id"
                  :value="m.id"
                >
                  {{ m.name }} ({{ m.context }})
                </option>
              </select>
              <p class="text-[11px] text-muted leading-relaxed">
                Menggunakan token provider TokenPortal. Model default:
                <span class="font-mono text-emerald-400">deepseek-v4-flash</span>.
              </p>
            </div>

            <!-- Context History Info -->
            <div class="space-y-2">
              <label class="text-xs font-bold uppercase tracking-wider text-muted block">
                Memori Konteks Obrolan
              </label>
              <div class="rounded-xl bg-base p-3 border border-line/70 text-xs text-muted leading-relaxed space-y-1">
                <p class="text-ink font-semibold flex items-center gap-1.5">
                  <span>🧠</span>
                  <span>Mengingat 6 Riwayat Chat Terakhir</span>
                </p>
                <p class="text-[11px]">
                  Bot otomatis menyertakan 6 pesan obrolan sebelumnya dari nomor pengirim yang sama agar balasan konsisten dan nyambung.
                </p>
              </div>
            </div>
          </div>

          <!-- System Prompt Textarea -->
          <div class="space-y-2 pt-2 border-t border-line/60">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold uppercase tracking-wider text-muted block">
                System Prompt (Persona & Gaya Bahasa Bot)
              </label>
              <button
                type="button"
                class="text-xs text-emerald-400 hover:underline cursor-pointer"
                @click="resetPrompt"
              >
                Reset ke Default
              </button>
            </div>
            <textarea
              v-model="config.systemPrompt"
              rows="4"
              class="w-full rounded-xl border border-line bg-base p-3.5 text-xs text-ink outline-none resize-y leading-relaxed focus:border-emerald-500 transition font-sans"
              placeholder="Instruksi persona dan batasan gaya bicara asisten WhatsApp..."
            />
            <p class="text-[11px] text-muted leading-tight">
              Instruksi ini menjadi panduan perilaku AI saat merespons pesan teks, media, maupun kartu kontak WhatsApp.
            </p>
          </div>

          <!-- Perintah Cepat /start Card & Info -->
          <div class="rounded-2xl border border-line bg-base p-4 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 font-mono">
                <span>⚡</span>
                <span>Perintah Cepat Interaktif (/start)</span>
              </span>
              <span class="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 font-semibold">
                Tanpa Beban Token AI 🚀
              </span>
            </div>
            <p class="text-xs text-muted leading-relaxed">
              Bot dilengkapi penangan perintah bawaan. Ketika pengirim mengetik perintah di bawah ini, bot akan langsung merespons secara instan <strong>tanpa memanggil AI</strong>:
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 text-xs font-mono">
              <div class="bg-panel border border-line rounded-xl p-2.5 space-y-1">
                <span class="font-bold text-accent">/start</span>
                <p class="text-[11px] text-muted font-sans">Menampilkan menu interaktif dengan 3 tombol: [ℹ️ Info], [📊 Status], [🧹 Clear].</p>
              </div>
              <div class="bg-panel border border-line rounded-xl p-2.5 space-y-1">
                <span class="font-bold text-ink">/info</span>
                <p class="text-[11px] text-muted font-sans">Ringkasan info sistem monitoring dan daftar perintah.</p>
              </div>
              <div class="bg-panel border border-line rounded-xl p-2.5 space-y-1">
                <span class="font-bold text-ink">/status</span>
                <p class="text-[11px] text-muted font-sans">Status server real-time, uptime, dan total pesan inbox.</p>
              </div>
              <div class="bg-panel border border-line rounded-xl p-2.5 space-y-1">
                <span class="font-bold text-red-400">/clear</span>
                <p class="text-[11px] text-muted font-sans">Membersihkan riwayat percakapan nomor pengirim agar mulai fresh.</p>
              </div>
            </div>
          </div>

          <!-- Filter Pengirim (Sender Mode) & Kata Kunci (Skip Keywords) -->
          <div class="rounded-2xl border border-line bg-panel p-5 space-y-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 font-mono">
              <span>🛡️</span>
              <span>Filter Pengirim & Kata Kunci (Sender Mode)</span>
            </h3>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- Mode Pengirim -->
              <div class="space-y-3">
                <label class="text-xs font-bold uppercase tracking-wider text-muted block">
                  Mode Pengirim Personal (Sender Mode)
                </label>
                <div class="flex items-center gap-4">
                  <label class="flex items-center gap-2 text-xs text-ink cursor-pointer">
                    <input
                      v-model="config.senderMode"
                      type="radio"
                      value="all"
                      class="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Semua Pengirim (All)</span>
                  </label>
                  <label class="flex items-center gap-2 text-xs text-ink cursor-pointer">
                    <input
                      v-model="config.senderMode"
                      type="radio"
                      value="whitelist"
                      class="text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Whitelist Tertentu</span>
                  </label>
                </div>
                <p class="text-[11px] text-muted leading-relaxed">
                  Jika mode whitelist aktif, bot hanya akan merespons nomor WhatsApp yang terdaftar dalam daftar di bawah. Nomor di luar whitelist tidak akan dibalas.
                </p>

                <!-- Whitelist Input Textarea -->
                <div v-if="config.senderMode === 'whitelist'" class="space-y-1.5 pt-1">
                  <label class="text-[11px] font-bold text-muted block">
                    Daftar Nomor Whitelist (pisahkan dengan koma atau baris baru):
                  </label>
                  <textarea
                    v-model="allowedSendersInput"
                    rows="3"
                    class="w-full rounded-xl border border-line bg-base p-2.5 text-xs text-ink font-mono outline-none resize-y leading-relaxed focus:border-emerald-500 transition"
                    placeholder="Contoh:&#10;081234567890&#10;6289876543210"
                  />
                  <p class="text-[10px] text-muted">
                    Format otomatis dinormalisasi (<span class="font-mono">08...</span>, <span class="font-mono">+62...</span>, <span class="font-mono">62...</span> dianggap sama).
                  </p>
                </div>
              </div>

              <!-- Kata Kunci Diabaikan (Skip Keywords) -->
              <div class="space-y-3">
                <label class="text-xs font-bold uppercase tracking-wider text-muted block">
                  Kata Kunci Diabaikan (Skip Keywords)
                </label>
                <input
                  v-model="skipKeywordsInput"
                  type="text"
                  class="w-full rounded-xl border border-line bg-base px-3 py-2 text-xs text-ink outline-none focus:border-emerald-500 transition"
                  placeholder="Contoh: stop, unsubscribe, iklan"
                />
                <p class="text-[11px] text-muted leading-relaxed">
                  Jika pesan mengandung salah satu kata kunci di atas (dipisahkan koma), webhook akan langsung mengembalikan <span class="font-mono text-amber-400">{ skip_reply: true }</span> dan tidak membalas. Berlaku untuk chat personal maupun grup.
                </p>
              </div>
            </div>
          </div>

          <!-- Filter Balas Pesan Grup (Group Mode) Sesuai Panduan Webhook -->
          <div class="rounded-2xl border border-line bg-panel p-5 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5 font-mono">
                <span>👥</span>
                <span>Filter Balas Pesan Grup (Group Mode)</span>
              </h3>
              <span
                class="rounded-full px-2.5 py-0.5 text-[10px] font-mono border"
                :class="{
                  'bg-muted/15 border-line text-muted': config.groupMode === 'off',
                  'bg-cyan-500/15 border-cyan-500/30 text-cyan-400': config.groupMode === 'all',
                  'bg-emerald-500/15 border-emerald-500/30 text-emerald-400': config.groupMode === 'whitelist',
                }"
              >
                {{ config.groupMode === 'off' ? 'Grup Nonaktif (Default)' : config.groupMode === 'all' ? 'Semua Grup Aktif' : 'Whitelist Grup' }}
              </span>
            </div>

            <div class="space-y-4">
              <!-- Mode Grup Radio -->
              <div class="space-y-2">
                <label class="text-xs font-bold uppercase tracking-wider text-muted block">
                  Pilihan Mode Balas Pesan Grup
                </label>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label
                    class="flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer"
                    :class="config.groupMode === 'off' ? 'border-line bg-elevated/70' : 'border-line/70 bg-base hover:bg-elevated/40'"
                  >
                    <input
                      v-model="config.groupMode"
                      type="radio"
                      value="off"
                      class="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div class="space-y-0.5">
                      <span class="text-xs font-bold text-ink block">Nonaktif (Off)</span>
                      <p class="text-[11px] text-muted leading-tight">
                        Pesan grup tidak pernah dibalas (perilaku bawaan).
                      </p>
                    </div>
                  </label>

                  <label
                    class="flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer"
                    :class="config.groupMode === 'all' ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-line/70 bg-base hover:bg-elevated/40'"
                  >
                    <input
                      v-model="config.groupMode"
                      type="radio"
                      value="all"
                      class="mt-0.5 text-cyan-500 focus:ring-cyan-500"
                    />
                    <div class="space-y-0.5">
                      <span class="text-xs font-bold text-ink block">Semua Grup (All)</span>
                      <p class="text-[11px] text-muted leading-tight">
                        Balas pesan dari grup mana pun yang diikuti device.
                      </p>
                    </div>
                  </label>

                  <label
                    class="flex items-start gap-2.5 p-3 rounded-xl border transition cursor-pointer"
                    :class="config.groupMode === 'whitelist' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-line/70 bg-base hover:bg-elevated/40'"
                  >
                    <input
                      v-model="config.groupMode"
                      type="radio"
                      value="whitelist"
                      class="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                    />
                    <div class="space-y-0.5">
                      <span class="text-xs font-bold text-ink block">Whitelist Grup</span>
                      <p class="text-[11px] text-muted leading-tight">
                        Hanya balas grup yang tercantum di Daftar Grup.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Whitelist Group ID Input Textarea -->
              <div v-if="config.groupMode === 'whitelist'" class="space-y-2 pt-2 border-t border-line/60">
                <div class="flex items-center justify-between">
                  <label class="text-xs font-bold text-ink block">
                    Daftar Group ID yang Diizinkan (Whitelist):
                  </label>
                  <span class="text-[10px] text-muted font-mono">
                    Sufiks @g.us opsional
                  </span>
                </div>
                <textarea
                  v-model="allowedGroupsInput"
                  rows="3"
                  class="w-full rounded-xl border border-line bg-base p-3 text-xs text-ink font-mono outline-none resize-y leading-relaxed focus:border-emerald-500 transition"
                  placeholder="Contoh:&#10;120363382571640255@g.us&#10;628123456789-1699999999@g.us"
                />
                <p class="text-[11px] text-muted leading-relaxed">
                  Pisahkan dengan koma atau baris baru. Sufiks <span class="font-mono text-cyan-400">@g.us</span> akan ditambahkan secara otomatis jika tidak disertakan.
                </p>
              </div>

              <!-- Ketentuan Penting Perilaku Grup -->
              <div class="rounded-xl bg-base/60 border border-line/70 p-3.5 text-xs text-muted space-y-1.5 leading-relaxed">
                <div class="flex items-center gap-1.5 text-ink font-semibold">
                  <span>ℹ️</span>
                  <span>Perilaku Balasan Grup Sesuai Panduan:</span>
                </div>
                <ul class="list-disc list-inside space-y-1 text-[11px] text-muted">
                  <li>Balasan dikirim <strong>langsung ke grup</strong>, bukan japri ke pengirim pesan.</li>
                  <li><strong>Whitelist pengirim TIDAK diterapkan pada pesan grup</strong> &mdash; batasi akses hanya lewat Daftar Grup ini.</li>
                  <li>Payload masuk memiliki atribut <code class="font-mono text-emerald-400">chat_type: "group"</code>, <code class="font-mono text-emerald-400">group_id</code>, dan <code class="font-mono text-emerald-400">group_name</code>.</li>
                  <li>Ketik <code class="font-mono text-accent">/clear</code> di grup untuk membersihkan riwayat obrolan AI khusus grup tersebut.</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Bottom Action Bar -->
          <div class="pt-4 border-t border-line flex items-center justify-between">
            <span class="text-xs text-muted">
              Perubahan konfigurasi langsung tersinkronisasi ke backend dan seluruh tab terbuka via WebSocket.
            </span>
            <button
              type="button"
              class="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2.5 text-xs transition shadow-sm disabled:opacity-50 cursor-pointer"
              :disabled="saving"
              @click="saveConfig"
            >
              <span v-if="saving" class="animate-spin text-xs">⏳</span>
              <span>{{ saving ? "Menyimpan..." : "Simpan Konfigurasi" }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
