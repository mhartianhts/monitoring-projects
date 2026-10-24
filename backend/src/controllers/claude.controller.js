import { ok, badRequest, fail } from "../utils/response.js";
import {
  getClaudeStatus,
  abortClaudeChat,
  streamChatWithClaudeCli,
} from "../services/claudeCli.service.js";
import {
  listClaudeSessions,
  getClaudeSession,
  createClaudeSession,
  deleteClaudeSession,
  appendClaudeMessage,
} from "../services/claudeSession.service.js";
import { findProject } from "../services/projectDiscovery.service.js";

export const createClaudeController = (processManager) => {
  const status = async (_req, res) => {
    try {
      const data = await getClaudeStatus();
      return ok(res, data);
    } catch (err) {
      return fail(res, err.message, 500);
    }
  };

  const models = async (_req, res) => {
    try {
      const data = await getClaudeStatus();
      return ok(res, data.models || []);
    } catch (err) {
      return fail(res, err.message, 500);
    }
  };

  const listSessions = async (_req, res) => {
    try {
      const list = await listClaudeSessions();
      return ok(res, list);
    } catch (err) {
      return fail(res, err.message, 500);
    }
  };

  const createSession = async (req, res) => {
    try {
      const { title, model, projectId, mode } = req.body || {};
      let projectPath = null;
      if (projectId) {
        const found = findProject(projectId);
        if (found?.path) projectPath = found.path;
      }

      const session = await createClaudeSession({
        title,
        model,
        projectId,
        projectPath,
        mode,
      });
      return ok(res, session);
    } catch (err) {
      return fail(res, err.message, 500);
    }
  };

  const getSession = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = await getClaudeSession(sessionId);
      if (!session) {
        return fail(res, "Sesi percakapan Claude tidak ditemukan", 404);
      }
      return ok(res, session);
    } catch (err) {
      return fail(res, err.message, 500);
    }
  };

  const deleteSession = async (req, res) => {
    try {
      const { sessionId } = req.params;
      abortClaudeChat(sessionId);
      const deleted = await deleteClaudeSession(sessionId);
      return ok(res, { deleted, sessionId });
    } catch (err) {
      return fail(res, err.message, 500);
    }
  };

  const stop = async (req, res) => {
    try {
      const sessionId = req.body?.sessionId;
      const stopped = abortClaudeChat(sessionId);
      return ok(res, { stopped, sessionId });
    } catch (err) {
      return fail(res, err.message, 500);
    }
  };

  const chat = async (req, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      if (!message) {
        return badRequest(res, "Pesan tidak boleh kosong");
      }

      let activeSessionId = String(req.body?.sessionId || "").trim();
      const chosenModel = String(req.body?.model || "default").trim();
      const chosenMode = String(req.body?.mode || "safe").trim();
      const systemPrompt = req.body?.systemPrompt
        ? String(req.body.systemPrompt).trim()
        : null;
      const projectId = req.body?.projectId ? String(req.body.projectId).trim() : null;

      let projectPath = null;
      if (projectId) {
        const found = findProject(projectId);
        if (found?.path) projectPath = found.path;
      }

      // Periksa apakah sesi sudah ada dan memiliki pesan sebelumnya
      let isFollowUp = false;
      let session = null;
      if (activeSessionId) {
        session = await getClaudeSession(activeSessionId);
        if (session && session.messages?.length > 0) {
          isFollowUp = true;
          if (!projectPath && session.projectPath) {
            projectPath = session.projectPath;
          }
        }
      }

      if (!session) {
        session = await createClaudeSession({
          title: message.slice(0, 45).trim() || "Obrolan Claude Baru",
          model: chosenModel,
          projectId,
          projectPath,
          mode: chosenMode,
        });
        activeSessionId = session.id;
      }

      // Simpan pesan user
      await appendClaudeMessage(activeSessionId, {
        role: "user",
        content: message,
      });

      // Konfigurasi Server-Sent Events (SSE)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      }

      let isFinished = false;

      const { abort } = streamChatWithClaudeCli({
        message,
        sessionId: activeSessionId,
        isFollowUp,
        model: chosenModel,
        projectPath,
        mode: chosenMode,
        systemPrompt,
        onChunk: (delta) => {
          if (isFinished) return;
          res.write(`data: ${JSON.stringify({ type: "chunk", delta })}\n\n`);
        },
        onDone: async (result) => {
          if (isFinished) return;
          isFinished = true;

          try {
            await appendClaudeMessage(
              activeSessionId,
              {
                role: "assistant",
                content: result.reply,
                model: chosenModel,
              },
              result.stats,
            );
          } catch (e) {
            console.error("Gagal menyimpan pesan Claude assistant:", e);
          }

          res.write(
            `data: ${JSON.stringify({
              type: "done",
              reply: result.reply,
              stats: result.stats,
              sessionId: activeSessionId,
            })}\n\n`,
          );
          res.end();
        },
        onError: (streamErr) => {
          if (isFinished) return;
          isFinished = true;
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              error: streamErr.message,
              hint:
                "Pastikan Claude Code CLI di laptop Anda sudah login dan dapat merespons.",
            })}\n\n`,
          );
          res.end();
        },
      });

      req.on("close", () => {
        if (!isFinished) {
          isFinished = true;
          abort();
        }
      });
    } catch (err) {
      console.error("Claude chat error:", err);
      return fail(res, err.message, 500);
    }
  };

  return {
    status,
    models,
    listSessions,
    createSession,
    getSession,
    deleteSession,
    stop,
    chat,
  };
};
