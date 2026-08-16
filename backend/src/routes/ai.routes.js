import { Router } from "express";
import { createAiController } from "../controllers/ai.controller.js";

export const createAiRouter = (processManager) => {
  const router = Router();
  const controller = createAiController(processManager);

  router.get("/status", controller.status);
  router.post("/commit-message", controller.commitMessage);
  router.get("/memory/:projectId", controller.getMemory);
  router.put("/memory/:projectId", controller.updateMemory);
  router.post("/git-docs", controller.generateGitDocs);
  router.get("/git-docs/job/:jobId", controller.getDocJobStatus);
  router.get("/git-docs/active", controller.getDocJobStatus);
  router.get("/git-docs/download", controller.downloadGitDoc);

  return router;
};
