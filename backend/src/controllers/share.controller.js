import { ok, fail, badRequest } from "../utils/response.js";
import { shareService } from "../services/share.service.js";

export const createShareController = (io) => {
  if (io) {
    shareService.setIo(io);
  }

  return {
    getInfo: async (req, res) => {
      try {
        const customIp = req.query.ip ? String(req.query.ip) : null;
        const info = await shareService.getShareInfo(customIp);
        return ok(res, info);
      } catch (err) {
        return fail(res, err.message, 500);
      }
    },

    listFiles: (_req, res) => {
      try {
        const files = shareService.listSharedFiles();
        return ok(res, files);
      } catch (err) {
        return fail(res, err.message, 500);
      }
    },

    uploadFile: (req, res) => {
      try {
        if (!req.file) {
          return badRequest(res, "Tidak ada file yang diunggah");
        }
        const sender = req.body?.sender || "PC";
        const meta = shareService.saveSharedFile(req.file, sender);
        return ok(res, meta, 201);
      } catch (err) {
        return fail(res, err.message, 500);
      }
    },

    downloadFile: (req, res) => {
      try {
        const { id } = req.params;
        const fileObj = shareService.getFile(id);
        if (!fileObj) {
          return fail(res, "File tidak ditemukan", 404);
        }
        return res.download(fileObj.filePath, fileObj.meta.name);
      } catch (err) {
        return fail(res, err.message, 500);
      }
    },

    deleteFile: (req, res) => {
      try {
        const { id } = req.params;
        const success = shareService.deleteSharedFile(id);
        if (!success) {
          return fail(res, "File tidak ditemukan", 404);
        }
        return ok(res, { deleted: true, id });
      } catch (err) {
        return fail(res, err.message, 500);
      }
    },

    listTexts: (_req, res) => {
      try {
        const texts = shareService.listSharedTexts();
        return ok(res, texts);
      } catch (err) {
        return fail(res, err.message, 500);
      }
    },

    addText: (req, res) => {
      try {
        const { content, sender } = req.body || {};
        if (!content) {
          return badRequest(res, "Konten teks wajib diisi");
        }
        const item = shareService.addSharedText(content, sender || "PC");
        return ok(res, item, 201);
      } catch (err) {
        return badRequest(res, err.message);
      }
    },

    deleteText: (req, res) => {
      try {
        const { id } = req.params;
        const success = shareService.deleteSharedText(id);
        if (!success) {
          return fail(res, "Teks tidak ditemukan", 404);
        }
        return ok(res, { deleted: true, id });
      } catch (err) {
        return fail(res, err.message, 500);
      }
    },
  };
};
