import { Router } from "express";
import multer from "multer";
import { createAiController } from "../controllers/ai.controller.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // Max 20MB per screenshot image
  },
});

export const createAiRouter = (processManager) => {
  const router = Router();
  const controller = createAiController(processManager);

  router.get("/status", controller.status);
  router.get("/models", controller.models);
  router.post("/chat", controller.chat);
  router.get("/chat/sessions", controller.listSessions);
  router.post("/chat/sessions", controller.createSession);
  router.get("/chat/sessions/:sessionId", controller.getSession);
  router.put("/chat/sessions/:sessionId", controller.updateSession);
  router.delete("/chat/sessions/:sessionId", controller.deleteSession);
  router.post("/commit-message", controller.commitMessage);
  router.get("/memory/:projectId", controller.getMemory);
  router.put("/memory/:projectId", controller.updateMemory);
  router.post("/git-docs", controller.generateGitDocs);
  router.get("/git-docs/job/:jobId", controller.getDocJobStatus);
  router.post("/git-docs/job/:jobId/screenshots", upload.any(), controller.submitDocScreenshots);
  router.post("/git-docs/job/:jobId/skip-screenshots", controller.skipDocScreenshots);
  router.get("/git-docs/active", controller.getDocJobStatus);
  router.get("/git-docs/list", controller.listGitDocs);
  router.get("/git-docs/download", controller.downloadGitDoc);
  router.post("/git-docs/open-folder", controller.openDocsFolder);
  router.delete("/git-docs", controller.deleteGitDoc);

  return router;
};
