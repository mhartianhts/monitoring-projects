import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { appConfig } from "./config/app.js";
import { ProcessManager } from "./process/processManager.js";
import { createApiRouter } from "./routes/index.js";
import { registerSockets } from "./sockets/index.js";
import { registerShutdownHook } from "./process/shutdownHook.js";

export const createApp = () => {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: appConfig.frontendOrigin,
      methods: ["GET", "POST"],
    },
  });

  const processManager = new ProcessManager({ io });
  void processManager.reattachAll();
  registerShutdownHook(processManager);
  registerSockets(io, processManager);

  app.use(
    cors({
      origin: appConfig.frontendOrigin,
    }),
  );
  app.use(express.json());
  app.use("/api", createApiRouter(processManager));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res
      .status(500)
      .json({ success: false, error: err.message || "Internal error" });
  });

  return { app, httpServer, processManager, io };
};
