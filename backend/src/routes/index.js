import { Router } from "express";
import { createProjectsRouter } from "./projects.routes.js";
import { createAiRouter } from "./ai.routes.js";
import { createConverterRouter } from "./converter.routes.js";
import { createShareRouter } from "./share.routes.js";
import { createTelegramRouter } from "./telegram.routes.js";
import { createWebhookRouter } from "./webhook.routes.js";
import { ok } from "../utils/response.js";
import { appConfig } from "../config/app.js";

export const createApiRouter = (processManager, io, telegramService) => {
  const router = Router();

  router.get("/health", (_req, res) => {
    return ok(res, {
      status: "ok",
      projectsRoot: appConfig.projectsRoot,
      uptime: process.uptime(),
    });
  });

  router.post("/system/shutdown-cleanup", async (_req, res) => {
    await processManager.stopAll();
    return ok(res, { stopped: true });
  });

  router.use("/projects", createProjectsRouter(processManager));
  router.use("/ai", createAiRouter(processManager));
  router.use("/converter", createConverterRouter());
  router.use("/share", createShareRouter(io));
  if (telegramService) {
    router.use("/telegram", createTelegramRouter(telegramService));
  }
  router.use("/webhook", createWebhookRouter(io));
  return router;
};
