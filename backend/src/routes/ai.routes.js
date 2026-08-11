import { Router } from "express";
import { createAiController } from "../controllers/ai.controller.js";

export const createAiRouter = (processManager) => {
  const router = Router();
  const controller = createAiController(processManager);

  router.get("/status", controller.status);
  router.get("/sessions/:projectId", controller.getSessions);
  router.post("/sessions/:projectId", controller.createSessionHandler);
  router.delete("/sessions/:projectId/:sessionId", controller.deleteSessionHandler);
  router.patch("/sessions/:projectId/:sessionId", controller.renameSessionHandler);
  router.get("/history/:projectId", controller.getHistory);
  router.put("/history/:projectId", controller.putHistory);
  router.delete("/history/:projectId", controller.deleteHistory);
  router.post("/chat", controller.chat);
  router.post("/stream-chat", controller.streamChat);
  router.post("/agent-run", controller.agentRun);
  router.post("/stream-agent-run", controller.streamAgentRun);
  router.post("/agent-action", controller.agentAction);
  router.post("/commit-message", controller.commitMessage);
  router.get("/memory/:projectId", controller.getMemory);
  router.put("/memory/:projectId", controller.updateMemory);
  router.post("/git-docs", controller.generateGitDocs);
  router.get("/git-docs/download", controller.downloadGitDoc);

  return router;
};
