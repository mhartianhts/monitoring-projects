import { Router } from "express";
import { createProjectsController } from "../controllers/projects.controller.js";
import { createFilesRouter } from "./files.routes.js";
import {
  getProjectCodeGraph,
  getProjectGraphStats,
} from "../controllers/codeGraph.controller.js";
import {
  getOpenApiSpec,
  executeApiRequest,
} from "../controllers/openapi.controller.js";

export const createProjectsRouter = (processManager) => {
  const router = Router();
  const controller = createProjectsController(processManager);

  router.use(createFilesRouter());

  router.get("/", controller.list);
  router.get("/editors", controller.listEditors);
  router.post("/start-all", controller.startAll);
  router.post("/stop-all", controller.stopAll);
  router.post("/restart-all", controller.restartAll);
  router.get("/:id", controller.getOne);
  router.post("/:id/start", controller.start);
  router.post("/:id/stop", controller.stop);
  router.post("/:id/restart", controller.restart);
  router.get("/:id/logs", controller.logs);
  router.post("/:id/logs/clear", controller.clearLogs);
  router.post("/:id/open-folder", controller.openProjectFolder);
  router.post("/:id/open-browser", controller.openProjectBrowser);
  router.post("/:id/open-editor", controller.openProjectEditor);
  router.post("/:id/favorite", controller.favorite);
  router.get("/:id/git", controller.gitStatus);
  router.post("/:id/git/branch", controller.gitCreateBranch);
  router.post("/:id/git/checkout", controller.gitCheckout);
  router.post("/:id/git/add", controller.gitAdd);
  router.post("/:id/git/commit", controller.gitCommitAction);
  router.post("/:id/git/pull", controller.gitPullAction);
  router.post("/:id/git/push", controller.gitPushAction);

  // Code Graph Routes
  router.get("/:id/graph", getProjectCodeGraph);
  router.get("/:id/graph/stats", getProjectGraphStats);

  // OpenAPI & API Tester Routes
  router.get("/:id/openapi", getOpenApiSpec);
  router.post("/:id/api-client/send", executeApiRequest);

  return router;
};
