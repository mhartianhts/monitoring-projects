import { Router } from "express";
import { createProjectsController } from "../controllers/projects.controller.js";
import { createFilesRouter } from "./files.routes.js";
import {
  getEnvFiles,
  getEnvFileContent,
  updateEnvFileContent,
  handleCreateEnvFile,
  handleDeleteEnvFile,
  handleCompareEnvFiles,
  handleSyncMissingKeys,
  handleGenerateExample,
  handleSwitchProfile,
} from "../controllers/envManager.controller.js";

export const createProjectsRouter = (processManager) => {
  const router = Router();
  const controller = createProjectsController(processManager);

  router.use(createFilesRouter());

  router.get("/", controller.list);
  router.get("/editors", controller.listEditors);
  router.get("/available-folders", controller.getAvailableFolders);
  router.get("/managed", controller.getManagedProjects);
  router.post("/managed/sync", controller.syncProjects);
  router.post("/managed/add", controller.addCustom);
  router.put("/managed/:id", controller.updateManaged);
  router.delete("/managed/:id", controller.removeManaged);
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

  // Env Manager & Diff Checker Routes
  router.get("/:id/env/files", getEnvFiles);
  router.get("/:id/env/file", getEnvFileContent);
  router.post("/:id/env/file", updateEnvFileContent);
  router.post("/:id/env/create", handleCreateEnvFile);
  router.delete("/:id/env/file", handleDeleteEnvFile);
  router.post("/:id/env/compare", handleCompareEnvFiles);
  router.post("/:id/env/sync", handleSyncMissingKeys);
  router.post("/:id/env/generate-example", handleGenerateExample);
  router.post("/:id/env/switch-profile", handleSwitchProfile);

  return router;
};
