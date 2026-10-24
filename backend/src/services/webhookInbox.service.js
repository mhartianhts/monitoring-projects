import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { appConfig } from "../config/app.js";
import { chatWithTokenPortal } from "./tokenportal.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, "../../data");

export const DEFAULT_WEBHOOK_CONFIG = {
  autoReplyEnabled: true,
  model: "deepseek-v4-flash",
  systemPrompt:
    "Kamu adalah asisten virtual WhatsApp yang ramah, sopan, dan solutif. Jawablah pesan dari pengguna dengan jelas, ringkas, santun, dan dalam Bahasa Indonesia. Hindari jawaban yang terlalu panjang kecuali diminta secara spesifik.",
  replyTimeoutMs: 30000,
  senderMode: "all",
  allowedSenders: [],
  skipKeywords: [],
  groupMode: "off",
  allowedGroups: [],
};

export const normalizePhoneNumber = (raw) => {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = "62" + digits.slice(1);
  } else if (digits.startsWith("8")) {
    digits = "62" + digits;
  }
  return digits;
};

export const normalizeGroupId = (raw) => {
  if (!raw) return "";
  let id = String(raw).trim().replace(/\s+/g, "");
  if (!id) return "";
  if (!id.endsWith("@g.us")) {
    id = `${id}@g.us`;
  }
  return id;
};

