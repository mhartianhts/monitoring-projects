import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyKind,
  sanitizeFilename,
  isSafeMediaUrl,
  parseVcard,
  normalizeGroupId,
  isGroupAllowed,
  createWebhookInboxStore,
} from "../src/services/webhookInbox.service.js";

const makeTempStore = (
  fetchFn,
  aiChatFn,
  config = { autoReplyEnabled: false },
) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-inbox-"));
  const store = createWebhookInboxStore({
    dataDir,
    fetchFn,
    aiChatFn,
    config,
    maxInbox: 5,
  });
  return { store, dataDir };
};

test("classifyKind membedakan text, media, dan contact", () => {
  assert.equal(
    classifyKind({ message: "Halo", message_type: "conversation" }),
    "text",
  );
  assert.equal(
    classifyKind({
      message: "[imageMessage]",
      message_type: "imageMessage",
      gcs_url: "https://storage.googleapis.com/bucket/photo.jpg",
    }),
    "media",
  );
  assert.equal(
    classifyKind({
      is_vcard: true,
      vcard_data: "BEGIN:VCARD\nFN:Budi\nEND:VCARD",
    }),
    "contact",
  );
  assert.equal(
    classifyKind({
      contacts_array: [{ name: "Ani", phone: "62811" }],
    }),
    "contact",
  );
});

test("sanitizeFilename menolak path traversal", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("foto<>.jpg"), "foto__.jpg");
  assert.ok(sanitizeFilename("").length > 0);
});

test("isSafeMediaUrl hanya mengizinkan HTTPS GCS", () => {
  assert.equal(
    isSafeMediaUrl("https://storage.googleapis.com/bucket/file.jpg"),
    true,
  );
  assert.equal(
    isSafeMediaUrl("http://storage.googleapis.com/bucket/file.jpg"),
    false,
  );
  assert.equal(isSafeMediaUrl("https://127.0.0.1/secret"), false);
  assert.equal(isSafeMediaUrl("https://evil.example.com/file.jpg"), false);
});

