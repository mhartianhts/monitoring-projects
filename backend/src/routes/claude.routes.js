import { Router } from "express";
import { createClaudeController } from "../controllers/claude.controller.js";

export const createClaudeRouter = (processManager) => {
  const router = Router();
  const controller = createClaudeController(processManager);

  router.get("/status", controller.status);
  router.get("/models", controller.models);
  router.get("/sessions", controller.listSessions);
  router.post("/sessions", controller.createSession);
  router.get("/sessions/:sessionId", controller.getSession);
  router.delete("/sessions/:sessionId", controller.deleteSession);
  router.post("/stop", controller.stop);
  router.post("/chat", controller.chat);

  return router;
};
