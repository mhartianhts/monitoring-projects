import { badRequest, fail, ok } from "../utils/response.js";
import {
  executeAgentAction,
  runAiAgent,
  streamRunAiAgent,
} from "../services/aiAgent.service.js";
import {
  chatWithOllama,
  generateCommitMessageWithOllama,
  getOllamaStatus,
  streamChatWithOllama,
} from "../services/ollama.service.js";
import {
  buildProjectAiContext,
  requireProjectOrThrow,
} from "../services/aiContext.service.js";
import {
  appendChatMessages,
  clearChatHistory,
  createSession,
  deleteSession,
  getChatHistory,
  getProjectSessions,
  renameSession,
  saveChatHistory,
} from "../services/aiChatHistory.service.js";
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


export const createAiController = (processManager) => {
  const status = async (_req, res) => {
    try {
      const data = await getOllamaStatus();
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const getSessions = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const data = getProjectSessions(project.id);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const createSessionHandler = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const title = req.body?.title;
      const data = createSession(project.id, title);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const deleteSessionHandler = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const sessionId = req.params.sessionId;
      const data = deleteSession(project.id, sessionId);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const renameSessionHandler = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const sessionId = req.params.sessionId;
      const title = req.body?.title;
      const data = renameSession(project.id, sessionId, title);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const getHistory = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const sessionId = req.query.sessionId ? String(req.query.sessionId) : null;
      const data = getChatHistory(project.id, sessionId);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const putHistory = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const sessionId = req.body?.sessionId ? String(req.body.sessionId) : null;
      const messages = Array.isArray(req.body?.messages)
        ? req.body.messages
        : null;
      if (!messages) {
        return badRequest(res, "Field messages wajib diisi (array)");
      }
      const data = saveChatHistory(project.id, messages, sessionId);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const deleteHistory = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.params.projectId);
      const sessionId = req.query?.sessionId ? String(req.query.sessionId) : null;
      const data = clearChatHistory(project.id, sessionId);
      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const chat = async (req, res) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return badRequest(res, "Field message wajib diisi (string)");
    }

    try {
      const project = requireProjectOrThrow(req.body?.projectId);
      const sessionId = req.body?.sessionId ? String(req.body.sessionId) : null;
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const includeLogs = req.body?.includeLogs !== false;
      const includeGit = req.body?.includeGit !== false;
      const userText = message.trim();
      const now = Date.now();

      const { contextText, project: enriched } = await buildProjectAiContext(
        project,
        processManager,
        { includeLogs, includeGit, logLimit: 100 },
      );

      const data = await chatWithOllama({
        message: userText,
        history,
        contextText,
      });

      const saved = appendChatMessages(enriched.id, [
        {
          id: `u-${now}`,
          role: "user",
          content: userText,
          ts: now,
        },
        {
          id: `a-${now + 1}`,
          role: "assistant",
          content: data.reply,
          ts: now + 1,
        },
      ], sessionId);

      return ok(res, {
        reply: data.reply,
        stats: data.stats,
        projectId: enriched.id,
        history: saved,
        context: {
          includeLogs,
          includeGit,
        },
      });
    } catch (error) {
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
    }
  };

  const agentRun = async (req, res) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return badRequest(res, "Field message wajib diisi (string)");
    }

    try {
      const project = requireProjectOrThrow(req.body?.projectId);
      const sessionId = req.body?.sessionId ? String(req.body.sessionId) : null;
      const selectedFiles = Array.isArray(req.body?.selectedFiles)
        ? req.body.selectedFiles
        : [];
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const userText = message.trim();
      const now = Date.now();

      const data = await runAiAgent({
        project,
        processManager,
        message: userText,
        selectedFiles,
        history,
      });

      const saved = appendChatMessages(project.id, [
        {
          id: `u-${now}`,
          role: "user",
          content: userText,
          ts: now,
        },
        {
          id: `a-${now + 1}`,
          role: "assistant",
          content: data.reply,
          ts: now + 1,
          steps: data.steps,
          modifiedFiles: data.modifiedFiles,
          commandOutputs: data.commandOutputs,
        },
      ], sessionId);

      return ok(res, {
        ...data,
        history: saved,
      });
    } catch (error) {
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
    }
  };

  const agentAction = async (req, res) => {
    try {
      const project = requireProjectOrThrow(req.body?.projectId);
      const actionType = String(req.body?.actionType || "").trim();
      const filePath = req.body?.filePath;
      const content = req.body?.content;
      const targetContent = req.body?.targetContent;
      const replacementContent = req.body?.replacementContent;
      const command = req.body?.command;

      const data = await executeAgentAction({
        project,
        actionType,
        filePath,
        content,
        targetContent,
        replacementContent,
        command,
      });

      return ok(res, data);
    } catch (error) {
      return fail(res, error.message, error.status || 500);
    }
  };

  const streamChat = async (req, res) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return badRequest(res, "Field message wajib diisi (string)");
    }

    try {
      const project = requireProjectOrThrow(req.body?.projectId);
      const sessionId = req.body?.sessionId ? String(req.body.sessionId) : null;
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const includeLogs = req.body?.includeLogs !== false;
      const includeGit = req.body?.includeGit !== false;
      const userText = message.trim();
      const now = Date.now();

      const { contextText, project: enriched } = await buildProjectAiContext(
        project,
        processManager,
        { includeLogs, includeGit, logLimit: 100 }
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const data = await streamChatWithOllama({
        message: userText,
        history,
        contextText,
        onChunk: (text) => {
          res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
        },
      });

      const saved = appendChatMessages(enriched.id, [
        {
          id: `u-${now}`,
          role: "user",
          content: userText,
          ts: now,
        },
        {
          id: `a-${now + 1}`,
          role: "assistant",
          content: data.reply,
          ts: now + 1,
        },
      ], sessionId);

      res.write(
        `data: ${JSON.stringify({
          type: "done",
          reply: data.reply,
          stats: data.stats,
          projectId: enriched.id,
          history: saved,
        })}\n\n`
      );
      return res.end();
    } catch (error) {
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`
        );
        return res.end();
      }
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
    }
  };

  const streamAgentRun = async (req, res) => {
    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
      return badRequest(res, "Field message wajib diisi (string)");
    }

    try {
      const project = requireProjectOrThrow(req.body?.projectId);
      const sessionId = req.body?.sessionId ? String(req.body.sessionId) : null;
      const selectedFiles = Array.isArray(req.body?.selectedFiles)
        ? req.body.selectedFiles
        : [];
      const history = Array.isArray(req.body?.history) ? req.body.history : [];
      const userText = message.trim();
      const now = Date.now();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const data = await streamRunAiAgent({
        project,
        processManager,
        message: userText,
        selectedFiles,
        history,
        onStep: (step) => {
          res.write(`data: ${JSON.stringify({ type: "step", step })}\n\n`);
        },
        onChunk: (text) => {
          res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
        },
      });

      const saved = appendChatMessages(project.id, [
        {
          id: `u-${now}`,
          role: "user",
          content: userText,
          ts: now,
        },
        {
          id: `a-${now + 1}`,
          role: "assistant",
          content: data.reply,
          ts: now + 1,
          steps: data.steps,
          modifiedFiles: data.modifiedFiles,
          commandOutputs: data.commandOutputs,
        },
      ], sessionId);

      res.write(
        `data: ${JSON.stringify({
          type: "done",
          ...data,
          history: saved,
        })}\n\n`
      );
      return res.end();
    } catch (error) {
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`
        );
        return res.end();
      }
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
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
      const diffData = await getBranchDiffForDocs(project.path);

      const safeBranch = (diffData.branch || "branch").replace(
        /[^a-zA-Z0-9_\-]/g,
        "_",
      );

      const TECH_DOC_PROMPT = [
        "Anda adalah seorang Software Architect dan Technical Writer profesional.",
        "SANGAT PENTING: Anda WAJIB menuliskan seluruh Dokumentasi Teknikal ini secara penuh dalam Bahasa Indonesia baku yang baik, benar, dan profesional.",
        "DILARANG KERAS menggunakan Bahasa Inggris untuk narasi, penjelasan, petunjuk, atau sub-judul (kecuali istilah teknis baku atau variabel/kode program).",
        "",
        "Gunakan struktur Markdown berikut:",
        "# Dokumentasi Teknikal",
        "## 1. Ringkasan Perubahan Teknikal",
        "## 2. Struktur File & Modul Terkait",
        "## 3. Detail Implementasi & Perubahan Kode",
        "## 4. Konfigurasi & Dependensi",
        "## 5. Catatan Pengujian & Pemeliharaan",
      ].join("\n");

      const USER_GUIDE_PROMPT = [
        "Anda adalah seorang UX Writer dan Pengajar Teknis profesional.",
        "SANGAT PENTING: Anda WAJIB menuliskan seluruh User Guide (Panduan Pengguna) ini secara penuh dalam Bahasa Indonesia yang ramah, jelas, dan mudah dipahami oleh pengguna akhir.",
        "DILARANG KERAS menggunakan Bahasa Inggris untuk narasi, penjelasan, atau langkah-langkah penggunaan.",
        "",
        "Gunakan struktur Markdown berikut:",
        "# Panduan Pengguna (User Guide)",
        "## 1. Pengenalan Fitur Baru / Perubahan",
        "## 2. Prasyarat & Ketentuan",
        "## 3. Langkah-Langkah Penggunaan",
        "## 4. Tips & Troubleshooting",
        "## 5. Pertanyaan Umum (FAQ)",
      ].join("\n");

      const promptText = `Berikut adalah data perubahan git di branch ${diffData.branch}:\n\n${diffData.summary}`;

      const generatedDocs = [];

      // Generate Technical Doc
      if (docType === "all" || docType === "technical") {
        const techUserMessage = [
          "PERINGATAN SANGAT PENTING: Anda DILARANG KERAS menggunakan Bahasa Inggris untuk narasi atau sub-judul. Seluruh isi dokumen ini WAJIB ditulis 100% dalam Bahasa Indonesia baku yang profesional.",
          "",
          `Buatkan Dokumentasi Teknikal (Technical Documentation) lengkap untuk proyek '${project.name}' berdasarkan data perubahan git berikut:`,
          promptText,
          "",
          "Anda WAJIB menggunakan struktur Markdown berikut persis:",
          "# Dokumentasi Teknikal",
          "## 1. Ringkasan Perubahan Teknikal",
          "## 2. File & Modul Terkait yang Mengalami Perubahan",
          "## 3. Detail Implementasi & Perubahan Kode Utama",
          "## 4. Konfigurasi & Dependensi System",
          "## 5. Rekomendasi Pengujian & Pemeliharaan Kode",
          "",
          "Pastikan semua narasi, penjelasan fungsi, dan sub-judul ditulis penuh dalam Bahasa Indonesia baku.",
        ].join("\n");

        const techRes = await chatWithOllama({
          message: techUserMessage,
          systemPrompt:
            "Anda adalah Software Architect dan Technical Writer profesional. Tulis seluruh dokumen dalam Bahasa Indonesia baku yang sempurna.",
        });

        const techPdfBuffer = await createPdfFromMarkdown({
          title: "Dokumentasi Teknikal",
          subtitle: diffData.branch,
          markdown: techRes.reply,
          projectName: project.name,
        });

        const techFileInfo = await savePdfDocument(
          project.path,
          `Dokumentasi_Teknis_${safeBranch}.pdf`,
          techPdfBuffer,
        );

        generatedDocs.push({
          type: "technical",
          title: "Dokumentasi Teknikal",
          filename: techFileInfo.filename,
          relativePath: techFileInfo.relativePath,
          sizeBytes: techFileInfo.sizeBytes,
          createdAt: techFileInfo.createdAt,
          markdown: techRes.reply,
        });
      }

      // Generate User Guide
      if (docType === "all" || docType === "user_guide") {
        const userGuideUserMessage = [
          "PERINGATAN SANGAT PENTING: Anda DILARANG KERAS menggunakan Bahasa Inggris untuk narasi, sub-judul, atau petunjuk penggunaan. Seluruh isi panduan ini WAJIB ditulis 100% dalam Bahasa Indonesia yang ramah, jelas, dan mudah dipahami oleh pengguna akhir.",
          "",
          `Buatkan Panduan Pengguna (User Guide) lengkap untuk proyek '${project.name}' berdasarkan data perubahan git berikut:`,
          promptText,
          "",
          "Anda WAJIB menggunakan struktur Markdown berikut persis:",
          "# Panduan Pengguna (User Guide)",
          "## 1. Pengenalan Fitur Baru / Perubahan System",
          "## 2. Prasyarat & Ketentuan Penggunaan",
          "## 3. Langkah-Langkah Penggunaan (Panduan Praktis)",
          "## 4. Tips & Troubleshooting (Penanganan Masalah)",
          "## 5. Pertanyaan Umum (FAQ)",
          "",
          "Pastikan semua narasi, penjelasan, dan petunjuk langkah-demi-langkah ditulis penuh dalam Bahasa Indonesia yang baik dan jelas.",
        ].join("\n");

        const userRes = await chatWithOllama({
          message: userGuideUserMessage,
          systemPrompt:
            "Anda adalah UX Writer dan Pengajar Teknis profesional. Tulis seluruh panduan pengguna dalam Bahasa Indonesia yang ramah dan mudah dipahami.",
        });

        const userPdfBuffer = await createPdfFromMarkdown({
          title: "User Guide (Panduan Pengguna)",
          subtitle: diffData.branch,
          markdown: userRes.reply,
          projectName: project.name,
        });

        const userFileInfo = await savePdfDocument(
          project.path,
          `User_Guide_${safeBranch}.pdf`,
          userPdfBuffer,
        );

        generatedDocs.push({
          type: "user_guide",
          title: "User Guide",
          filename: userFileInfo.filename,
          relativePath: userFileInfo.relativePath,
          sizeBytes: userFileInfo.sizeBytes,
          createdAt: userFileInfo.createdAt,
          markdown: userRes.reply,
        });
      }

      return ok(res, {
        projectId: project.id,
        branch: diffData.branch,
        docs: generatedDocs,
      });
    } catch (error) {
      return fail(res, error.message, error.status || 500, {
        hint: error.hint || undefined,
      });
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
    getSessions,
    createSessionHandler,
    deleteSessionHandler,
    renameSessionHandler,
    chat,
    streamChat,
    agentRun,
    streamAgentRun,
    agentAction,
    commitMessage,
    generateGitDocs,
    downloadGitDoc,
    getHistory,
    putHistory,
    deleteHistory,
    getMemory,
    updateMemory,
  };
};


