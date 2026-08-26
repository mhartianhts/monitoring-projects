import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const storePath = path.join(dataDir, "telegram-bots.json");

export const DEFAULT_BUILTIN_COMMANDS = [
  {
    command: "help",
    description: "Tampilkan bantuan & daftar perintah",
    actionType: "built-in",
    action: "help",
  },
  {
    command: "status",
    description: "Cek status & resource semua project",
    actionType: "built-in",
    action: "status",
  },
  {
    command: "start",
    description: "Jalankan project (/start <project_id> atau /start all)",
    actionType: "built-in",
    action: "start",
  },
  {
    command: "stop",
    description: "Hentikan project (/stop <project_id> atau /stop all)",
    actionType: "built-in",
    action: "stop",
  },
  {
    command: "restart",
    description: "Restart project (/restart <project_id>)",
    actionType: "built-in",
    action: "restart",
  },
  {
    command: "logs",
    description: "Lihat log terakhir project (/logs <project_id>)",
    actionType: "built-in",
    action: "logs",
  },
];

const ensureStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify([], null, 2), "utf8");
  }
};

export const readTelegramBots = () => {
  ensureStore();
  try {
    const raw = fs.readFileSync(storePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("[telegramStore] Gagal membaca telegram-bots.json:", error);
    return [];
  }
};

export const saveTelegramBots = (bots) => {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(bots, null, 2), "utf8");
};

export const findTelegramBot = (id) => {
  const bots = readTelegramBots();
  return bots.find((b) => b.id === id) || null;
};

export const createTelegramBot = (data) => {
  const bots = readTelegramBots();
  const newBot = {
    id: `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: data.name?.trim() || "Telegram Bot",
    token: data.token?.trim() || "",
    username: data.username || "",
    botInfo: data.botInfo || null,
    defaultChatId: data.defaultChatId ? String(data.defaultChatId).trim() : "",
    allowedChatIds: Array.isArray(data.allowedChatIds)
      ? data.allowedChatIds.map((id) => String(id).trim()).filter(Boolean)
      : data.defaultChatId
      ? [String(data.defaultChatId).trim()]
      : [],
    enabled: data.enabled !== undefined ? Boolean(data.enabled) : true,
    pollingEnabled: data.pollingEnabled !== undefined ? Boolean(data.pollingEnabled) : true,
    notifyOnCrash: data.notifyOnCrash !== undefined ? Boolean(data.notifyOnCrash) : true,
    notifyOnRestart: data.notifyOnRestart !== undefined ? Boolean(data.notifyOnRestart) : false,
    commands: Array.isArray(data.commands) && data.commands.length > 0
      ? data.commands
      : [...DEFAULT_BUILTIN_COMMANDS],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  bots.push(newBot);
  saveTelegramBots(bots);
  return newBot;
};

export const updateTelegramBot = (id, updates) => {
  const bots = readTelegramBots();
  const index = bots.findIndex((b) => b.id === id);
  if (index === -1) {
    throw new Error(`Bot dengan ID "${id}" tidak ditemukan`);
  }

  const current = bots[index];
  const updated = {
    ...current,
    ...updates,
    id: current.id, // ID tidak boleh diganti
    commands: Array.isArray(updates.commands) ? updates.commands : current.commands,
    allowedChatIds: Array.isArray(updates.allowedChatIds)
      ? updates.allowedChatIds.map((id) => String(id).trim()).filter(Boolean)
      : current.allowedChatIds,
    updatedAt: new Date().toISOString(),
  };

  bots[index] = updated;
  saveTelegramBots(bots);
  return updated;
};

export const deleteTelegramBot = (id) => {
  const bots = readTelegramBots();
  const filtered = bots.filter((b) => b.id !== id);
  if (filtered.length === bots.length) {
    throw new Error(`Bot dengan ID "${id}" tidak ditemukan`);
  }
  saveTelegramBots(filtered);
  return true;
};

export const addOrUpdateBotCommand = (botId, commandPayload) => {
  const bots = readTelegramBots();
  const index = bots.findIndex((b) => b.id === botId);
  if (index === -1) {
    throw new Error(`Bot dengan ID "${botId}" tidak ditemukan`);
  }

  const bot = bots[index];
  const cleanCmd = (commandPayload.command || "").replace(/^\//, "").trim().toLowerCase();
  if (!cleanCmd) {
    throw new Error("Nama command tidak boleh kosong");
  }

  const existingIndex = bot.commands.findIndex((c) => c.command.toLowerCase() === cleanCmd);
  const newCommand = {
    command: cleanCmd,
    description: commandPayload.description?.trim() || cleanCmd,
    actionType: commandPayload.actionType || "built-in", // 'built-in' | 'project_action' | 'custom_response' | 'exec'
    action: commandPayload.action || cleanCmd, // e.g. 'start', 'stop', 'restart', 'status', 'custom'
    targetProjectId: commandPayload.targetProjectId || null,
    customResponse: commandPayload.customResponse || "",
    execCommand: commandPayload.execCommand || "",
  };

  if (existingIndex !== -1) {
    bot.commands[existingIndex] = newCommand;
  } else {
    bot.commands.push(newCommand);
  }

  bot.updatedAt = new Date().toISOString();
  bots[index] = bot;
  saveTelegramBots(bots);
  return bot;
};

export const deleteBotCommand = (botId, commandName) => {
  const bots = readTelegramBots();
  const index = bots.findIndex((b) => b.id === botId);
  if (index === -1) {
    throw new Error(`Bot dengan ID "${botId}" tidak ditemukan`);
  }

  const bot = bots[index];
  const cleanCmd = (commandName || "").replace(/^\//, "").trim().toLowerCase();
  bot.commands = (bot.commands || []).filter((c) => c.command.toLowerCase() !== cleanCmd);
  bot.updatedAt = new Date().toISOString();
  bots[index] = bot;
  saveTelegramBots(bots);
  return bot;
};
