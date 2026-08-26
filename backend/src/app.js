import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { appConfig } from "./config/app.js";
import { ProcessManager } from "./process/processManager.js";
import { TelegramService } from "./services/telegram.service.js";
import { createApiRouter } from "./routes/index.js";
import { registerSockets } from "./sockets/index.js";
import { registerShutdownHook } from "./process/shutdownHook.js";

export const createApp = () => {
  const app = express();
  const httpServer = createServer(app);

  const corsOriginCheck = (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost, 127.0.0.1, or local LAN IPs (192.168.x.x, 10.x.x.x, 172.x.x.x)
    if (
      origin.includes("localhost") ||
      origin.includes("127.0.0.1") ||
      /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|100\.)/.test(
        origin,
      ) ||
      origin === appConfig.frontendOrigin
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive for local dev dashboard
  };

  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginCheck,
      methods: ["GET", "POST"],
    },
  });

  const processManager = new ProcessManager({ io });
  void processManager.reattachAll();
  registerShutdownHook(processManager);
  registerSockets(io, processManager);

  const telegramService = new TelegramService({ processManager, io });
  void telegramService.initAllBots();

  app.use(
    cors({
      origin: corsOriginCheck,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", createApiRouter(processManager, io, telegramService));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res
      .status(500)
      .json({ success: false, error: err.message || "Internal error" });
  });

  return { app, httpServer, processManager, io, telegramService };
};
