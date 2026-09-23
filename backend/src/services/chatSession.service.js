import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const sessionsDir = path.join(dataDir, "chat-sessions");

const ensureDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
};

export const safeSessionId = (id) => {
  const safe = String(id || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || `session-${Date.now()}`;
};

const getSessionPath = (id) => {
  return path.join(sessionsDir, `${safeSessionId(id)}.json`);
};

export const listChatSessions = async () => {
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
          title: data.title || "Obrolan Tanpa Judul",
          model: data.model || "deepseek-v4-flash",
          messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
          totalTokens: Number(data.totalTokens || 0),
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
      } catch {
        // Abaikan file JSON korup/rusak
      }
    }

    // Urutkan dari yang terbaru diperbarui
    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } catch {
    return [];
  }
};

export const getChatSession = async (sessionId) => {
  if (!sessionId) return null;
  ensureDir();
  const filePath = getSessionPath(sessionId);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    return {
      id: data.id || safeSessionId(sessionId),
      title: data.title || "Obrolan Tanpa Judul",
      model: data.model || "deepseek-v4-flash",
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
      totalTokens: Number(data.totalTokens || 0),
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
  } catch (err) {
    throw new Error(`Gagal membaca session chat: ${err.message}`);
  }
};

export const saveChatSession = async (session) => {
  if (!session || !session.id) {
    throw new Error("Session tidak valid");
  }
  ensureDir();

  const id = safeSessionId(session.id);
  const filePath = getSessionPath(id);

  const payload = {
    id,
    title: session.title || "Obrolan Baru",
    model: session.model || "deepseek-v4-flash",
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalTokens: Number(session.totalTokens || 0),
    messages: Array.isArray(session.messages) ? session.messages : [],
  };

  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
  return payload;
};

export const createChatSession = async ({ title = "Obrolan Baru", model = "deepseek-v4-flash" } = {}) => {
  ensureDir();
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const session = {
    id,
    title: String(title).trim() || "Obrolan Baru",
    model: String(model).trim() || "deepseek-v4-flash",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalTokens: 0,
    messages: [],
  };

  return saveChatSession(session);
};

export const deleteChatSession = async (sessionId) => {
  if (!sessionId) return false;
  ensureDir();
  const filePath = getSessionPath(sessionId);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    return true;
  }
  return false;
};

export const appendMessageToSession = async (sessionId, message, stats = null) => {
  let session = await getChatSession(sessionId);
  if (!session) {
    session = await createChatSession({
      title: message.role === "user" ? (message.content.slice(0, 45).trim() || "Obrolan Baru") : "Obrolan Baru",
      model: message.model || "deepseek-v4-flash",
    });
  }

  // Jika judul masih default dan ada pesan dari user, auto update judulnya
  if (
    (session.title === "Obrolan Baru" || session.title === "Obrolan Tanpa Judul") &&
    message.role === "user" &&
    message.content
  ) {
    session.title = message.content.slice(0, 50).trim().replace(/[\r\n]+/g, " ");
  }

  session.messages.push({
    id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp || new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    model: message.model || session.model,
    stats: stats || message.stats || null,
    createdAt: new Date().toISOString(),
  });

  if (stats?.totalTokens) {
    session.totalTokens = Number(session.totalTokens || 0) + Number(stats.totalTokens);
  }

  session.updatedAt = new Date().toISOString();
  await saveChatSession(session);
  return session;
};
