import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { appConfig } from "../config/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, "../../data");

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
  const mediaDir = path.join(dataDir, "webhook-media");
  const fetchFn = options.fetchFn || globalThis.fetch;
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

    const record = {
      id,
      kind,
      receivedAt,
      deviceId: toNullableString(body.device_id),
      whatsappNumber: toNullableString(body.whatsapp_number),
      senderNumber: toNullableString(body.sender_number),
      message: toNullableString(body.message),
      messageType: toNullableString(body.message_type) || "conversation",
      chatType: toNullableString(body.chat_type) || "direct",
      groupId: toNullableString(body.group_id),
      groupName: toNullableString(body.group_name),
      timestamp: toNullableString(body.timestamp) || receivedAt,
      isVcard: Boolean(body.is_vcard) || kind === "contact",
      vcardData:
        kind === "contact" ? parseVcard(resolveVcardSource(body)) : null,
      contactsArray: Array.isArray(body.contacts_array)
        ? body.contacts_array
        : null,
      media,
      raw: body,
    };

    const items = readInbox();
    items.unshift(record);
    writeInbox(trimInbox(items));
    return toPublicRecord(record, { includeRaw: false });
  };

  const list = ({ page = 1, limit = 30, kind = "all", search = "" } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const query = String(search || "")
      .trim()
      .toLowerCase();
    const kindFilter = String(kind || "all").toLowerCase();

    const allItems = readInbox();
    let items = allItems;
    if (kindFilter !== "all") {
      items = items.filter((item) => item.kind === kindFilter);
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
      },
    };
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

    return {
      path: "/api/webhook/chatbot",
      method: "POST",
      skipReply: true,
      secretConfigured: Boolean(secret),
      localUrl: `http://127.0.0.1:${port}${pathUrl}`,
      lanUrls: lanIps.map((ip) => `http://${ip}:${port}${pathUrl}`),
      frontendProxyUrl: `http://127.0.0.1:7070${pathUrl}`,
      note: "Dashboard chatbot harus POST JSON ke URL ini. Respons selalu { skip_reply: true }.",
    };
  };

  return {
    ingest,
    list,
    getById,
    getMediaFile,
    deleteById,
    clearAll,
    getInfo,
    mediaDir,
    inboxPath,
  };
};

export const webhookInbox = createWebhookInboxStore();
