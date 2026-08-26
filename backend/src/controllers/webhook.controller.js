import { ok, fail } from "../utils/response.js";
import { appConfig } from "../config/app.js";
import { webhookInbox } from "../services/webhookInbox.service.js";

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
    } catch (error) {
      console.error("[webhook] Gagal menyimpan inbox:", error);
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

  const listInbox = (req, res) => {
    try {
      const result = webhookInbox.list({
        page: req.query.page,
        limit: req.query.limit,
        kind: req.query.kind,
        search: req.query.search,
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
    listInbox,
    getInboxItem,
    downloadMedia,
    deleteInboxItem,
    clearInbox,
  };
};
