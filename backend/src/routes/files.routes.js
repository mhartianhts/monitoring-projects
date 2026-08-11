import { Router } from "express";
import { createFilesController } from "../controllers/files.controller.js";

export const createFilesRouter = () => {
  const router = Router();
  const controller = createFilesController();

  router.get("/:id/files/tree", controller.getTree);
  router.get("/:id/files/read", controller.readFile);
  router.get("/:id/files/search", controller.searchFiles);
  router.post("/:id/files/write", controller.writeFile);
  router.post("/:id/files/edit", controller.editFile);
  router.post("/:id/exec", controller.execCommand);

  return router;
};
