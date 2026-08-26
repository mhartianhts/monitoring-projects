import {
  readTelegramBots,
  findTelegramBot,
  createTelegramBot,
  updateTelegramBot,
  deleteTelegramBot,
  addOrUpdateBotCommand,
  deleteBotCommand,
} from "../services/telegramStore.service.js";
import { ok, fail } from "../utils/response.js";

export const createTelegramController = (telegramService) => {
  const listBots = async (_req, res) => {
    try {
      const bots = telegramService.getBotsRuntimeStatus();
      return ok(res, bots);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getBot = async (req, res) => {
    try {
      const bot = findTelegramBot(req.params.id);
      if (!bot) return fail(res, "Bot tidak ditemukan", 404);
      const runtime = telegramService.activePollers.get(bot.id);
      return ok(res, {
        ...bot,
        runtimeStatus: runtime ? runtime.status : "inactive",
        lastActive: runtime ? runtime.lastActive : null,
        lastError: runtime ? runtime.lastError : null,
      });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const createBot = async (req, res) => {
    try {
      const { name, token, defaultChatId, allowedChatIds, pollingEnabled, enabled } = req.body;
      if (!token) {
        return fail(res, "Telegram Bot Token wajib diisi", 400);
      }

      // Validasi token via Telegram API
      let botInfo = null;
      try {
        botInfo = await telegramService.getMe(token);
      } catch (err) {
        return fail(res, `Bot Token tidak valid: ${err.message}`, 400);
      }

      const bot = createTelegramBot({
        name: name || botInfo.first_name || "Telegram Bot",
        token,
        username: botInfo.username,
        botInfo,
        defaultChatId,
        allowedChatIds,
        pollingEnabled,
        enabled,
      });

      if (bot.enabled && bot.pollingEnabled) {
        await telegramService.startBotPolling(bot);
      }

      return ok(res, bot, 201);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const updateBot = async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (updates.token) {
        try {
          const botInfo = await telegramService.getMe(updates.token);
          updates.username = botInfo.username;
          updates.botInfo = botInfo;
        } catch (err) {
          return fail(res, `Bot Token tidak valid: ${err.message}`, 400);
        }
      }

      const updatedBot = updateTelegramBot(id, updates);

      // Re-apply polling state
      telegramService.stopBotPolling(id);
      if (updatedBot.enabled && updatedBot.pollingEnabled) {
        await telegramService.startBotPolling(updatedBot);
      }

      return ok(res, updatedBot);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const deleteBot = async (req, res) => {
    try {
      const { id } = req.params;
      telegramService.stopBotPolling(id);
      deleteTelegramBot(id);
      return ok(res, { deleted: true, id });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const testBot = async (req, res) => {
    try {
      const { token, chatId } = req.body;
      const botId = req.params.id;

      let effectiveToken = token;
      let effectiveChatId = chatId;

      if (botId) {
        const bot = findTelegramBot(botId);
        if (!bot) return fail(res, "Bot tidak ditemukan", 404);
        effectiveToken = effectiveToken || bot.token;
        effectiveChatId = effectiveChatId || bot.defaultChatId;
      }

      if (!effectiveToken) {
        return fail(res, "Bot Token wajib disertakan", 400);
      }

      const result = await telegramService.testBot(effectiveToken, effectiveChatId);
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 400);
    }
  };

  const toggleBot = async (req, res) => {
    try {
      const { id } = req.params;
      const bot = findTelegramBot(id);
      if (!bot) return fail(res, "Bot tidak ditemukan", 404);

      const nextPolling = !bot.pollingEnabled;
      const updated = updateTelegramBot(id, { pollingEnabled: nextPolling });

      if (nextPolling && updated.enabled) {
        await telegramService.startBotPolling(updated);
      } else {
        telegramService.stopBotPolling(id);
      }

      return ok(res, {
        id,
        pollingEnabled: nextPolling,
        runtimeStatus: nextPolling ? "listening" : "stopped",
      });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const syncCommands = async (req, res) => {
    try {
      const { id } = req.params;
      const result = await telegramService.syncBotCommands(id);
      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 400);
    }
  };

  const addOrUpdateCommand = async (req, res) => {
    try {
      const { id } = req.params;
      const updatedBot = addOrUpdateBotCommand(id, req.body);
      return ok(res, updatedBot);
    } catch (error) {
      return fail(res, error.message, 400);
    }
  };

  const deleteCommand = async (req, res) => {
    try {
      const { id, command } = req.params;
      const updatedBot = deleteBotCommand(id, command);
      return ok(res, updatedBot);
    } catch (error) {
      return fail(res, error.message, 400);
    }
  };

  const sendManualMessage = async (req, res) => {
    try {
      const { botId, chatId, message, parseMode } = req.body;
      if (!message) return fail(res, "Pesan tidak boleh kosong", 400);

      if (botId) {
        const bot = findTelegramBot(botId);
        if (!bot) return fail(res, "Bot tidak ditemukan", 404);
        const targetChatId = chatId || bot.defaultChatId;
        if (!targetChatId) return fail(res, "Chat ID tujuan belum dispesifikasi", 400);

        const result = await telegramService.sendMessage(bot.token, targetChatId, message, {
          parse_mode: parseMode || "Markdown",
        });
        telegramService.logActivity(bot.id, "message", `Pesan manual dikirim ke ${targetChatId}`);
        return ok(res, { success: true, result });
      }

      // Broadcast jika botId tidak ditentukan
      const broadcastResults = await telegramService.broadcastMessage(message, {
        parse_mode: parseMode || "Markdown",
      });
      return ok(res, { success: true, results: broadcastResults });
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const getActivityLogs = async (_req, res) => {
    try {
      const logs = telegramService.getRecentLogs();
      return ok(res, logs);
    } catch (error) {
      return fail(res, error.message, 500);
    }
  };

  const runCommand = async (req, res) => {
    try {
      const { id } = req.params;
      const { command, sendToChat, chatId } = req.body;
      if (!command) return fail(res, "Perintah (command) tidak boleh kosong", 400);

      const result = await telegramService.testRunCommand(id, command, {
        sendToChat: Boolean(sendToChat),
        customChatId: chatId,
      });

      return ok(res, result);
    } catch (error) {
      return fail(res, error.message, 400);
    }
  };

  return {
    listBots,
    getBot,
    createBot,
    updateBot,
    deleteBot,
    testBot,
    toggleBot,
    syncCommands,
    addOrUpdateCommand,
    deleteCommand,
    sendManualMessage,
    getActivityLogs,
    runCommand,
  };
};

