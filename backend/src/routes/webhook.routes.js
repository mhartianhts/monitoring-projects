import { Router } from "express";
import { createWebhookController } from "../controllers/webhook.controller.js";

export const createWebhookRouter = (io) => {
  const router = Router();
  const controller = createWebhookController(io);

  router.post("/chatbot", controller.ingest);
  router.get("/info", controller.info);
  router.get("/inbox", controller.listInbox);
  router.delete("/inbox", controller.clearInbox);
  router.get("/inbox/:id", controller.getInboxItem);
  router.get("/inbox/:id/media", controller.downloadMedia);
  router.delete("/inbox/:id", controller.deleteInboxItem);

  return router;
};
