import { buildProjectAiContext } from "./aiContext.service.js";
import {
  getProjectFileTree,
  readProjectFile,
  searchProjectFiles,
  writeProjectFile,
  editProjectFile,
} from "./files.service.js";
import { runProjectCommand } from "./projectExec.service.js";
import { chatWithOllama, streamChatWithOllama } from "./ollama.service.js";
import { autoExtractMemoryFromConversation } from "./aiMemory.service.js";
import { searchCodebaseRAG } from "./rag.service.js";

const AGENT_SYSTEM_PROMPT = [
  "Anda adalah AI Coding Agent profesional yang terintegrasi LANGSUNG dengan sistem file project lokal ini.",
  "Anda MEMILIKI AKSES PENUH ke struktur direktori, manifest package.json, log, status git, serta isi file project yang disediakan di dalam konteks di bawah.",
  "SANGAT PENTING: JANGAN PERNAH menyatakan bahwa Anda tidak bisa mengakses file/proyek Anda atau meminta user melampirkan file secara manual.",
  "Anda SUDAH memiliki akses ke direktori dan pencarian file project.",
  "Tugas Anda adalah menelusuri kode, menjelaskan arsitektur & fitur, menemukan bug, dan memberikan jawaban teknis yang jelas, presisi, dan bermanfaat dalam Bahasa Indonesia.",
].join(" ");

const EXTRACT_SEARCH_KEYWORDS = (text) => {
  const lower = text.toLowerCase();
  const stopWords = new Set([
    "tolong",
    "kamu",
    "review",
    "fitur",
    "di",
    "projek",
    "project",
    "saya",
    "ini",
    "untuk",
    "apakah",
    "bisa",
    "menelusuri",
    "file",
    "atau",
    "harus",
    "berikan",
    "gimana",
    "coba",
    "lihat",
    "dengan",
    "pada",
    "yang",
    "itu",
    "jelaskan",
    "bagaimana",
    "cara",
    "kerja",
    "ada",
    "saja",
    "secara",
    "lengkap",
    "buatkan",
    "analisis",
  ]);

  const words = lower
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  return words;
};

