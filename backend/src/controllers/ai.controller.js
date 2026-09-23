import { badRequest, fail, ok } from "../utils/response.js";
import {
  chatWithTokenPortal,
  streamChatWithTokenPortal,
  generateCommitMessageWithTokenPortal,
  getTokenPortalModels,
  getTokenPortalStatus,
} from "../services/tokenportal.service.js";
import {
  buildProjectAiContext,
  requireProjectOrThrow,
} from "../services/aiContext.service.js";
import { getBranchDiffForDocs } from "../services/git.service.js";
import {
  createPdfFromMarkdown,
  deletePdfDocument,
  getProjectDocsDir,
  getProjectScreenshotsDir,
  listSavedPdfDocuments,
  savePdfDocument,
} from "../services/pdf.service.js";
import {
  getProjectMemory,
  updateProjectMemory,
} from "../services/aiMemory.service.js";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

import {
  getActiveDocJobForProject,
  getDocJob,
  resumeDocJobWithScreenshots,
  startDocJob,
} from "../services/aiDocJob.service.js";
import {
  listChatSessions,
  getChatSession,
  createChatSession,
  saveChatSession,
  deleteChatSession,
  appendMessageToSession,
} from "../services/chatSession.service.js";

export const createAiController = (processManager) => {
  const status = async (_req, res) => {
    try {
      const data = await getTokenPortalStatus();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const models = async (_req, res) => {
    try {
      const data = await getTokenPortalModels();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const chat = async (req, res) => {
    try {
      const message = String(req.body?.message || "").trim();
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const chosenModel = String(req.body?.model || "").trim();
      const systemPrompt = req.body?.systemPrompt
        ? String(req.body.systemPrompt).trim()
        : undefined;
      const contextText = req.body?.contextText
        ? String(req.body.contextText).trim()
        : "";
      const isStream = Boolean(
        req.body?.stream ??
          (req.query?.stream === "true" ||
            req.headers?.accept?.includes("text/event-stream")),
      );

      if (!message) {
        return badRequest(res, "Pesan tidak boleh kosong");
      }

      let activeSessionId = String(req.body?.sessionId || "").trim();
      if (!activeSessionId) {
        const newSession = await createChatSession({
          title: message.slice(0, 45).trim() || "Obrolan Baru",
          model: chosenModel,
        });
        activeSessionId = newSession.id;
      }

      // Simpan pesan user ke session
      await appendMessageToSession(activeSessionId, {
        role: "user",
        content: message,
      });

      if (isStream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        if (typeof res.flushHeaders === "function") {
          res.flushHeaders();
        }

        try {
          const result = await streamChatWithTokenPortal({
            message,
            history,
            contextText,
            systemPrompt,
            model: chosenModel,
            onChunk: (delta) => {
              res.write(
                `data: ${JSON.stringify({ type: "chunk", delta })}\n\n`,
              );
            },
          });

          // Simpan pesan assistant dan penggunaan token ke disk secara permanen
          await appendMessageToSession(
            activeSessionId,
            { role: "assistant", content: result.reply, model: chosenModel },
            result.stats,
          );

          res.write(
            `data: ${JSON.stringify({
              type: "done",
              reply: result.reply,
              stats: result.stats,
              sessionId: activeSessionId,
            })}\n\n`,
          );
          return res.end();
        } catch (streamError) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              error: streamError.message,
              hint: streamError.hint || undefined,
            })}\n\n`,
          );
          return res.end();
        }
      }

      const data = await chatWithTokenPortal({
        message,
        history,
        contextText,
        systemPrompt,
        model: chosenModel,
      });

      await appendMessageToSession(
        activeSessionId,
        { role: "assistant", content: data.reply, model: chosenModel },
        data.stats,
      );

      return ok(res, { ...data, sessionId: activeSessionId });
    } catch (error) {
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
    }
  };

  const listSessions = async (_req, res) => {
    try {
      const data = await listChatSessions();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getSession = async (req, res) => {
    try {
      const session = await getChatSession(req.params.sessionId);
      if (!session) return fail(res, "Session chat tidak ditemukan", 404);
      return ok(res, session);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const createSession = async (req, res) => {
    try {
      const session = await createChatSession(req.body || {});
      return ok(res, session);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const updateSession = async (req, res) => {
    try {
      const session = await getChatSession(req.params.sessionId);
      if (!session) return fail(res, "Session chat tidak ditemukan", 404);
      if (req.body?.title) session.title = String(req.body.title).trim();
      const saved = await saveChatSession(session);
      return ok(res, saved);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const deleteSession = async (req, res) => {
    try {
      const deleted = await deleteChatSession(req.params.sessionId);
      return ok(res, { deleted });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const commitMessage = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.body?.projectId);
      const chosenModel = String(req.body?.model || "").trim();
      const {
        contextText,
        git,
        project: enriched,
      } = await buildProjectAiContext(project, processManager, {
        includeLogs: false,
        includeGit: true,
      });

      if (!git?.isRepo) {
        return badRequest(res, "Folder project ini bukan git repository");
      }
      if (!git.dirty) {
        return badRequest(res, "Tidak ada perubahan untuk di-commit");
      }

      const data = await generateCommitMessageWithTokenPortal({
        contextText,
        model: chosenModel,
      });
      return ok(res, {
        message: data.message,
        stats: data.stats,
        model: data.model,
        projectId: enriched.id,
        branch: git.branch,
        changedFiles: git.changedFiles,
      });
    } catch (error) {
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
    }
  };

  const generateGitDocs = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.body?.projectId);
      const docType = String(req.body?.type || req.body?.docType || "all").toLowerCase();
      const chosenModel = String(req.body?.model || "").trim();
      const baseBranch = String(req.body?.baseBranch || "").trim();

      // Start asynchronous background job immediately
      const job = startDocJob({
        project,
        docType,
        model: chosenModel,
        baseBranch,
      });
      return ok(res, job);
    } catch (error) {
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
    }
  };

  const getDocJobStatus = async (req, res) => {
    try {
      const jobId = req.params?.jobId;
      const projectId = req.query?.projectId;

      if (jobId) {
        const job = getDocJob(jobId);
        if (!job) return fail(res, "Job tidak ditemukan", 404);
        return ok(res, job);
      }

      if (projectId) {
        const activeJob = getActiveDocJobForProject(projectId);
        return ok(res, activeJob || null);
      }

      return badRequest(res, "jobId atau projectId wajib disertakan");
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const downloadGitDoc = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.query?.projectId);
      const filename = String(req.query?.filename || "").trim();
      if (!filename || filename.includes("..") || !filename.endsWith(".pdf")) {
        return badRequest(res, "Filename PDF tidak valid");
      }

      const projectDocsDir = getProjectDocsDir(project.id);
      let filePath = path.join(projectDocsDir, filename);
      if (!fs.existsSync(filePath)) {
        const legacyPath = path.join(project.path, "docs", filename);
        if (fs.existsSync(legacyPath)) {
          filePath = legacyPath;
        } else {
          return fail(res, "File PDF tidak ditemukan", 404);
        }
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      const stream = fs.createReadStream(filePath);
      return stream.pipe(res);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const submitDocScreenshots = async (req, res) => {
    try {
      const jobId = String(req.params?.jobId || "").trim();
      const job = getDocJob(jobId);
      if (!job) return fail(res, "Job tidak ditemukan", 404);

      const project = requireProjectOrThrow(job.projectId);
      const files = req.files || [];
      const slotsMetaRaw = req.body?.slots || "[]";
      let slotsMeta = [];
      try {
        slotsMeta = typeof slotsMetaRaw === "string" ? JSON.parse(slotsMetaRaw) : slotsMetaRaw;
      } catch {
        slotsMeta = [];
      }

      // Pastikan folder screenshots di dalam data/docs/<projectId>/screenshots ada
      const screenshotsDir = getProjectScreenshotsDir(project.id);

      // Map uploaded files to slots
      const uploadedScreenshots = [];
      for (const file of files) {
        // file.fieldname bisa berupa 'slot_1', 'screenshot_slot_1', dsb.
        const slotId = file.fieldname.replace(/^screenshot_/, "");
        const meta = slotsMeta.find((m) => m.id === slotId) || {};
        
        const ext = path.extname(file.originalname) || ".png";
        const cleanName = `${jobId}_${slotId}_${Date.now()}${ext}`;
        const targetPath = path.join(screenshotsDir, cleanName);

        // Jika multer menggunakan memoryStorage, tulis buffer ke file
        if (file.buffer) {
          await fs.promises.writeFile(targetPath, file.buffer);
        } else if (file.path) {
          await fs.promises.copyFile(file.path, targetPath);
        }

        uploadedScreenshots.push({
          id: slotId,
          section: meta.section || slotId,
          caption: meta.sampleCaption || meta.section || "Screenshot Antarmuka",
          filePath: targetPath,
          originalName: file.originalname,
        });
      }

      // Lanjutkan job AI secara asinkron
      void resumeDocJobWithScreenshots({
        jobId,
        uploadedScreenshots,
        skipped: false,
      });

      return ok(res, getDocJob(jobId));
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const skipDocScreenshots = async (req, res) => {
    try {
      const jobId = String(req.params?.jobId || "").trim();
      const job = getDocJob(jobId);
      if (!job) return fail(res, "Job tidak ditemukan", 404);

      // Lanjutkan job AI tanpa screenshot secara asinkron
      void resumeDocJobWithScreenshots({
        jobId,
        uploadedScreenshots: [],
        skipped: true,
      });

      return ok(res, getDocJob(jobId));
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const listGitDocs = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.query?.projectId);
      const docs = await listSavedPdfDocuments(project.id);
      return ok(res, docs);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const deleteGitDoc = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.query?.projectId);
      const filename = String(req.query?.filename || "").trim();
      if (!filename || filename.includes("..") || !filename.endsWith(".pdf")) {
        return badRequest(res, "Filename PDF tidak valid");
      }

      await deletePdfDocument(project.id, filename);
      const docs = await listSavedPdfDocuments(project.id);
      return ok(res, docs);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const openDocsFolder = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.query?.projectId || req.body?.projectId);
      const projectDocsDir = getProjectDocsDir(project.id);
      if (!fs.existsSync(projectDocsDir)) {
        await fs.promises.mkdir(projectDocsDir, { recursive: true });
      }

      if (process.platform === "win32") {
        exec(`explorer "${projectDocsDir}"`);
      } else if (process.platform === "darwin") {
        exec(`open "${projectDocsDir}"`);
      } else {
        exec(`xdg-open "${projectDocsDir}"`);
      }

      return ok(res, { path: projectDocsDir });
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const getMemory = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const memory = await getProjectMemory(project.id);
      return ok(res, memory);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const updateMemory = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const updates = req.body || {};
      const updated = await updateProjectMemory(project.id, updates);
      return ok(res, updated);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  return {
    status,
    models,
    chat,
    listSessions,
    getSession,
    createSession,
    updateSession,
    deleteSession,
    commitMessage,
    generateGitDocs,
    getDocJobStatus,
    submitDocScreenshots,
    skipDocScreenshots,
    listGitDocs,
    downloadGitDoc,
    deleteGitDoc,
    openDocsFolder,
    getMemory,
    updateMemory,
  };
};
