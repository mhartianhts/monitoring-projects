import { Router } from "express";
import os from "node:os";
import multer from "multer";
import { createShareController } from "../controllers/share.controller.js";

const upload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for local Wi-Fi transfer
  },
});

export const createShareRouter = (io) => {
  const router = Router();
  const controller = createShareController(io);

  router.get("/info", controller.getInfo);
  router.get("/files", controller.listFiles);
  router.post("/upload", upload.single("file"), controller.uploadFile);
  router.get("/download/:id", controller.downloadFile);
  router.delete("/files/:id", controller.deleteFile);

  router.get("/texts", controller.listTexts);
  router.post("/texts", controller.addText);
  router.delete("/texts/:id", controller.deleteText);

  return router;
};
