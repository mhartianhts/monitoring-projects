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
  createWebhookInboxStore,
} from "../src/services/webhookInbox.service.js";

const makeTempStore = (fetchFn) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-inbox-"));
  const store = createWebhookInboxStore({
    dataDir,
    fetchFn,
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
