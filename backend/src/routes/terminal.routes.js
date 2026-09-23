import { Router } from "express";
import { ok, fail } from "../utils/response.js";

export const createTerminalRouter = (terminalService) => {
  const router = Router();

  router.get("/sessions", (_req, res) => {
    try {
      const sessions = terminalService.listSessions();
      return ok(res, sessions);
    } catch (err) {
      return fail(res, err.message, 500);
    }
  });

  router.get("/sessions/:id", (req, res) => {
    try {
      const info = terminalService.getSessionInfo(req.params.id);
      if (!info) {
        return fail(res, "Session terminal tidak ditemukan", 404);
      }
      return ok(res, info);
    } catch (err) {
      return fail(res, err.message, 500);
    }
  });

  router.delete("/sessions/:id", (req, res) => {
    try {
      const killed = terminalService.killSession(req.params.id);
      if (!killed) {
        return fail(res, "Session terminal tidak ditemukan atau sudah ditutup", 404);
      }
      return ok(res, { killed: true, id: req.params.id });
    } catch (err) {
      return fail(res, err.message, 500);
    }
  });

  return router;
};
