import { badRequest, fail, ok } from "../utils/response.js";
import {
  chatWithTokenPortal,
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
  listSavedPdfDocuments,
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
  resumeDocJobWithScreenshots,
  startDocJob,
} from "../services/aiDocJob.service.js";

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

      // Pastikan folder temp untuk screenshot ada
      const tempDir = path.join(project.path, "docs", ".tmp_screenshots");
      if (!fs.existsSync(tempDir)) {
        await fs.promises.mkdir(tempDir, { recursive: true });
      }

      // Map uploaded files to slots
      const uploadedScreenshots = [];
      for (const file of files) {
        // file.fieldname bisa berupa 'slot_1', 'screenshot_slot_1', dsb.
        const slotId = file.fieldname.replace(/^screenshot_/, "");
        const meta = slotsMeta.find((m) => m.id === slotId) || {};
        
        const ext = path.extname(file.originalname) || ".png";
        const cleanName = `${jobId}_${slotId}_${Date.now()}${ext}`;
        const targetPath = path.join(tempDir, cleanName);

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
      const docs = await listSavedPdfDocuments(project.path);
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

      await deletePdfDocument(project.path, filename);
      const docs = await listSavedPdfDocuments(project.path);
      return ok(res, docs);
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
    commitMessage,
    generateGitDocs,
    getDocJobStatus,
    submitDocScreenshots,
    skipDocScreenshots,
    listGitDocs,
    downloadGitDoc,
    deleteGitDoc,
    getMemory,
    updateMemory,
  };
};