export const runAiAgent = async ({
  project,
  processManager,
  message,
  selectedFiles = [],
  history = [],
}) => {
  const userText = String(message || "").trim();
  if (!userText) {
    throw Object.assign(new Error("Pesan user wajib diisi"), { status: 400 });
  }

  const steps = [];
  const modifiedFiles = [];
  const commandOutputs = [];
  const now = Date.now();

  // 1. Inspect Project Context & Structure
  steps.push({
    id: `step-1-${now}`,
    title: "Inspect Project Context & Structure",
    type: "inspect",
    status: "success",
    details: `Memeriksa metadata project '${project.name}', struktur file, dan git status`,
    timestamp: Date.now(),
  });

  const { contextText, project: enriched } = await buildProjectAiContext(
    project,
    processManager,
    { includeLogs: true, includeGit: true, logLimit: 80 },
  );

  const selectedFilesContent = [];

  // 2. Read selected files attached by user from Project Explorer
  if (Array.isArray(selectedFiles) && selectedFiles.length > 0) {
    for (const fileRelPath of selectedFiles.slice(0, 10)) {
      try {
        const fileData = await readProjectFile(project.path, fileRelPath);
        if (!fileData.isBinary) {
          selectedFilesContent.push(
            `### File Context: ${fileData.path}\n\`\`\`\n${fileData.content}\n\`\`\``,
          );
          steps.push({
            id: `step-read-${fileRelPath}-${now}`,
            title: `Reading Attached Context: ${fileRelPath}`,
            type: "read",
            status: "success",
            details: `Membaca ${fileData.size} byte dari ${fileRelPath}`,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        steps.push({
          id: `step-read-err-${fileRelPath}-${now}`,
          title: `Failed to Read: ${fileRelPath}`,
          type: "read",
          status: "error",
          details: err.message,
          timestamp: Date.now(),
        });
      }
    }
  }

  // 3. Auto RAG Search & Code File Reading
  const lowerMsg = userText.toLowerCase();
  const shouldSearch =
    lowerMsg.includes("fitur") ||
    lowerMsg.includes("review") ||
    lowerMsg.includes("telusuri") ||
    lowerMsg.includes("struktur") ||
    lowerMsg.includes("cari") ||
    lowerMsg.includes("find") ||
    lowerMsg.includes("search") ||
    lowerMsg.includes("jelaskan") ||
    lowerMsg.includes("bagaimana") ||
    lowerMsg.includes("apa saja");

  if (shouldSearch) {
    steps.push({
      id: `step-rag-${now}`,
      title: `RAG Codebase Retrieval: Fetching Relevant Code Chunks`,
      type: "search",
      status: "pending",
      details: `Mencari potongan kode relevan via RAG (BM25/TF-IDF)`,
      timestamp: Date.now(),
    });

    try {
      const ragMatches = await searchCodebaseRAG(project.path, userText, 4);
      const ragStep = steps.find((s) => s.id === `step-rag-${now}`);
      if (ragStep) {
        ragStep.status = "success";
        ragStep.details = `Ditemukan ${ragMatches.length} potongan kode relevan via RAG`;
      }

      if (ragMatches.length > 0) {
        selectedFilesContent.push(
          "### RAG Codebase Retrieved Chunks:\n" +
            ragMatches
              .map(
                (c) =>
                  `#### File: ${c.path} (L${c.startLine}-L${c.endLine}, Score: ${c.score.toFixed(1)})\n\`\`\`\n${c.content}\n\`\`\``,
              )
              .join("\n\n"),
        );
      }
    } catch {
      // ignore RAG fail
    }

    const keywords = EXTRACT_SEARCH_KEYWORDS(userText);
    const searchTarget = keywords.length > 0 ? keywords[0] : "export";

    steps.push({
      id: `step-search-${now}`,
      title: `Auto Scanning Codebase & Key Features`,
      type: "search",
      status: "pending",
      details: `Menganalisis pencocokan kode untuk '${searchTarget}'`,
      timestamp: Date.now(),
    });

    try {
      const searchResults = await searchProjectFiles(
        project.path,
        searchTarget,
        20,
      );
      const searchStep = steps.find((s) => s.id === `step-search-${now}`);
      if (searchStep) {
        searchStep.status = "success";
        searchStep.details = `Ditemukan ${searchResults.length} baris kode terkait`;
      }

      if (searchResults.length > 0) {
        // Auto-read top 3 unique source files found in search results
        const uniquePaths = [
          ...new Set(searchResults.map((r) => r.path).filter(Boolean)),
        ].slice(0, 3);

        for (const filePath of uniquePaths) {
          try {
            const fileData = await readProjectFile(project.path, filePath);
            if (!fileData.isBinary && fileData.content) {
              const snippet =
                fileData.content.length > 6000
                  ? `${fileData.content.slice(0, 6000)}\n... [sisa kode file dipotong agar muat dalam konteks LLM]`
                  : fileData.content;

              selectedFilesContent.push(
                `### Auto-Loaded Code File: ${fileData.path}\n\`\`\`\n${snippet}\n\`\`\``,
              );
              steps.push({
                id: `step-auto-read-${filePath}-${now}`,
                title: `Auto-Reading Code Source: ${filePath}`,
                type: "read",
                status: "success",
                details: `Membaca ${Math.min(fileData.size, 6000)} byte dari ${filePath}`,
                timestamp: Date.now(),
              });
            }
          } catch {
            // ignore read error
          }
        }
      }
    } catch {
      // ignore search fail
    }
  }

  // Combine full agent prompt context
  const fullContextParts = [contextText].filter(Boolean);

  steps.push({
    id: `step-analyze-${now}`,
    title: `Analyzing Request & Formulating Agent Plan`,
    type: "analyze",
    status: "success",
    details: `Mengirimkan konteks project dan prompt ke Ollama`,
    timestamp: Date.now(),
  });

  const agentUserMessage =
    selectedFilesContent.length > 0
      ? `${userText}\n\n### KODE KODE PROYEK UNTUK DIREVIEW / DITELUSURI:\n${selectedFilesContent.join("\n\n")}\n\n[PENTING DARI SISTEM: Kode sumber untuk fitur di atas sudah dibaca langsung dari direktori proyek lokal. Lakukan review kode, analisis fungsi, dan berikan evaluasi teknis secara mendalam dalam Bahasa Indonesia baku berdasarkan kode di atas. DILARANG meminta user memberikan detail atau kode lagi karena kodenya sudah ada di atas.]`
      : userText;

  const chatResult = await chatWithOllama({
    message: agentUserMessage,
    history,
    contextText: fullContextParts.join("\n\n"),
    systemPrompt: AGENT_SYSTEM_PROMPT,
  });

  // Auto-extract memory from conversation
  try {
    await autoExtractMemoryFromConversation(enriched.id, userText, chatResult.reply);
  } catch {
    // ignore
  }

  steps.push({
    id: `step-complete-${now}`,
    title: `Agent Task Execution Completed`,
    type: "report",
    status: "success",
    details: `Respon agen berhasil dibuat`,
    timestamp: Date.now(),
  });

  return {
    reply: chatResult.reply,
    stats: chatResult.stats,
    projectId: enriched.id,
    steps,
    modifiedFiles,
    commandOutputs,
    selectedFiles,
  };
};

export const streamRunAiAgent = async ({
  project,
  processManager,
  message,
  selectedFiles = [],
  history = [],
  onStep,
  onChunk,
}) => {
  const userText = String(message || "").trim();
  if (!userText) {
    throw Object.assign(new Error("Pesan user wajib diisi"), { status: 400 });
  }

  const steps = [];
  const modifiedFiles = [];
  const commandOutputs = [];
  const now = Date.now();

  const emitStep = (step) => {
    steps.push(step);
    if (onStep) onStep(step);
  };

  // 1. Inspect Project Context & Structure
  emitStep({
    id: `step-1-${now}`,
    title: "Inspect Project Context & Structure",
    type: "inspect",
    status: "success",
    details: `Memeriksa metadata project '${project.name}' dan git status`,
    timestamp: Date.now(),
  });

  const { contextText, project: enriched } = await buildProjectAiContext(
    project,
    processManager,
    { includeLogs: true, includeGit: true, logLimit: 80 }
  );

  // 2. Read selected files attached by user from Project Explorer
  const selectedFilesContent = [];
  if (Array.isArray(selectedFiles) && selectedFiles.length > 0) {
    for (const fileRelPath of selectedFiles.slice(0, 10)) {
      try {
        const fileData = await readProjectFile(project.path, fileRelPath);
        if (!fileData.isBinary) {
          selectedFilesContent.push(
            `### File Context: ${fileData.path}\n\`\`\`\n${fileData.content}\n\`\`\``
          );
          emitStep({
            id: `step-read-${fileRelPath}-${now}`,
            title: `Reading Attached Context: ${fileRelPath}`,
            type: "read",
            status: "success",
            details: `Membaca ${fileData.size} byte dari ${fileRelPath}`,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        emitStep({
          id: `step-read-err-${fileRelPath}-${now}`,
          title: `Failed to Read: ${fileRelPath}`,
          type: "read",
          status: "error",
          details: err.message,
          timestamp: Date.now(),
        });
      }
    }
  }

  // 3. Auto Code Search & Auto File Reading
  const lowerMsg = userText.toLowerCase();
  const shouldSearch =
    lowerMsg.includes("fitur") ||
    lowerMsg.includes("review") ||
    lowerMsg.includes("telusuri") ||
    lowerMsg.includes("struktur") ||
    lowerMsg.includes("cari") ||
    lowerMsg.includes("find") ||
    lowerMsg.includes("search") ||
    lowerMsg.includes("jelaskan") ||
    lowerMsg.includes("bagaimana") ||
    lowerMsg.includes("apa saja");

  if (shouldSearch) {
    const ragStep = {
      id: `step-rag-${now}`,
      title: `RAG Codebase Retrieval: Fetching Relevant Code Chunks`,
      type: "search",
      status: "pending",
      details: `Mencari potongan kode relevan via RAG (BM25/TF-IDF)`,
      timestamp: Date.now(),
    };
    emitStep(ragStep);

    try {
      const ragMatches = await searchCodebaseRAG(project.path, userText, 4);
      ragStep.status = "success";
      ragStep.details = `Ditemukan ${ragMatches.length} potongan kode relevan via RAG`;
      if (onStep) onStep(ragStep);

      if (ragMatches.length > 0) {
        selectedFilesContent.push(
          "### RAG Codebase Retrieved Chunks:\n" +
            ragMatches
              .map(
                (c) =>
                  `#### File: ${c.path} (L${c.startLine}-L${c.endLine}, Score: ${c.score.toFixed(1)})\n\`\`\`\n${c.content}\n\`\`\``,
              )
              .join("\n\n"),
        );
      }
    } catch {
      // ignore RAG fail
    }

    const keywords = EXTRACT_SEARCH_KEYWORDS(userText);
    const searchTarget = keywords.length > 0 ? keywords[0] : "export";

    const searchStep = {
      id: `step-search-${now}`,
      title: `Auto Scanning Codebase & Key Features`,
      type: "search",
      status: "pending",
      details: `Menganalisis pencocokan kode untuk '${searchTarget}'`,
      timestamp: Date.now(),
    };
    emitStep(searchStep);

    try {
      const searchResults = await searchProjectFiles(
        project.path,
        searchTarget,
        20,
      );
      searchStep.status = "success";
      searchStep.details = `Ditemukan ${searchResults.length} baris kode terkait`;
      if (onStep) onStep(searchStep);

      if (searchResults.length > 0) {
        // Auto-read top 3 unique source files found in search results
        const uniquePaths = [
          ...new Set(searchResults.map((r) => r.path).filter(Boolean)),
        ].slice(0, 3);

        for (const filePath of uniquePaths) {
          try {
            const fileData = await readProjectFile(project.path, filePath);
            if (!fileData.isBinary && fileData.content) {
              const snippet =
                fileData.content.length > 6000
                  ? `${fileData.content.slice(0, 6000)}\n... [sisa kode file dipotong agar muat dalam konteks LLM]`
                  : fileData.content;

              selectedFilesContent.push(
                `### Auto-Loaded Code File: ${fileData.path}\n\`\`\`\n${snippet}\n\`\`\``,
              );
              emitStep({
                id: `step-auto-read-${filePath}-${now}`,
                title: `Auto-Reading Code Source: ${filePath}`,
                type: "read",
                status: "success",
                details: `Membaca ${Math.min(fileData.size, 6000)} byte dari ${filePath}`,
                timestamp: Date.now(),
              });
            }
          } catch {
            // ignore read error
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const fullContextParts = [contextText].filter(Boolean);

  emitStep({
    id: `step-analyze-${now}`,
    title: `Analyzing Request & Formulating Agent Plan`,
    type: "analyze",
    status: "success",
    details: `Mengirimkan konteks project dan prompt ke Ollama`,
    timestamp: Date.now(),
  });

  const agentUserMessage =
    selectedFilesContent.length > 0
      ? `${userText}\n\n### KODE KODE PROYEK UNTUK DIREVIEW / DITELUSURI:\n${selectedFilesContent.join("\n\n")}\n\n[PENTING DARI SISTEM: Kode sumber untuk fitur di atas sudah dibaca langsung dari direktori proyek lokal. Lakukan review kode, analisis fungsi, dan berikan evaluasi teknis secara mendalam dalam Bahasa Indonesia baku berdasarkan kode di atas. DILARANG meminta user memberikan detail atau kode lagi karena kodenya sudah ada di atas.]`
      : userText;

  const chatResult = await streamChatWithOllama({
    message: agentUserMessage,
    history,
    contextText: fullContextParts.join("\n\n"),
    systemPrompt: AGENT_SYSTEM_PROMPT,
    onChunk,
  });

  // Auto-extract memory from conversation
  try {
    await autoExtractMemoryFromConversation(enriched.id, userText, chatResult.reply);
  } catch {
    // ignore
  }

  emitStep({
    id: `step-complete-${now}`,
    title: `Agent Task Execution Completed`,
    type: "report",
    status: "success",
    details: `Respon agen berhasil dibuat`,
    timestamp: Date.now(),
  });

  return {
    reply: chatResult.reply,
    stats: chatResult.stats,
    projectId: enriched.id,
    steps,
    modifiedFiles,
    commandOutputs,
    selectedFiles,
  };
};

export const executeAgentAction = async ({
  project,
  actionType, // 'write_file' | 'edit_file' | 'run_command'
  filePath,
  content,
  targetContent,
  replacementContent,
  command,
}) => {
  if (actionType === "write_file") {
    const res = await writeProjectFile(project.path, filePath, content);
    return {
      action: "write_file",
      result: res,
    };
  }

  if (actionType === "edit_file") {
    const res = await editProjectFile(
      project.path,
      filePath,
      targetContent,
      replacementContent
    );
    return {
      action: "edit_file",
      result: res,
    };
  }

  if (actionType === "run_command") {
    const res = await runProjectCommand(project.path, command);
    return {
      action: "run_command",
      result: res,
    };
  }

  throw Object.assign(new Error(`Tipe aksi '${actionType}' tidak dikenal`), {
    status: 400,
  });
};
