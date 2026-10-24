import { ok, fail } from "../utils/response.js";
import { appConfig } from "../config/app.js";
import { webhookInbox } from "../services/webhookInbox.service.js";
import {
  TOKENPORTAL_KNOWN_MODELS,
  getTokenPortalModels,
} from "../services/tokenportal.service.js";

const SKIP_REPLY = { skip_reply: true };

const isAuthorizedWebhook = (req) => {
  const expected = appConfig.webhookSecret;
  if (!expected) return true;

  const token =
    String(req.query?.token || "") ||
    String(req.get("x-webhook-token") || "") ||
    String(req.get("x-webhook-secret") || "");

  return token === expected;
};

export const createWebhookController = (io) => {
  const ingest = async (req, res) => {
    try {
      if (!isAuthorizedWebhook(req)) {
        console.warn("[webhook] Request ditolak: token tidak valid");
        return res.status(200).json(SKIP_REPLY);
      }

      const record = await webhookInbox.ingest(req.body || {});
      if (io) {
        io.emit("webhook:inbox", {
          type: "ingested",
          data: record,
          timestamp: Date.now(),
        });
      }

      if (record?.botReply?.payload) {
        return res.status(200).json(record.botReply.payload);
      }

      if (record?.botReply?.text) {
        return res.status(200).json({ reply: record.botReply.text });
      }
    } catch (error) {
      console.error("[webhook] Gagal memproses webhook:", error);
    }

    return res.status(200).json(SKIP_REPLY);
  };

  const info = (_req, res) => {
    try {
      return ok(res, webhookInbox.getInfo());
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getConfig = async (_req, res) => {
    try {
      const config = webhookInbox.getConfig();
      let models = TOKENPORTAL_KNOWN_MODELS;
      try {
        const data = await getTokenPortalModels();
        if (data?.models?.length) {
          models = data.models;
        }
      } catch {
        // Gunakan default list
      }
      return ok(res, { config, models });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const updateConfig = (req, res) => {
    try {
      const updated = webhookInbox.updateConfig(req.body || {});
      if (io) {
        io.emit("webhook:config", updated);
      }
      return ok(res, updated);
    } catch (error) {
      return fail(res, error.message, 400);
    }
  };

  const listThreads = (req, res) => {
    try {
      const result = webhookInbox.listThreads({
        kind: req.query.kind,
        search: req.query.search,
        chatType: req.query.chatType || req.query.chat_type,
      });
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getThread = (req, res) => {
    try {
      const result = webhookInbox.getThread(req.params.senderNumber);
      if (!result) return fail(res, "Percakapan tidak ditemukan", 404);
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const deleteThread = (req, res) => {
    try {
      const result = webhookInbox.deleteThread(req.params.senderNumber);
      if (!result.deleted) return fail(res, "Percakapan tidak ditemukan", 404);
      if (io) {
        io.emit("webhook:inbox", {
          type: "thread_deleted",
          data: {
            threadId: req.params.senderNumber,
            senderNumber: req.params.senderNumber,
          },
          timestamp: Date.now(),
        });
      }
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const listInbox = (req, res) => {
    try {
      const result = webhookInbox.list({
        page: req.query.page,
        limit: req.query.limit,
        kind: req.query.kind,
        search: req.query.search,
        chatType: req.query.chatType || req.query.chat_type,
      });
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getInboxItem = (req, res) => {
    try {
      const item = webhookInbox.getById(req.params.id);
      if (!item) return fail(res, "Pesan tidak ditemukan", 404);
      return ok(res, item);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const downloadMedia = (req, res) => {
    try {
      const file = webhookInbox.getMediaFile(req.params.id);
      if (!file) return fail(res, "Media tidak ditemukan", 404);

      res.setHeader("Content-Type", file.mimetype);
      const disposition =
        file.mimetype.startsWith("image/") ||
        file.mimetype.startsWith("audio/") ||
        file.mimetype.startsWith("video/")
          ? "inline"
          : "attachment";
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${encodeURIComponent(file.filename)}"`,
      );
      return res.sendFile(file.filePath);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const deleteInboxItem = (req, res) => {
    try {
      const deleted = webhookInbox.deleteById(req.params.id);
      if (!deleted) return fail(res, "Pesan tidak ditemukan", 404);
      if (io) {
        io.emit("webhook:inbox", {
          type: "deleted",
          data: { id: req.params.id },
          timestamp: Date.now(),
        });
      }
      return ok(res, { deleted: true, id: req.params.id });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const clearInbox = (_req, res) => {
    try {
      const result = webhookInbox.clearAll();
      if (io) {
        io.emit("webhook:inbox", {
          type: "cleared",
          data: result,
          timestamp: Date.now(),
        });
      }
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  return {
    ingest,
    info,
    getConfig,
    updateConfig,
    listInbox,
    listThreads,
    getThread,
    deleteThread,
    getInboxItem,
    downloadMedia,
    deleteInboxItem,
    clearInbox,
  };
};
