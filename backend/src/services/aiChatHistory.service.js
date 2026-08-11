import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const chatsDir = path.join(dataDir, "ai-chats");

const MAX_MESSAGES = 200;

const ensureDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(chatsDir)) {
    fs.mkdirSync(chatsDir, { recursive: true });
  }
};

export const safeChatFileName = (projectId) => {
  const safe = String(projectId || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${(safe || "unknown").slice(0, 180)}.json`;
};

const historyPath = (projectId) =>
  path.join(chatsDir, safeChatFileName(projectId));

const normalizeMessage = (item) => {
  if (!item || typeof item !== "object") return null;
  const role = item.role;
  if (role !== "user" && role !== "assistant") return null;
  const content = typeof item.content === "string" ? item.content.trim() : "";
  if (!content) return null;
  return {
    id:
      typeof item.id === "string" && item.id.trim()
        ? item.id.trim()
        : `${role[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    ts: Number.isFinite(Number(item.ts)) ? Number(item.ts) : Date.now(),
    steps: Array.isArray(item.steps) ? item.steps : undefined,
    modifiedFiles: Array.isArray(item.modifiedFiles) ? item.modifiedFiles : undefined,
    commandOutputs: Array.isArray(item.commandOutputs) ? item.commandOutputs : undefined,
  };
};

const normalizeMessages = (messages) => {
  if (!Array.isArray(messages)) return [];
  return messages.map(normalizeMessage).filter(Boolean).slice(-MAX_MESSAGES);
};

const generateTitleFromMessages = (messages = [], fallback = "New Chat") => {
  const userMsg = messages.find((m) => m && m.role === "user");
  if (!userMsg || !userMsg.content) return fallback;
  const line = userMsg.content.split("\n")[0].trim();
  if (!line) return fallback;
  return line.length > 32 ? `${line.slice(0, 32)}...` : line;
};

const loadProjectFile = (projectId) => {
  ensureDir();
  const id = String(projectId || "").trim();
  if (!id) return { projectId: "", activeSessionId: null, sessions: [] };

  const filePath = historyPath(id);
  if (!fs.existsSync(filePath)) {
    return { projectId: id, activeSessionId: null, sessions: [] };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);

    // Legacy format migration (if parsed.messages exists at top level)
    if (Array.isArray(parsed.messages)) {
      const defaultSess = {
        id: "sess-default",
        title: generateTitleFromMessages(parsed.messages, "Percakapan 1"),
        createdAt: Number(parsed.updatedAt) || Date.now(),
        updatedAt: Number(parsed.updatedAt) || Date.now(),
        messages: normalizeMessages(parsed.messages),
      };
      return {
        projectId: id,
        activeSessionId: "sess-default",
        sessions: [defaultSess],
      };
    }

    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map((s) => ({
          id: String(s.id || `sess-${Date.now()}`),
          title: String(s.title || "New Chat"),
          createdAt: Number(s.createdAt) || Date.now(),
          updatedAt: Number(s.updatedAt) || Date.now(),
          messages: normalizeMessages(s.messages),
        }))
      : [];

    let activeSessionId = parsed.activeSessionId ? String(parsed.activeSessionId) : null;
    if (sessions.length > 0 && (!activeSessionId || !sessions.some((s) => s.id === activeSessionId))) {
      activeSessionId = sessions[0].id;
    }

    return {
      projectId: id,
      activeSessionId,
      sessions,
    };
  } catch {
    return { projectId: id, activeSessionId: null, sessions: [] };
  }
};

const saveProjectFile = (data) => {
  ensureDir();
  if (!data.projectId) return;
  fs.writeFileSync(
    historyPath(data.projectId),
    JSON.stringify(data, null, 2),
    "utf8"
  );
};

export const getProjectSessions = (projectId) => {
  const data = loadProjectFile(projectId);
  return {
    projectId: data.projectId,
    activeSessionId: data.activeSessionId,
    sessions: data.sessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
    })),
  };
};

