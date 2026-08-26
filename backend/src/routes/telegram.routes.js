import { Router } from "express";
import { createTelegramController } from "../controllers/telegram.controller.js";

export const createTelegramRouter = (telegramService) => {
  const router = Router();
  const controller = createTelegramController(telegramService);

  router.get("/bots", controller.listBots);
  router.post("/bots", controller.createBot);
  router.get("/bots/:id", controller.getBot);
  router.put("/bots/:id", controller.updateBot);
  router.delete("/bots/:id", controller.deleteBot);

  router.post("/bots/:id/test", controller.testBot);
  router.post("/test", controller.testBot);
  router.post("/bots/:id/toggle", controller.toggleBot);
  router.post("/bots/:id/sync-commands", controller.syncCommands);
  router.post("/bots/:id/run-command", controller.runCommand);

  router.post("/bots/:id/commands", controller.addOrUpdateCommand);
  router.delete("/bots/:id/commands/:command", controller.deleteCommand);

  router.post("/send", controller.sendManualMessage);
  router.get("/activity", controller.getActivityLogs);

  return router;
};