test("ingest menyimpan pesan teks", async () => {
  const { store, dataDir } = makeTempStore();
  const saved = await store.ingest({
    device_id: "device-001",
    whatsapp_number: "628111111111",
    sender_number: "628222222222",
    message: "Halo, apakah toko buka?",
    message_type: "conversation",
    chat_type: "direct",
    timestamp: "2026-07-13T10:30:00+07:00",
  });

  assert.equal(saved.kind, "text");
  assert.equal(saved.senderNumber, "628222222222");
  assert.equal(saved.message, "Halo, apakah toko buka?");
  assert.equal(saved.raw, undefined);

  const listed = store.list();
  assert.equal(listed.total, 1);
  assert.equal(listed.counts.text, 1);

  const detail = store.getById(saved.id);
  assert.ok(detail.raw);
  assert.equal(detail.raw.device_id, "device-001");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ingest menyimpan contact/vcard tanpa reply", async () => {
  const { store, dataDir } = makeTempStore();
  const saved = await store.ingest({
    sender_number: "628333",
    is_vcard: true,
    vcard_data: "BEGIN:VCARD\nFN:Budi Santoso\nTEL:628111\nEND:VCARD",
    contacts_array: [{ name: "Budi Santoso", phone: "628111" }],
    message_type: "contactMessage",
  });

  assert.equal(saved.kind, "contact");
  assert.equal(saved.isVcard, true);
  assert.equal(saved.vcardData.displayName, "Budi Santoso");
  assert.ok(saved.vcardData.phoneNumbers.includes("628111"));
  assert.equal(saved.contactsArray[0].phone, "628111");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("parseVcard membaca object dashboard dan item1.TEL waid", () => {
  const parsed = parseVcard({
    displayName: "Pak Thian Rektor",
    phoneNumbers: [],
    raw: "BEGIN:VCARD\nVERSION:3.0\nN:;;;;\nFN:Pak Thian Rektor\nitem1.TEL;waid=6281226421922:+62 812-2642-1922\nitem1.X-ABLabel:Ponsel\nEND:VCARD",
  });
  assert.equal(parsed.displayName, "Pak Thian Rektor");
  assert.ok(parsed.phoneNumbers.includes("6281226421922"));
  assert.ok(parsed.phoneNumbers.some((n) => n.includes("812")));
});

test("ingest contact dari vcard_data object", async () => {
  const { store, dataDir } = makeTempStore();
  const saved = await store.ingest({
    sender_number: "6281919707099",
    message:
      "BEGIN:VCARD\nVERSION:3.0\nFN:Pak Thian Rektor\nitem1.TEL;waid=6281226421922:+62 812-2642-1922\nEND:VCARD",
    message_type: "contactMessage",
    is_vcard: true,
    vcard_data: {
      displayName: "Pak Thian Rektor",
      phoneNumbers: [],
      emails: [],
      raw: "BEGIN:VCARD\nVERSION:3.0\nFN:Pak Thian Rektor\nitem1.TEL;waid=6281226421922:+62 812-2642-1922\nEND:VCARD",
    },
  });

  assert.equal(saved.kind, "contact");
  assert.equal(saved.vcardData.displayName, "Pak Thian Rektor");
  assert.ok(saved.vcardData.phoneNumbers.includes("6281226421922"));

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ingest media mengunduh file dari gcs_url yang aman", async () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const { store, dataDir } = makeTempStore(async () => ({
    ok: true,
    status: 200,
    headers: {
      get: (name) => (name === "content-type" ? "image/jpeg" : null),
    },
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }));

  const saved = await store.ingest({
    sender_number: "628222222222",
    message: "[imageMessage]",
    message_type: "imageMessage",
    media_filename: "photo.jpg",
    media_mimetype: "image/jpeg",
    media_filesize: bytes.length,
    gcs_url: "https://storage.googleapis.com/bucket/photo.jpg",
  });

  assert.equal(saved.kind, "media");
  assert.ok(saved.media.localFilename);
  assert.equal(saved.hasLocalMedia, true);
  assert.equal(saved.media.downloadError, null);

  const file = store.getMediaFile(saved.id);
  assert.ok(file);
  assert.equal(fs.readFileSync(file.filePath).length, bytes.length);

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ingest media menolak host berbahaya dan tetap menyimpan metadata", async () => {
  let fetched = false;
  const { store, dataDir } = makeTempStore(async () => {
    fetched = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  });

  const saved = await store.ingest({
    message_type: "imageMessage",
    media_filename: "secret.jpg",
    gcs_url: "https://127.0.0.1/secret.jpg",
  });

  assert.equal(saved.kind, "media");
  assert.equal(fetched, false);
  assert.equal(saved.hasLocalMedia, false);
  assert.match(saved.media.downloadError, /tidak diizinkan/);
  assert.equal(saved.media.gcsUrl, "https://127.0.0.1/secret.jpg");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ingest media tetap tersimpan jika gcs_url gagal / media_error", async () => {
  const { store, dataDir } = makeTempStore();
  const saved = await store.ingest({
    message_type: "documentMessage",
    media_filename: "invoice.pdf",
    media_mimetype: "application/pdf",
    gcs_url: null,
    media_error: "upload timeout",
  });

  assert.equal(saved.kind, "media");
  assert.equal(saved.media.filename, "invoice.pdf");
  assert.match(saved.media.downloadError, /upload timeout/i);

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("list, delete, dan clearAll bekerja", async () => {
  const { store, dataDir } = makeTempStore();
  const first = await store.ingest({ message: "satu", sender_number: "1" });
  await store.ingest({ message: "dua", sender_number: "2" });
  await store.ingest({
    is_vcard: true,
    vcard_data: "BEGIN:VCARD\nFN:X\nEND:VCARD",
  });

  const listed = store.list({ kind: "text" });
  assert.equal(listed.counts.all, 3);
  assert.equal(listed.counts.text, 2);
  assert.equal(listed.counts.contact, 1);

  assert.equal(store.deleteById(first.id), true);
  assert.equal(store.list().total, 2);

  const cleared = store.clearAll();
  assert.equal(cleared.deleted, 2);
  assert.equal(store.list().total, 0);

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("getConfig dan updateConfig mengelola konfigurasi auto-reply", () => {
  const { store, dataDir } = makeTempStore();
  const cfg = store.getConfig();
  assert.equal(typeof cfg.autoReplyEnabled, "boolean");
  assert.equal(cfg.model, "deepseek-v4-flash");

  const updated = store.updateConfig({
    autoReplyEnabled: true,
    model: "kimi-k27-code",
    systemPrompt: "Prompt kustom",
  });
  assert.equal(updated.autoReplyEnabled, true);
  assert.equal(updated.model, "kimi-k27-code");
  assert.equal(updated.systemPrompt, "Prompt kustom");

  const readBack = store.getConfig();
  assert.equal(readBack.autoReplyEnabled, true);
  assert.equal(readBack.model, "kimi-k27-code");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ingest memanggil AI auto-reply jika autoReplyEnabled aktif", async () => {
  let calledPrompt = "";
  let calledModel = "";
  const mockAi = async ({ message, model }) => {
    calledPrompt = message;
    calledModel = model;
    return { reply: `Jawaban AI untuk: ${message}` };
  };

  const { store, dataDir } = makeTempStore(null, mockAi, {
    autoReplyEnabled: true,
    model: "deepseek-v4-flash",
    systemPrompt: "Asisten WhatsApp",
  });

  const saved = await store.ingest({
    sender_number: "62899999",
    message: "Berapa harga produk A?",
  });

  assert.equal(calledPrompt, "Berapa harga produk A?");
  assert.equal(calledModel, "deepseek-v4-flash");
  assert.ok(saved.botReply);
  assert.equal(saved.botReply.text, "Jawaban AI untuk: Berapa harga produk A?");
  assert.equal(saved.botReply.model, "deepseek-v4-flash");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("listThreads, getThread, dan deleteThread menyusun pesan per nomor", async () => {
  const { store, dataDir } = makeTempStore();
  await store.ingest({ sender_number: "62811", message: "pesan 1 dari 62811" });
  await store.ingest({ sender_number: "62822", message: "pesan 1 dari 62822" });
  await store.ingest({ sender_number: "62811", message: "pesan 2 dari 62811" });

  const result = store.listThreads();
  assert.equal(result.totalThreads, 2);
  assert.equal(result.totalMessages, 3);

  const thread62811 = result.threads.find((t) => t.senderNumber === "62811");
  assert.ok(thread62811);
  assert.equal(thread62811.messageCount, 2);
  assert.equal(thread62811.messages.length, 2);
  // Pesan terurut kronologis (pesan 1 lalu pesan 2)
  assert.equal(thread62811.messages[0].message, "pesan 1 dari 62811");
  assert.equal(thread62811.messages[1].message, "pesan 2 dari 62811");

  const singleThread = store.getThread("62811");
  assert.ok(singleThread);
  assert.equal(singleThread.messageCount, 2);
  assert.equal(singleThread.messages.length, 2);

  const deleted = store.deleteThread("62811");
  assert.equal(deleted.deleted, 2);
  assert.equal(store.listThreads().totalThreads, 1);
  assert.equal(store.listThreads().totalMessages, 1);

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ingest merespon /start dengan pesan interaktif TANPA memanggil AI", async () => {
  let aiCalled = false;
  const mockAi = async () => {
    aiCalled = true;
    return { reply: "Harusnya tidak terpanggil" };
  };

  const { store, dataDir } = makeTempStore(null, mockAi, {
    autoReplyEnabled: true,
  });

  const saved = await store.ingest({
    sender_number: "628123456789",
    message: "/start",
  });

  assert.equal(aiCalled, false, "AI tidak boleh dipanggil saat /start");
  assert.ok(saved.botReply);
  assert.equal(saved.botReply.type, "interactive");
  assert.equal(saved.botReply.model, "system-command");
  assert.equal(saved.botReply.payload.type, "interactive");
  assert.equal(saved.botReply.payload.title, "⚡ Menu Asisten Monitoring");
  assert.equal(saved.botReply.payload.buttons.length, 3);
  assert.equal(saved.botReply.payload.buttons[0].id, "info");
  assert.equal(saved.botReply.payload.buttons[1].id, "status");
  assert.equal(saved.botReply.payload.buttons[2].id, "clear");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("ingest merespon /info, /status, dan /clear TANPA memanggil AI", async () => {
  let aiCalled = false;
  const mockAi = async () => {
    aiCalled = true;
    return { reply: "Harusnya tidak terpanggil" };
  };

  const { store, dataDir } = makeTempStore(null, mockAi, {
    autoReplyEnabled: true,
  });

  // Test /info
  const infoRes = await store.ingest({
    sender_number: "628123456789",
    message: "/info",
  });
  assert.equal(aiCalled, false);
  assert.ok(infoRes.botReply.text.includes("INFORMASI SISTEM"));

  // Test /status
  const statusRes = await store.ingest({
    sender_number: "628123456789",
    message: "/status",
  });
  assert.equal(aiCalled, false);
  assert.ok(statusRes.botReply.text.includes("STATUS SISTEM"));

  // Test /clear
  const clearRes = await store.ingest({
    sender_number: "628123456789",
    message: "/clear",
  });
  assert.equal(aiCalled, false);
  assert.ok(clearRes.botReply.text.includes("RIWAYAT OBROLAN DIRESET"));

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("filter pengirim whitelist dan normalisasi nomor bekerja sesuai panduan", async () => {
  let aiCalledCount = 0;
  const mockAi = async () => {
    aiCalledCount++;
    return { reply: "Halo dari AI" };
  };

  const { store, dataDir } = makeTempStore(null, mockAi, {
    autoReplyEnabled: true,
    senderMode: "whitelist",
    allowedSenders: ["081234567890"], // Format 08
  });

  // Nomor sama dengan format +62 -> harus diizinkan
  const allowedRes = await store.ingest({
    sender_number: "+6281234567890",
    message: "Halo bot",
  });
  assert.equal(aiCalledCount, 1);
  assert.ok(allowedRes.botReply);

  // Nomor di luar whitelist -> tidak boleh dibalas
  const blockedRes = await store.ingest({
    sender_number: "628999999999",
    message: "Halo juga",
  });
  assert.equal(aiCalledCount, 1);
  assert.equal(blockedRes.botReply, null);

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("groupMode off tidak pernah membalas pesan grup (default)", async () => {
  let aiCalled = false;
  const mockAi = async () => {
    aiCalled = true;
    return { reply: "Balasan grup" };
  };

  const { store, dataDir } = makeTempStore(null, mockAi, {
    autoReplyEnabled: true,
    groupMode: "off",
  });

  const res = await store.ingest({
    sender_number: "62811111111",
    message: "Halo grup",
    chat_type: "group",
    group_id: "120363382571640255@g.us",
    group_name: "Tim Developer",
  });

  assert.equal(aiCalled, false);
  assert.equal(res.botReply, null);
  assert.equal(res.chatType, "group");
  assert.equal(res.groupId, "120363382571640255@g.us");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("groupMode all membalas pesan grup dan mengabaikan sender whitelist", async () => {
  let aiCalled = false;
  const mockAi = async () => {
    aiCalled = true;
    return { reply: "Halo rekan-rekan grup!" };
  };

  const { store, dataDir } = makeTempStore(null, mockAi, {
    autoReplyEnabled: true,
    senderMode: "whitelist",
    allowedSenders: ["62899999999"], // Nomor anggota 62811111111 TIDAK ada di whitelist
    groupMode: "all",
  });

  const res = await store.ingest({
    sender_number: "62811111111",
    message: "Tanya jadwal rapat",
    chat_type: "group",
    group_id: "120363382571640255@g.us",
    group_name: "Grup Project",
  });

  assert.equal(aiCalled, true, "Pesan grup harus dibalas walau nomor tidak di whitelist pengirim");
  assert.ok(res.botReply);
  assert.equal(res.botReply.text, "Halo rekan-rekan grup!");

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("groupMode whitelist dan normalisasi @g.us bekerja sesuai panduan", async () => {
  let aiCalledCount = 0;
  const mockAi = async () => {
    aiCalledCount++;
    return { reply: "Jawaban grup" };
  };

  const { store, dataDir } = makeTempStore(null, mockAi, {
    autoReplyEnabled: true,
    groupMode: "whitelist",
    allowedGroups: ["120363382571640255"], // Tanpa sufiks @g.us
  });

  // 1. Grup yang terdaftar di whitelist (dengan sufiks @g.us) -> harus dibalas
  const allowedRes = await store.ingest({
    sender_number: "62811111111",
    message: "Halo grup whitelist",
    chat_type: "group",
    group_id: "120363382571640255@g.us",
    group_name: "Grup Resmi",
  });
  assert.equal(aiCalledCount, 1);
  assert.ok(allowedRes.botReply);

  // 2. Grup lain yang tidak ada di whitelist -> tidak dibalas
  const blockedRes = await store.ingest({
    sender_number: "62811111111",
    message: "Halo grup lain",
    chat_type: "group",
    group_id: "999999999999999999@g.us",
    group_name: "Grup Luar",
  });
  assert.equal(aiCalledCount, 1);
  assert.equal(blockedRes.botReply, null);

  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("listThreads dan getThread mengelompokkan pesan grup tersendiri", async () => {
  const { store, dataDir } = makeTempStore();

  // Pesan direct
  await store.ingest({ sender_number: "62811", message: "pesan japri 1", chat_type: "direct" });
  // Pesan grup A
  await store.ingest({
    sender_number: "62811",
    message: "pesan di grup A dari 62811",
    chat_type: "group",
    group_id: "groupA@g.us",
    group_name: "Komunitas A",
  });
  // Pesan grup A dari orang lain
  await store.ingest({
    sender_number: "62822",
    message: "pesan di grup A dari 62822",
    chat_type: "group",
    group_id: "groupA@g.us",
    group_name: "Komunitas A",
  });

  const res = store.listThreads();
  // Ada 2 thread: 1 direct (62811) dan 1 grup (group:groupA@g.us)
  assert.equal(res.totalThreads, 2);

  const groupThread = res.threads.find((t) => t.isGroup);
  assert.ok(groupThread);
  assert.equal(groupThread.groupName, "Komunitas A");
  assert.equal(groupThread.messageCount, 2);

  const directThread = res.threads.find((t) => !t.isGroup);
  assert.ok(directThread);
  assert.equal(directThread.messageCount, 1);

  const detailGroup = store.getThread("group:groupA@g.us");
  assert.ok(detailGroup);
  assert.equal(detailGroup.isGroup, true);
  assert.equal(detailGroup.messages.length, 2);

  fs.rmSync(dataDir, { recursive: true, force: true });
});