export const createSession = (projectId, title) => {
  const data = loadProjectFile(projectId);
  const now = Date.now();
  const newSess = {
    id: `sess-${now}-${Math.random().toString(36).slice(2, 6)}`,
    title: title && title.trim() ? title.trim() : `Percakapan ${data.sessions.length + 1}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };

  data.sessions.unshift(newSess);
  data.activeSessionId = newSess.id;
  saveProjectFile(data);
  return {
    session: newSess,
    activeSessionId: data.activeSessionId,
  };
};

export const getChatHistory = (projectId, targetSessionId = null) => {
  const data = loadProjectFile(projectId);
  if (!data.projectId) {
    return { projectId: "", activeSessionId: null, sessionId: null, title: "", updatedAt: Date.now(), messages: [] };
  }

  // If no sessions, auto-create one
  if (data.sessions.length === 0) {
    const created = createSession(projectId, "Percakapan 1");
    return {
      projectId: data.projectId,
      activeSessionId: created.activeSessionId,
      sessionId: created.session.id,
      title: created.session.title,
      updatedAt: created.session.updatedAt,
      messages: [],
    };
  }

  const sid = targetSessionId || data.activeSessionId || data.sessions[0].id;
  let target = data.sessions.find((s) => s.id === sid);

  if (!target) {
    target = data.sessions[0];
  }

  data.activeSessionId = target.id;
  saveProjectFile(data);

  return {
    projectId: data.projectId,
    activeSessionId: data.activeSessionId,
    sessionId: target.id,
    title: target.title,
    updatedAt: target.updatedAt,
    messages: target.messages,
  };
};

export const saveChatHistory = (projectId, messages, targetSessionId = null) => {
  let data = loadProjectFile(projectId);
  if (!data.projectId) {
    throw Object.assign(new Error("projectId wajib diisi"), { status: 400 });
  }

  let sid = targetSessionId || data.activeSessionId;
  let target = data.sessions.find((s) => s.id === sid);

  if (!target) {
    createSession(projectId, "Percakapan 1");
    data = loadProjectFile(projectId);
    sid = data.activeSessionId;
    target = data.sessions.find((s) => s.id === sid);
  }

  const normalized = normalizeMessages(messages);
  target.messages = normalized;
  target.updatedAt = Date.now();

  // Auto-generate title if default title
  if (
    (target.title.startsWith("Percakapan ") || target.title === "New Chat") &&
    normalized.length > 0
  ) {
    target.title = generateTitleFromMessages(normalized, target.title);
  }

  data.activeSessionId = target.id;
  saveProjectFile(data);

  return {
    projectId: data.projectId,
    activeSessionId: data.activeSessionId,
    sessionId: target.id,
    title: target.title,
    updatedAt: target.updatedAt,
    messages: target.messages,
  };
};

export const appendChatMessages = (projectId, newMessages = [], targetSessionId = null) => {
  const current = getChatHistory(projectId, targetSessionId);
  const nextMessages = [
    ...current.messages,
    ...normalizeMessages(newMessages),
  ];
  return saveChatHistory(projectId, nextMessages, current.sessionId);
};

export const deleteSession = (projectId, sessionId) => {
  const data = loadProjectFile(projectId);
  if (!data.projectId) {
    throw Object.assign(new Error("projectId wajib diisi"), { status: 400 });
  }

  data.sessions = data.sessions.filter((s) => s.id !== sessionId);

  if (data.sessions.length === 0) {
    const created = createSession(projectId, "Percakapan 1");
    data.activeSessionId = created.session.id;
  } else if (data.activeSessionId === sessionId) {
    data.activeSessionId = data.sessions[0].id;
  }

  saveProjectFile(data);
  return getProjectSessions(projectId);
};

export const renameSession = (projectId, sessionId, newTitle) => {
  const data = loadProjectFile(projectId);
  if (!data.projectId) {
    throw Object.assign(new Error("projectId wajib diisi"), { status: 400 });
  }

  const target = data.sessions.find((s) => s.id === sessionId);
  if (target && newTitle && newTitle.trim()) {
    target.title = newTitle.trim();
    target.updatedAt = Date.now();
    saveProjectFile(data);
  }

  return getProjectSessions(projectId);
};

export const clearChatHistory = (projectId, targetSessionId = null) => {
  if (targetSessionId) {
    return saveChatHistory(projectId, [], targetSessionId);
  }
  ensureDir();
  const id = String(projectId || "").trim();
  if (!id) {
    throw Object.assign(new Error("projectId wajib diisi"), { status: 400 });
  }
  const filePath = historyPath(id);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return { projectId: id, activeSessionId: null, sessions: [] };
};
