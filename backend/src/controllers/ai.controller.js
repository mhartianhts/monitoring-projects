import { badRequest, fail, ok } from "../utils/response.js";
import {
  chatWithOllama,
  generateCommitMessageWithOllama,
  getOllamaStatus,
} from "../services/ollama.service.js";
import {
  buildProjectAiContext,
  requireProjectOrThrow,
} from "../services/aiContext.service.js";
import { getBranchDiffForDocs } from "../services/git.service.js";
import {
  createPdfFromMarkdown,
  savePdfDocument,
} from "../services/pdf.service.js";
import {
  getProjectMemory,
  updateProjectMemory,
} from "../services/aiMemory.service.js";
import fs from "node:fs";
import path from "node:path";

import {
  getActiveDocJobForProject,
  getDocJob,
  startDocJob,
} from "../services/aiDocJob.service.js";

export const createAiController = (processManager) => {
  const status = async (_req, res) => {
    try {
      const data = await getOllamaStatus();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const commitMessage = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.body?.projectId);
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

      const data = await generateCommitMessageWithOllama({ contextText });
      return ok(res, {
        message: data.message,
        stats: data.stats,
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

      // Start asynchronous background job immediately
      const job = startDocJob({ project, docType });
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

      const filePath = path.join(project.path, "docs", filename);
      if (!fs.existsSync(filePath)) {
        return fail(res, "File PDF tidak ditemukan", 404);
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      const stream = fs.createReadStream(filePath);
      return stream.pipe(res);
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
    commitMessage,
    generateGitDocs,
    getDocJobStatus,
    downloadGitDoc,
    getMemory,
    updateMemory,
  };
};
