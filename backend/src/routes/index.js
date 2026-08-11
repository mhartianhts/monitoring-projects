import { Router } from "express";
import { createProjectsRouter } from "./projects.routes.js";
import { createAiRouter } from "./ai.routes.js";
import { ok } from "../utils/response.js";
import { appConfig } from "../config/app.js";

export const createApiRouter = (processManager) => {
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
  return router;
};