export const isSenderAllowed = (senderNumber, config) => {
  if (!config || config.senderMode !== "whitelist") return true;
  if (!senderNumber) return false;
  const rawList = Array.isArray(config.allowedSenders)
    ? config.allowedSenders
    : typeof config.allowedSenders === "string"
      ? config.allowedSenders.split(/[\r\n,]+/)
      : [];
  const allowed = rawList.map((s) => String(s).trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  const normalizedSender = normalizePhoneNumber(senderNumber);
  return allowed.some((num) => normalizePhoneNumber(num) === normalizedSender);
};

export const isGroupAllowed = (groupId, config) => {
  if (!config) return false;
  const mode = config.groupMode || config.group_mode || "off";
  if (mode === "off") return false;
  if (mode === "all") return true;
  if (mode === "whitelist") {
    if (!groupId) return false;
    const rawList = Array.isArray(config.allowedGroups || config.allowed_groups)
      ? config.allowedGroups || config.allowed_groups
      : typeof (config.allowedGroups || config.allowed_groups) === "string"
        ? (config.allowedGroups || config.allowed_groups).split(/[\r\n,]+/)
        : [];
    const allowed = rawList.map((g) => normalizeGroupId(g)).filter(Boolean);
    if (allowed.length === 0) return false;
    const normalizedTarget = normalizeGroupId(groupId);
    return allowed.includes(normalizedTarget);
  }
  return false;
};

export const containsSkipKeyword = (message, config) => {
  if (!message || !config) return false;
  const rawList = Array.isArray(config.skipKeywords)
    ? config.skipKeywords
    : typeof config.skipKeywords === "string"
      ? config.skipKeywords.split(/[\r\n,]+/)
      : [];
  const keywords = rawList.map((k) => String(k).trim()).filter(Boolean);
  if (keywords.length === 0) return false;
  const lowerMsg = String(message).toLowerCase();
  return keywords.some((kw) => lowerMsg.includes(kw.toLowerCase()));
};

export const parseSystemCommand = (message = "") => {
  if (!message || typeof message !== "string") return null;
  const clean = message.trim().toLowerCase();

  // Bersihkan karakter non-huruf & non-angka untuk matching fleksibel (emoji, kurung, slash, dsb.)
  const alphanumericOnly = clean.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

  if (
    clean === "/start" ||
    clean === "start" ||
    alphanumericOnly === "start"
  ) {
    return "start";
  }
  if (
    clean === "/info" ||
    clean === "info" ||
    clean === "informasi" ||
    clean.includes("info") ||
    alphanumericOnly === "info" ||
    alphanumericOnly === "informasi"
  ) {
    return "info";
  }
  if (
    clean === "/status" ||
    clean === "status" ||
    clean.includes("status") ||
    alphanumericOnly === "status"
  ) {
    return "status";
  }
  if (
    clean === "/clear" ||
    clean === "clear" ||
    clean === "reset" ||
    clean.includes("clear") ||
    alphanumericOnly === "clear" ||
    alphanumericOnly === "reset"
  ) {
    return "clear";
  }
  return null;
};

const MEDIA_TYPE_HINTS = [
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "ptt",
  "ptv",
];

const ALLOWED_MEDIA_HOSTS = [
  "storage.googleapis.com",
  "storage.cloud.google.com",
  "googleapis.com",
  "googleusercontent.com",
];

const createId = () =>
  `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toNullableString = (value) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const asStringList = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(
          item.phone || item.number || item.value || item.email || "",
        ).trim();
      }
      return "";
    })
    .filter(Boolean);
};

const stripVcardPhoto = (raw) => {
  if (!raw) return raw;
  return String(raw)
    .replace(/^(PHOTO|LOGO)[^:]*:.*(?:\n[ \t].*)*/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const parseVcard = (input) => {
  let raw = "";
  let displayName = null;
  let phoneNumbers = [];
  let emails = [];
  let organization = null;
  let title = null;
  let note = null;

  if (input && typeof input === "object" && !Array.isArray(input)) {
    displayName = toNullableString(
      input.displayName || input.fn || input.name || input.fullName,
    );
    phoneNumbers = asStringList(
      input.phoneNumbers || input.phones || input.tel,
    );
    emails = asStringList(input.emails);
    organization = toNullableString(input.organization || input.org);
    title = toNullableString(input.title);
    note = toNullableString(input.note);
    raw =
      typeof input.raw === "string"
        ? input.raw
        : typeof input.vcard === "string"
          ? input.vcard
          : "";
  } else if (typeof input === "string") {
    raw = input;
  }

  raw = stripVcardPhoto(raw);

  const fnMatch = raw.match(/^FN:(.+)$/im);
  if (!displayName && fnMatch) displayName = fnMatch[1].trim();

  for (const line of raw.split(/\r?\n/)) {
    if (/TEL/i.test(line) && line.includes(":")) {
      const waid = line.match(/waid=(\d+)/i);
      const valuePart = line.slice(line.indexOf(":") + 1).trim();
      const cleaned = valuePart.replace(/[^\d+]/g, "");
      for (const candidate of [waid?.[1], cleaned, valuePart]) {
        const phone = String(candidate || "").trim();
        if (phone && !phoneNumbers.includes(phone)) phoneNumbers.push(phone);
      }
    }
    const emailMatch = line.match(/EMAIL[^:]*:(.+)/i);
    if (emailMatch) {
      const email = emailMatch[1].trim();
      if (email && !emails.includes(email)) emails.push(email);
    }
    const orgMatch = line.match(/^ORG:(.+)$/i);
    if (orgMatch && !organization) organization = orgMatch[1].trim();
    const titleMatch = line.match(/^TITLE:(.+)$/i);
    if (titleMatch && !title) title = titleMatch[1].trim();
  }

  const hasContent =
    Boolean(raw) ||
    Boolean(displayName) ||
    phoneNumbers.length > 0 ||
    emails.length > 0;

  if (!hasContent) return null;

  return {
    displayName,
    phoneNumbers,
    emails,
    organization,
    title,
    note,
    raw: raw || null,
  };
};

const resolveVcardSource = (payload = {}, existing = null) => {
  if (payload.vcard_data != null) return payload.vcard_data;
  if (existing?.vcardData != null) return existing.vcardData;
  const message = String(payload.message || existing?.message || "");
  if (message.includes("BEGIN:VCARD")) return message;
  return null;
};

export const classifyKind = (payload = {}) => {
  const messageType = String(payload.message_type || "").toLowerCase();
  const hasContact =
    payload.is_vcard === true ||
    Boolean(payload.vcard_data) ||
    (Array.isArray(payload.contacts_array) &&
      payload.contacts_array.length > 0) ||
    messageType.includes("contact") ||
    messageType.includes("vcard");

  if (hasContact) return "contact";

  const hasMediaMeta =
    Boolean(payload.gcs_url) ||
    Boolean(payload.media_filename) ||
    Boolean(payload.media_mimetype) ||
    Boolean(payload.detected_type) ||
    payload.media_filesize != null;

  if (
    hasMediaMeta ||
    MEDIA_TYPE_HINTS.some((hint) => messageType.includes(hint))
  ) {
    return "media";
  }

  return "text";
};

export const sanitizeFilename = (name, fallback = "file.bin") => {
  const base = path.basename(String(name || fallback));
  const cleaned = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  const safe = cleaned.replace(/^\.+/, "") || fallback;
  return safe.slice(0, 180);
};

export const isSafeMediaUrl = (urlString) => {
  let url;
  try {
    url = new URL(String(urlString || ""));
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost"))
    return false;
  if (host.includes(":")) return false;

  return ALLOWED_MEDIA_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
};

export const createWebhookInboxStore = (options = {}) => {
  const dataDir = options.dataDir || DEFAULT_DATA_DIR;
  const inboxPath = path.join(dataDir, "webhook-inbox.json");
  const configPath = path.join(dataDir, "webhook-config.json");
  const clearedSendersPath = path.join(dataDir, "webhook-cleared.json");
  const mediaDir = path.join(dataDir, "webhook-media");
  const fetchFn = options.fetchFn || globalThis.fetch;
  const aiChatFn = options.aiChatFn || chatWithTokenPortal;
  const initialConfig = options.config || null;
  const maxInbox = Number(
    options.maxInbox || appConfig.webhookMaxInbox || 2000,
  );
  const mediaTimeoutMs = Number(
    options.mediaTimeoutMs || appConfig.webhookMediaTimeoutMs || 20000,
  );
  const maxMediaBytes = Number(
    options.maxMediaBytes || appConfig.webhookMaxMediaBytes || 50 * 1024 * 1024,
  );

  const ensureStore = () => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    if (!fs.existsSync(inboxPath)) {
      fs.writeFileSync(inboxPath, "[]", "utf8");
    }
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(initialConfig || DEFAULT_WEBHOOK_CONFIG, null, 2),
        "utf8",
      );
    }
  };

  const readClearedMap = () => {
    try {
      if (!fs.existsSync(clearedSendersPath)) return {};
      const raw = fs.readFileSync(clearedSendersPath, "utf8");
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  };

  const clearSenderHistory = (targetKey, isGroup = false) => {
    if (!targetKey) return;
    const normalized = isGroup
      ? normalizeGroupId(targetKey)
      : normalizePhoneNumber(targetKey);
    const map = readClearedMap();
    map[normalized] = new Date().toISOString();
    try {
      ensureStore();
      fs.writeFileSync(
        clearedSendersPath,
        JSON.stringify(map, null, 2),
        "utf8",
      );
    } catch (err) {
      console.error("[webhookInbox] Gagal menyimpan webhook-cleared.json:", err);
    }
  };

  const getConfig = () => {
    ensureStore();
    try {
      const raw = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_WEBHOOK_CONFIG,
        ...(parsed && typeof parsed === "object" ? parsed : {}),
      };
    } catch (error) {
      console.error("[webhookInbox] Gagal membaca webhook-config.json:", error);
      return { ...DEFAULT_WEBHOOK_CONFIG };
    }
  };

  const updateConfig = (updates = {}) => {
    ensureStore();
    const current = getConfig();
    const rawGroupMode = updates.groupMode || updates.group_mode;
    const nextGroupMode = ["off", "all", "whitelist"].includes(rawGroupMode)
      ? rawGroupMode
      : current.groupMode || "off";

    const rawAllowedGroups =
      updates.allowedGroups !== undefined
        ? updates.allowedGroups
        : updates.allowed_groups !== undefined
          ? updates.allowed_groups
          : current.allowedGroups || [];

    const nextAllowedGroups = Array.isArray(rawAllowedGroups)
      ? rawAllowedGroups.map(normalizeGroupId).filter(Boolean)
      : typeof rawAllowedGroups === "string"
        ? rawAllowedGroups
            .split(/[\r\n,]+/)
            .map(normalizeGroupId)
            .filter(Boolean)
        : current.allowedGroups || [];

    const next = {
      autoReplyEnabled:
        typeof updates.autoReplyEnabled === "boolean"
          ? updates.autoReplyEnabled
          : current.autoReplyEnabled,
      model:
        typeof updates.model === "string" && updates.model.trim()
          ? updates.model.trim()
          : current.model,
      systemPrompt:
        typeof updates.systemPrompt === "string" && updates.systemPrompt.trim()
          ? updates.systemPrompt.trim()
          : current.systemPrompt,
      replyTimeoutMs: Number(
        updates.replyTimeoutMs || current.replyTimeoutMs || 30000,
      ),
      senderMode: updates.senderMode === "whitelist" ? "whitelist" : "all",
      allowedSenders: Array.isArray(updates.allowedSenders)
        ? updates.allowedSenders.map((s) => String(s).trim()).filter(Boolean)
        : typeof updates.allowedSenders === "string"
          ? updates.allowedSenders
              .split(/[\r\n,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : current.allowedSenders || [],
      skipKeywords: Array.isArray(updates.skipKeywords)
        ? updates.skipKeywords.map((s) => String(s).trim()).filter(Boolean)
        : typeof updates.skipKeywords === "string"
          ? updates.skipKeywords
              .split(/[\r\n,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : current.skipKeywords || [],
      groupMode: nextGroupMode,
      allowedGroups: nextAllowedGroups,
    };

    fs.writeFileSync(configPath, JSON.stringify(next, null, 2), "utf8");
    return next;
  };

  const getConversationHistory = (targetKey, isGroup = false, limit = 6) => {
    if (!targetKey) return [];
    const allItems = readInbox();
    const clearedMap = readClearedMap();
    const normalizedKey = isGroup
      ? normalizeGroupId(targetKey)
      : normalizePhoneNumber(targetKey);
    const clearedTime = clearedMap[normalizedKey]
      ? new Date(clearedMap[normalizedKey]).getTime()
      : 0;

    const matched = allItems
      .filter((it) => {
        const itIsGroup = it.chatType === "group" || Boolean(it.groupId);
        if (isGroup) {
          if (!itIsGroup) return false;
          if (normalizeGroupId(it.groupId) !== normalizedKey) return false;
        } else {
          if (itIsGroup) return false;
          if (it.senderNumber !== targetKey) return false;
        }

        if (clearedTime > 0) {
          const itemTime = new Date(it.receivedAt || it.timestamp).getTime();
          if (itemTime <= clearedTime) return false;
        }
        return true;
      })
      .slice(0, limit)
      .reverse();

    const history = [];
    for (const item of matched) {
      if (item.message && typeof item.message === "string") {
        const trimmed = item.message.trim();
        if (trimmed && !trimmed.startsWith("[") && trimmed.length < 2000) {
          history.push({ role: "user", content: trimmed });
        }
      }
      if (item.botReply?.text && typeof item.botReply.text === "string") {
        const trimmed = item.botReply.text.trim();
        if (trimmed) {
          history.push({ role: "assistant", content: trimmed });
        }
      }
    }
    return history;
  };

  const readInbox = () => {
    ensureStore();
    try {
      const raw = fs.readFileSync(inboxPath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("[webhookInbox] Gagal membaca webhook-inbox.json:", error);
      return [];
    }
  };

  const writeInbox = (items) => {
    ensureStore();
    fs.writeFileSync(inboxPath, JSON.stringify(items, null, 2), "utf8");
  };

  const isInsideMediaDir = (fullPath) => {
    const root = path.resolve(mediaDir);
    return fullPath === root || fullPath.startsWith(root + path.sep);
  };

  const deleteMediaFile = (localFilename) => {
    if (!localFilename) return;
    const fullPath = path.resolve(
      mediaDir,
      path.basename(String(localFilename)),
    );
    if (!isInsideMediaDir(fullPath)) return;
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (error) {
        console.error("[webhookInbox] Gagal menghapus media:", error);
      }
    }
  };

  const trimInbox = (items) => {
    if (items.length <= maxInbox) return items;
    const removed = items.slice(maxInbox);
    for (const item of removed) {
      deleteMediaFile(item.media?.localFilename);
    }
    return items.slice(0, maxInbox);
  };

  const downloadMedia = async (payload, recordId) => {
    const gcsUrl = toNullableString(payload.gcs_url);
    const mediaError = toNullableString(payload.media_error);
    const filename = sanitizeFilename(
      payload.media_filename,
      `${recordId}.bin`,
    );

    const media = {
      filename,
      mimetype:
        toNullableString(payload.media_mimetype) ||
        toNullableString(payload.detected_type),
      filesize: Number.isFinite(Number(payload.media_filesize))
        ? Number(payload.media_filesize)
        : null,
      gcsUrl,
      gcsUploadedAt: toNullableString(payload.gcs_uploaded_at),
      detectedType: toNullableString(payload.detected_type),
      mediaError,
      localFilename: null,
      localSize: null,
      downloadError: null,
    };

    if (mediaError) {
      media.downloadError = `Upload GCS gagal: ${mediaError}`;
      return media;
    }

    if (!gcsUrl) {
      media.downloadError = "gcs_url kosong, media tidak diunduh";
      return media;
    }

    if (!isSafeMediaUrl(gcsUrl)) {
      media.downloadError = "URL media tidak diizinkan untuk diunduh";
      return media;
    }

    if (typeof fetchFn !== "function") {
      media.downloadError = "Fetch tidak tersedia di runtime";
      return media;
    }

    ensureStore();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), mediaTimeoutMs);

    try {
      const response = await fetchFn(gcsUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });

      if (!response.ok) {
        media.downloadError = `Gagal unduh media (HTTP ${response.status})`;
        return media;
      }

      const lengthHeader = response.headers.get("content-length");
      const contentLength =
        lengthHeader == null ? Number.NaN : Number(lengthHeader);
      if (Number.isFinite(contentLength) && contentLength > maxMediaBytes) {
        media.downloadError = "Ukuran media melebihi batas 50MB";
        return media;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxMediaBytes) {
        media.downloadError = "Ukuran media melebihi batas 50MB";
        return media;
      }

      const storedName = `${recordId}_${filename}`;
      const destination = path.join(mediaDir, storedName);
      fs.writeFileSync(destination, buffer);

      media.localFilename = storedName;
      media.localSize = buffer.length;
      if (!media.mimetype) {
        media.mimetype = response.headers.get("content-type");
      }
      return media;
    } catch (error) {
      media.downloadError =
        error?.name === "AbortError"
          ? "Timeout saat mengunduh media"
          : error?.message || "Gagal mengunduh media";
      return media;
    } finally {
      clearTimeout(timer);
    }
  };

  const toPublicRecord = (item, { includeRaw = false } = {}) => {
    if (!item) return null;
    const copy = { ...item };
    copy.vcardData = parseVcard(resolveVcardSource({}, item));
    if (!includeRaw) delete copy.raw;
    copy.hasLocalMedia = Boolean(item.media?.localFilename);
    copy.mediaUrl = item.media?.localFilename
      ? `/api/webhook/inbox/${item.id}/media`
      : item.media?.gcsUrl || null;
    copy.botReply = item.botReply || null;
    return copy;
  };

  const ingest = async (payload) => {
    ensureStore();
    const body = isPlainObject(payload) ? payload : {};
    const id = createId();
    const kind = classifyKind(body);
    const receivedAt = new Date().toISOString();

    let media = null;
    if (kind === "media") {
      media = await downloadMedia(body, id);
    }

    const vcard =
      kind === "contact" ? parseVcard(resolveVcardSource(body)) : null;

    const record = {
      id,
      kind,
      receivedAt,
      deviceId: toNullableString(body.device_id),
      whatsappNumber: toNullableString(body.whatsapp_number),
      senderNumber: toNullableString(body.sender_number),
      message: toNullableString(
        body.message ||
          body.text ||
          body.button_id ||
          body.selected_button_id ||
          body.selected_id ||
          body.selectedButtonId ||
          body.interactive?.id ||
          body.native_flow_response?.id ||
          ""
      ),
      messageType: toNullableString(body.message_type) || "conversation",
      chatType: toNullableString(body.chat_type) || "direct",
      groupId: toNullableString(body.group_id),
      groupName: toNullableString(body.group_name),
      timestamp: toNullableString(body.timestamp) || receivedAt,
      isVcard: Boolean(body.is_vcard) || kind === "contact",
      vcardData: vcard,
      contactsArray: Array.isArray(body.contacts_array)
        ? body.contacts_array
        : null,
      media,
      botReply: null,
      raw: body,
    };

    // Auto-Reply & Command Processing
    const currentConfig = getConfig();
    if (currentConfig.autoReplyEnabled) {
      const isGroup = record.chatType === "group" || Boolean(record.groupId);
      const groupAllowed = isGroup
        ? isGroupAllowed(record.groupId, currentConfig)
        : false;
      const senderAllowed = !isGroup
        ? isSenderAllowed(record.senderNumber, currentConfig)
        : false;
      const hasSkipKw = containsSkipKeyword(record.message, currentConfig);

      // Sesuai panduan:
      // - Pesan personal: periksa sender_mode (senderAllowed)
      // - Pesan grup: periksa group_mode (groupAllowed). Whitelist pengirim TIDAK diterapkan pada pesan grup!
      const isAllowed = isGroup ? groupAllowed : senderAllowed;

      if (isAllowed && !hasSkipKw) {
        const command = parseSystemCommand(record.message);

        if (command) {
          // PERINTAH SISTEM: LANGSUNG DIJAWAB TANPA MENGGUNAKAN AI!
          if (command === "start") {
            const payload = {
              type: "interactive",
              title: "⚡ Menu Asisten Monitoring",
              body: isGroup
                ? `Halo rekan-rekan di grup ${record.groupName || "ini"}! Saya adalah bot asisten monitoring WhatsApp. Silakan pilih salah satu opsi menu di bawah ini:`
                : "Halo! Selamat datang di bot asisten monitoring WhatsApp. Silakan pilih salah satu opsi menu di bawah ini:",
              footer: "Local Project Monitoring System",
              buttons: [
                { type: "reply", id: "info", displayText: "ℹ️ Info" },
                { type: "reply", id: "status", displayText: "📊 Status" },
                { type: "reply", id: "clear", displayText: "🧹 Clear" },
              ],
            };

            record.botReply = {
              type: "interactive",
              text: "⚡ Menu Asisten Monitoring\n\nHalo! Selamat datang di bot asisten monitoring WhatsApp. Silakan pilih salah satu opsi menu di bawah ini:\n\n[ℹ️ Info]  [📊 Status]  [🧹 Clear]",
              payload,
              model: "system-command",
              repliedAt: new Date().toISOString(),
            };
          } else if (command === "info") {
            const infoText = [
              "ℹ️ *INFORMASI SISTEM MONITORING*",
              "",
              "• Platform: Local Project Manager & Monitoring Hub",
              "• Server Engine: Node.js (Port 7171)",
              "• Dukungan Chatbot: Teks, Media (Foto/Audio/Video/Dokumen), Polling, & Tombol Interaktif",
              isGroup ? `• Konteks Ruang: Grup (${record.groupName || record.groupId || "WhatsApp Group"})` : "• Konteks Ruang: Pesan Personal (Japri)",
              "",
              "• Perintah Cepat Tersedia:",
              "   - */start*  : Tampilkan menu tombol interaktif",
              "   - */info*   : Informasi sistem & panduan",
              "   - */status* : Status server & proses real-time",
              "   - */clear*  : Bersihkan memori percakapan",
              "",
              "Ketik */start* kapan saja untuk kembali ke menu utama.",
            ].join("\n");

            record.botReply = {
              type: "text",
              text: infoText,
              payload: { reply: infoText },
              model: "system-command",
              repliedAt: new Date().toISOString(),
            };
          } else if (command === "status") {
            const uptimeSec = Math.floor(process.uptime());
            const hours = Math.floor(uptimeSec / 3600);
            const mins = Math.floor((uptimeSec % 3600) / 60);
            const secs = uptimeSec % 60;
            const uptimeFormatted = `${hours > 0 ? `${hours}j ` : ""}${mins}m ${secs}d`;
            const inboxTotal = readInbox().length;

            const statusText = [
              "📊 *STATUS SISTEM MONITORING*",
              "",
              "• Status Server: ONLINE 🟢",
              `• Uptime Sistem: ${uptimeFormatted}`,
              isGroup
                ? `• Ruang Obrolan: Grup (${record.groupName || record.groupId || "WhatsApp Group"})`
                : "• Ruang Obrolan: Pesan Personal (Direct)",
              isGroup
                ? `• Mode Balas Grup: ${currentConfig.groupMode || "off"}`
                : `• Mode Pengirim: ${currentConfig.senderMode === "whitelist" ? "Whitelist Aktif" : "Semua Pengirim (All)"}`,
              `• Total Pesan Inbox: ${inboxTotal} pesan`,
              `• Model AI Default: ${currentConfig.model || "deepseek-v4-flash"}`,
              `• Waktu Server: ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} WIB`,
              "",
              "Ketik */start* untuk membuka menu utama.",
            ].join("\n");

            record.botReply = {
              type: "text",
              text: statusText,
              payload: { reply: statusText },
              model: "system-command",
              repliedAt: new Date().toISOString(),
            };
          } else if (command === "clear") {
            clearSenderHistory(
              isGroup ? record.groupId : record.senderNumber,
              isGroup,
            );
            const clearText = isGroup
              ? [
                  "🧹 *RIWAYAT OBROLAN GRUP DIRESET*",
                  "",
                  `Memori percakapan untuk grup "${record.groupName || record.groupId || "ini"}" telah berhasil dibersihkan dari server.`,
                  "Pertanyaan selanjutnya yang dikirim ke grup ini akan dimulai sebagai sesi percakapan baru dengan AI.",
                  "",
                  "Ketik */start* untuk membuka menu kembali.",
                ].join("\n")
              : [
                  "🧹 *RIWAYAT OBROLAN DIRESET*",
                  "",
                  "Memori percakapan untuk nomor Anda telah berhasil dibersihkan dari server.",
                  "Pertanyaan selanjutnya yang Anda kirim akan dimulai sebagai sesi percakapan baru dengan AI.",
                  "",
                  "Ketik */start* untuk membuka menu kembali.",
                ].join("\n");

            record.botReply = {
              type: "text",
              text: clearText,
              payload: { reply: clearText },
              model: "system-command",
              repliedAt: new Date().toISOString(),
            };
          }
        } else if (typeof aiChatFn === "function") {
          let promptText = record.message;
          if (kind === "contact") {
            const contactName =
              vcard?.displayName || vcard?.phoneNumbers?.[0] || "Kontak";
            promptText = `[Pengguna membagikan kontak WhatsApp: ${contactName}]`;
          } else if (kind === "media") {
            if (!promptText || promptText.startsWith("[")) {
              const mediaName = media?.filename || "file media";
              promptText = `[Pengguna mengirim media: ${mediaName}]`;
            }
          }

          if (promptText && promptText.trim()) {
            try {
              const history = getConversationHistory(
                isGroup ? record.groupId : record.senderNumber,
                isGroup,
                6,
              );
              const aiResponse = await aiChatFn({
                message: promptText.trim(),
                history,
                systemPrompt: currentConfig.systemPrompt,
                model: currentConfig.model,
              });

              const replyText =
                typeof aiResponse === "string"
                  ? aiResponse
                  : aiResponse?.reply || "";

              if (replyText) {
                record.botReply = {
                  type: "text",
                  text: replyText,
                  payload: { reply: replyText },
                  model: currentConfig.model,
                  repliedAt: new Date().toISOString(),
                };
              }
            } catch (error) {
              console.error("[webhookInbox] Auto-reply AI gagal:", error);
              record.botReply = {
                type: "text",
                text: null,
                model: currentConfig.model,
                error: error?.message || "Gagal memproses auto-reply AI",
                failedAt: new Date().toISOString(),
              };
            }
          }
        }
      }
    }

    const items = readInbox();
    items.unshift(record);
    writeInbox(trimInbox(items));
    return toPublicRecord(record, { includeRaw: false });
  };

  const list = ({
    page = 1,
    limit = 30,
    kind = "all",
    search = "",
    chatType = "all",
  } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const query = String(search || "")
      .trim()
      .toLowerCase();
    const kindFilter = String(kind || "all").toLowerCase();
    const chatTypeFilter = String(chatType || "all").toLowerCase();

    const allItems = readInbox();
    let items = allItems;
    if (kindFilter !== "all") {
      items = items.filter((item) => item.kind === kindFilter);
    }
    if (chatTypeFilter !== "all") {
      if (chatTypeFilter === "group") {
        items = items.filter((item) => item.chatType === "group" || Boolean(item.groupId));
      } else if (chatTypeFilter === "direct") {
        items = items.filter((item) => item.chatType !== "group" && !item.groupId);
      }
    }
    if (query) {
      items = items.filter((item) => {
        const vcard = parseVcard(resolveVcardSource({}, item));
        const haystack = [
          item.senderNumber,
          item.whatsappNumber,
          item.deviceId,
          item.message,
          item.messageType,
          item.groupName,
          item.groupId,
          item.media?.filename,
          vcard?.displayName,
          ...(vcard?.phoneNumbers || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }

    const total = items.length;
    const start = (safePage - 1) * safeLimit;
    const data = items
      .slice(start, start + safeLimit)
      .map((item) => toPublicRecord(item, { includeRaw: false }));

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      counts: {
        all: allItems.length,
        text: allItems.filter((item) => item.kind === "text").length,
        media: allItems.filter((item) => item.kind === "media").length,
        contact: allItems.filter((item) => item.kind === "contact").length,
        direct: allItems.filter((item) => item.chatType !== "group" && !item.groupId).length,
        group: allItems.filter((item) => item.chatType === "group" || Boolean(item.groupId)).length,
      },
    };
  };

  const listThreads = ({ search = "", kind = "all", chatType = "all" } = {}) => {
    const allItems = readInbox();
    const threadsMap = new Map();

    for (const item of allItems) {
      const isGroup = item.chatType === "group" || Boolean(item.groupId);
      const threadKey = isGroup
        ? `group:${item.groupId || item.groupName || "unknown"}`
        : item.senderNumber || "unknown";

      if (!threadsMap.has(threadKey)) {
        threadsMap.set(threadKey, {
          threadId: threadKey,
          isGroup,
          groupId: item.groupId || null,
          groupName: item.groupName || null,
          senderNumber: item.senderNumber || "unknown",
          displayName: isGroup
            ? item.groupName || item.groupId || "Grup WhatsApp"
            : null,
          whatsappNumber: item.whatsappNumber,
          deviceId: item.deviceId,
          messageCount: 0,
          lastItem: null,
          lastReceivedAt: null,
          kinds: new Set(),
          messages: [],
        });
      }
      const thread = threadsMap.get(threadKey);
      thread.messageCount += 1;
      thread.kinds.add(item.kind);

      const publicItem = toPublicRecord(item, { includeRaw: false });
      thread.messages.push(publicItem);

      if (!thread.lastItem) {
        thread.lastItem = publicItem;
        thread.lastReceivedAt = item.receivedAt;
      }

      if (!isGroup && !thread.displayName) {
        const vcard = parseVcard(resolveVcardSource({}, item));
        if (vcard?.displayName) {
          thread.displayName = vcard.displayName;
        }
      } else if (isGroup && !thread.groupName && item.groupName) {
        thread.groupName = item.groupName;
        thread.displayName = item.groupName;
      }
    }

    let threadList = Array.from(threadsMap.values()).map((t) => ({
      threadId: t.threadId,
      isGroup: t.isGroup,
      groupId: t.groupId,
      groupName: t.groupName,
      senderNumber: t.senderNumber,
      displayName: t.displayName,
      whatsappNumber: t.whatsappNumber,
      deviceId: t.deviceId,
      messageCount: t.messageCount,
      lastReceivedAt: t.lastReceivedAt,
      lastItem: t.lastItem,
      kinds: Array.from(t.kinds),
      messages: [...t.messages].reverse(),
    }));

    if (kind && kind !== "all") {
      threadList = threadList.filter((t) => t.kinds.includes(kind));
    }

    if (chatType && chatType !== "all") {
      if (chatType === "group") {
        threadList = threadList.filter((t) => t.isGroup);
      } else if (chatType === "direct") {
        threadList = threadList.filter((t) => !t.isGroup);
      }
    }

    const query = String(search || "").trim().toLowerCase();
    if (query) {
      threadList = threadList.filter((t) => {
        if (t.senderNumber && t.senderNumber.toLowerCase().includes(query)) return true;
        if (t.displayName && t.displayName.toLowerCase().includes(query)) return true;
        if (t.groupName && t.groupName.toLowerCase().includes(query)) return true;
        if (t.groupId && t.groupId.toLowerCase().includes(query)) return true;
        return t.messages.some((m) => {
          const vcard = parseVcard(resolveVcardSource({}, m));
          return (
            (m.message && m.message.toLowerCase().includes(query)) ||
            (m.media?.filename && m.media.filename.toLowerCase().includes(query)) ||
            (vcard?.displayName && vcard.displayName.toLowerCase().includes(query))
          );
        });
      });
    }

    return {
      threads: threadList,
      totalThreads: threadList.length,
      totalMessages: allItems.length,
    };
  };

  const getThread = (identifier) => {
    if (!identifier) return null;
    const allItems = readInbox();

    const isGroupIdentifier =
      identifier.startsWith("group:") ||
      identifier.endsWith("@g.us");

    const targetGroupId = identifier.startsWith("group:")
      ? identifier.replace(/^group:/, "")
      : identifier;

    let matched = [];
    let isGroupThread = false;

    if (isGroupIdentifier) {
      matched = allItems.filter(
        (it) =>
          it.groupId === targetGroupId ||
          normalizeGroupId(it.groupId) === normalizeGroupId(targetGroupId),
      );
      isGroupThread = true;
    } else {
      matched = allItems.filter(
        (it) =>
          (it.senderNumber || "unknown") === identifier &&
          it.chatType !== "group" &&
          !it.groupId,
      );
      if (!matched.length) {
        matched = allItems.filter((it) => it.groupId === identifier);
        if (matched.length) isGroupThread = true;
      }
      if (!matched.length) {
        matched = allItems.filter(
          (it) => (it.senderNumber || "unknown") === identifier,
        );
        if (
          matched.length &&
          (matched[0].chatType === "group" || Boolean(matched[0].groupId))
        ) {
          isGroupThread = true;
        }
      }
    }

    if (!matched.length) return null;

    let displayName = isGroupThread
      ? matched[0].groupName || matched[0].groupId || "Grup WhatsApp"
      : null;
    const kinds = new Set();
    for (const item of matched) {
      kinds.add(item.kind);
      if (!isGroupThread && !displayName) {
        const vcard = parseVcard(resolveVcardSource({}, item));
        if (vcard?.displayName) displayName = vcard.displayName;
      }
    }

    return {
      threadId: isGroupThread
        ? `group:${matched[0].groupId || "unknown"}`
        : matched[0].senderNumber || "unknown",
      isGroup: isGroupThread,
      groupId: isGroupThread ? matched[0].groupId : null,
      groupName: isGroupThread ? matched[0].groupName : null,
      senderNumber: matched[0].senderNumber,
      displayName,
      whatsappNumber: matched[0].whatsappNumber,
      deviceId: matched[0].deviceId,
      messageCount: matched.length,
      kinds: Array.from(kinds),
      lastReceivedAt: matched[0].receivedAt,
      messages: matched
        .map((m) => toPublicRecord(m, { includeRaw: true }))
        .reverse(),
    };
  };

  const deleteThread = (identifier) => {
    if (!identifier) return { deleted: 0, identifier };
    const items = readInbox();

    const isGroupIdentifier =
      identifier.startsWith("group:") ||
      identifier.endsWith("@g.us");

    const targetGroupId = identifier.startsWith("group:")
      ? identifier.replace(/^group:/, "")
      : identifier;

    let toDelete = [];
    let remaining = [];

    if (isGroupIdentifier) {
      toDelete = items.filter(
        (it) =>
          it.groupId === targetGroupId ||
          normalizeGroupId(it.groupId) === normalizeGroupId(targetGroupId),
      );
      remaining = items.filter(
        (it) =>
          it.groupId !== targetGroupId &&
          normalizeGroupId(it.groupId) !== normalizeGroupId(targetGroupId),
      );
    } else {
      toDelete = items.filter(
        (it) =>
          (it.senderNumber || "unknown") === identifier &&
          it.chatType !== "group" &&
          !it.groupId,
      );
      if (!toDelete.length) {
        toDelete = items.filter(
          (it) => (it.senderNumber || "unknown") === identifier,
        );
        remaining = items.filter(
          (it) => (it.senderNumber || "unknown") !== identifier,
        );
      } else {
        remaining = items.filter(
          (it) =>
            !((it.senderNumber || "unknown") === identifier &&
              it.chatType !== "group" &&
              !it.groupId),
        );
      }
    }

    if (!toDelete.length) return { deleted: 0, identifier };

    for (const item of toDelete) {
      deleteMediaFile(item.media?.localFilename);
    }

    writeInbox(remaining);
    return { deleted: toDelete.length, identifier };
  };

  const getById = (id, { includeRaw = true } = {}) => {
    const item = readInbox().find((entry) => entry.id === id);
    return toPublicRecord(item, { includeRaw });
  };

  const getMediaFile = (id) => {
    const item = readInbox().find((entry) => entry.id === id);
    if (!item?.media?.localFilename) return null;

    const fullPath = path.resolve(
      mediaDir,
      path.basename(item.media.localFilename),
    );
    if (!isInsideMediaDir(fullPath)) return null;
    if (!fs.existsSync(fullPath)) return null;

    return {
      filePath: fullPath,
      filename: item.media.filename || path.basename(fullPath),
      mimetype: item.media.mimetype || "application/octet-stream",
    };
  };

  const deleteById = (id) => {
    const items = readInbox();
    const index = items.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    deleteMediaFile(items[index].media?.localFilename);
    items.splice(index, 1);
    writeInbox(items);
    return true;
  };

  const clearAll = () => {
    const items = readInbox();
    for (const item of items) {
      deleteMediaFile(item.media?.localFilename);
    }
    writeInbox([]);
    return { deleted: items.length };
  };

  const getInfo = () => {
    const interfaces = os.networkInterfaces();
    const lanIps = [];
    for (const nets of Object.values(interfaces)) {
      if (!nets) continue;
      for (const net of nets) {
        if (net.family === "IPv4" && !net.internal) {
          lanIps.push(net.address);
        }
      }
    }

    const port = appConfig.port;
    const secret = appConfig.webhookSecret;
    const tokenQuery = secret ? `?token=${encodeURIComponent(secret)}` : "";
    const pathUrl = `/api/webhook/chatbot${tokenQuery}`;
    const cfg = getConfig();

    return {
      path: "/api/webhook/chatbot",
      method: "POST",
      skipReply: !cfg.autoReplyEnabled,
      autoReplyEnabled: cfg.autoReplyEnabled,
      model: cfg.model,
      secretConfigured: Boolean(secret),
      localUrl: `http://127.0.0.1:${port}${pathUrl}`,
      lanUrls: lanIps.map((ip) => `http://${ip}:${port}${pathUrl}`),
      frontendProxyUrl: `http://127.0.0.1:7070${pathUrl}`,
      note: cfg.autoReplyEnabled
        ? `Dashboard chatbot POST JSON ke URL ini. Balasan otomatis AI (${cfg.model}) aktif.`
        : "Dashboard chatbot harus POST JSON ke URL ini. Respons selalu { skip_reply: true }.",
    };
  };

  return {
    ingest,
    list,
    listThreads,
    getThread,
    deleteThread,
    getById,
    getMediaFile,
    deleteById,
    clearAll,
    clearSenderHistory,
    getInfo,
    getConfig,
    updateConfig,
    mediaDir,
    inboxPath,
    configPath,
  };
};

export const webhookInbox = createWebhookInboxStore();
