import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const sessionsDir = path.join(dataDir, "claude-sessions");

const ensureDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
};

export const safeClaudeSessionId = (id) => {
  const safe = String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || crypto.randomUUID();
};

const getSessionPath = (id) => {
  return path.join(sessionsDir, `${safeClaudeSessionId(id)}.json`);
};

export const listClaudeSessions = async () => {
  ensureDir();
  try {
    const files = await fs.promises.readdir(sessionsDir);
    const sessions = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const filePath = path.join(sessionsDir, file);
        const raw = await fs.promises.readFile(filePath, "utf-8");
        const data = JSON.parse(raw);

        sessions.push({
          id: data.id || file.replace(/\.json$/, ""),
          title: data.title || "Obrolan Claude",
          model: data.model || "default",
          mode: data.mode || "safe",
          projectId: data.projectId || null,
          projectPath: data.projectPath || null,
          messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
          totalCostUsd: Number(data.totalCostUsd || 0),
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      } catch {
        // Abaikan file rusak
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } catch {
    return [];
  }
};

export const getClaudeSession = async (sessionId) => {
  if (!sessionId) return null;
  ensureDir();
  const filePath = getSessionPath(sessionId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return {
      id: data.id || safeClaudeSessionId(sessionId),
      title: data.title || "Obrolan Claude",
      model: data.model || "default",
      mode: data.mode || "safe",
      projectId: data.projectId || null,
      projectPath: data.projectPath || null,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      totalCostUsd: Number(data.totalCostUsd || 0),
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch (err) {
    throw new Error(`Gagal membaca session Claude: ${err.message}`);
  }
};

export const saveClaudeSession = async (session) => {
  if (!session || !session.id) {
    throw new Error("Session tidak valid");
  }
  ensureDir();

  const id = safeClaudeSessionId(session.id);
  const filePath = getSessionPath(id);

  const payload = {
    id,
    title: session.title || "Obrolan Claude Baru",
    model: session.model || "default",
    mode: session.mode || "safe",
    projectId: session.projectId || null,
    projectPath: session.projectPath || null,
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalCostUsd: Number(session.totalCostUsd || 0),
    messages: Array.isArray(session.messages) ? session.messages : [],
  };

  await fs.promises.writeFile(
    filePath,
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
  return payload;
};

export const createClaudeSession = async ({
  title = "Obrolan Claude Baru",
  model = "default",
  projectId = null,
  projectPath = null,
  mode = "safe",
} = {}) => {
  ensureDir();
  const id = crypto.randomUUID();
  const session = {
    id,
    title: String(title).trim() || "Obrolan Claude Baru",
    model: String(model).trim() || "default",
    projectId: projectId || null,
    projectPath: projectPath || null,
    mode: mode || "safe",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalCostUsd: 0,
    messages: [],
  };

  return saveClaudeSession(session);
};

export const deleteClaudeSession = async (sessionId) => {
  if (!sessionId) return false;
  ensureDir();
  const filePath = getSessionPath(sessionId);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    return true;
  }
  return false;
};

export const appendClaudeMessage = async (
  sessionId,
  message,
  stats = null,
) => {
  let session = await getClaudeSession(sessionId);
  if (!session) {
    session = await createClaudeSession({
      title:
        message.role === "user"
          ? message.content.slice(0, 45).trim() || "Obrolan Claude Baru"
          : "Obrolan Claude Baru",
      model: message.model || "default",
    });
  }

  if (
    (session.title === "Obrolan Claude Baru" ||
      session.title === "Obrolan Claude") &&
    message.role === "user" &&
    message.content
  ) {
    session.title = message.content
      .slice(0, 50)
      .trim()
      .replace(/[\r\n]+/g, " ");
  }

  session.messages.push({
    id:
      message.id ||
      `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: message.role,
    content: message.content,
    timestamp:
      message.timestamp ||
      new Date().toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    model: message.model || session.model,
    stats: stats || message.stats || null,
    createdAt: new Date().toISOString(),
  });

  if (stats?.totalCostUsd) {
    session.totalCostUsd =
      Number(session.totalCostUsd || 0) + Number(stats.totalCostUsd);
  }

  session.updatedAt = new Date().toISOString();
  await saveClaudeSession(session);
  return session;
};
