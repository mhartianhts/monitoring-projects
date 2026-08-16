import { Router } from "express";
import { createTracesController } from "../controllers/traces.controller.js";

export const createTracesRouter = (io) => {
  const router = Router();
  const controller = createTracesController(io);

  router.post("/collect", controller.collect);
  router.get("/stats", controller.getStats);
  router.post("/mock", controller.generateMock);
  router.delete("/clear", controller.clear);
  router.get("/:traceId", controller.getById);
  router.get("/", controller.list);

  return router;
};
