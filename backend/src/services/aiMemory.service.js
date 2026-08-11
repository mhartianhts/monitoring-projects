import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const memoryDir = path.join(dataDir, "memory");

const ensureDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
};

export const safeMemoryFileName = (projectId) => {
  const safe = String(projectId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${(safe || "unknown").slice(0, 180)}.json`;
};

const getMemoryPath = (projectId) =>
  path.join(memoryDir, safeMemoryFileName(projectId));

export const getProjectMemory = async (projectId) => {
  if (!projectId) return null;
  ensureDir();
  const filePath = getMemoryPath(projectId);
  if (!fs.existsSync(filePath)) {
    return {
      projectId,
      updatedAt: Date.now(),
      userRules: [],
      architectureNotes: [],
      keyDecisions: [],
      learnedFacts: [],
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    return {
      projectId,
      updatedAt: data.updatedAt || Date.now(),
      userRules: Array.isArray(data.userRules) ? data.userRules : [],
      architectureNotes: Array.isArray(data.architectureNotes) ? data.architectureNotes : [],
      keyDecisions: Array.isArray(data.keyDecisions) ? data.keyDecisions : [],
      learnedFacts: Array.isArray(data.learnedFacts) ? data.learnedFacts : [],
    };
  } catch {
    return {
      projectId,
      updatedAt: Date.now(),
      userRules: [],
      architectureNotes: [],
      keyDecisions: [],
      learnedFacts: [],
    };
  }
};

export const updateProjectMemory = async (projectId, updates = {}) => {
  if (!projectId) return null;
  ensureDir();
  const existing = await getProjectMemory(projectId);

  const merged = {
    projectId,
    updatedAt: Date.now(),
    userRules: Array.from(new Set([...existing.userRules, ...(updates.userRules || [])])),
    architectureNotes: Array.from(new Set([...existing.architectureNotes, ...(updates.architectureNotes || [])])),
    keyDecisions: Array.from(new Set([...existing.keyDecisions, ...(updates.keyDecisions || [])])),
    learnedFacts: Array.from(new Set([...existing.learnedFacts, ...(updates.learnedFacts || [])])),
  };

  const filePath = getMemoryPath(projectId);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
};

export const formatMemoryForContext = async (projectId) => {
  const memory = await getProjectMemory(projectId);
  if (!memory) return "";

  const sections = [];

  if (memory.userRules.length > 0) {
    sections.push(
      "### Aturan & Preferensi Pengguna\n" +
        memory.userRules.map((r) => `- ${r}`).join("\n"),
    );
  }

  if (memory.architectureNotes.length > 0) {
    sections.push(
      "### Catatan Arsitektur & Struktur Proyek\n" +
        memory.architectureNotes.map((n) => `- ${n}`).join("\n"),
    );
  }

  if (memory.keyDecisions.length > 0) {
    sections.push(
      "### Keputusan Penting Tersimpan\n" +
        memory.keyDecisions.map((d) => `- ${d}`).join("\n"),
    );
  }

  if (memory.learnedFacts.length > 0) {
    sections.push(
      "### Fakta & Pengetahuan Terpelajari\n" +
        memory.learnedFacts.map((f) => `- ${f}`).join("\n"),
    );
  }

  if (sections.length === 0) return "";

  return `## Project Memory & Learned Context\n${sections.join("\n\n")}`;
};

export const autoExtractMemoryFromConversation = async (
  projectId,
  userText,
  aiReply,
) => {
  if (!projectId || !userText) return;
  const lower = userText.toLowerCase();

  const updates = {
    userRules: [],
    architectureNotes: [],
    keyDecisions: [],
    learnedFacts: [],
  };

  // Detect user preference rules (e.g. "mulai sekarang", "ingat bahwa", "standar di proyek ini")
  if (
    lower.includes("ingat") ||
    lower.includes("mulai sekarang") ||
    lower.includes("standar") ||
    lower.includes("aturan") ||
    lower.includes("gunakan selalu")
  ) {
    updates.userRules.push(userText.trim());
  }

  // Detect architectural decisions
  if (
    lower.includes("arsitektur") ||
    lower.includes("database") ||
    lower.includes("framework") ||
    lower.includes("modul")
  ) {
    updates.architectureNotes.push(`Fokus pengguna: ${userText.trim().slice(0, 150)}`);
  }

  if (
    updates.userRules.length > 0 ||
    updates.architectureNotes.length > 0 ||
    updates.keyDecisions.length > 0 ||
    updates.learnedFacts.length > 0
  ) {
    await updateProjectMemory(projectId, updates);
  }
};
