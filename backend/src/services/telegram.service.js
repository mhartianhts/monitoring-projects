import {
  readTelegramBots,
  findTelegramBot,
  updateTelegramBot,
} from "./telegramStore.service.js";
import { discoverProjects, findProject } from "./projectDiscovery.service.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

export class TelegramService {
  constructor({ processManager, io } = {}) {
    this.processManager = processManager;
    this.io = io;
    /** Map botId -> { abortController, offset, status, lastActive, lastError, username } */
    this.activePollers = new Map();
    this.recentLogs = [];
  }

  logActivity(botId, type, details) {
    const entry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      botId,
      type, // 'command' | 'message' | 'alert' | 'error' | 'system'
      details,
      timestamp: new Date().toISOString(),
    };
    this.recentLogs.unshift(entry);
    if (this.recentLogs.length > 100) {
      this.recentLogs.pop();
    }
    this.io?.emit("telegram:activity", entry);
  }

  getRecentLogs() {
    return this.recentLogs;
  }

  /**
   * Panggil API Telegram menggunakan native fetch
   */
  async callApi(token, method, payload = {}, signal = null) {
    if (!token) throw new Error("Bot Token Telegram tidak boleh kosong");
    const url = `${TELEGRAM_API_BASE}/bot${token}/${method}`;
    const options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
    if (signal) {
      options.signal = signal;
    }

    const response = await fetch(url, options);
    const result = await response.json();

    if (!result.ok) {
      const desc = result.description || `HTTP ${response.status}`;
      throw new Error(`Telegram API Error [${result.error_code || response.status}]: ${desc}`);
    }

    return result.result;
  }

  /**
   * Cek informasi bot (getMe)
   */
  async getMe(token) {
    return this.callApi(token, "getMe");
  }

  /**
   * Kirim pesan teks ke chat_id tertentu
   */
  async sendMessage(token, chatId, text, options = {}) {
    if (!token || !chatId) {
      throw new Error("Token dan Chat ID wajib diisi");
    }
    const payload = {
      chat_id: chatId,
      text: String(text),
      parse_mode: options.parse_mode || "Markdown",
      disable_web_page_preview: options.disable_web_page_preview ?? true,
    };
    return this.callApi(token, "sendMessage", payload);
  }

  /**
   * Tes koneksi bot dan kirim pesan ping
   */
  async testBot(token, chatId) {
    const me = await this.getMe(token);
    let messageSent = false;
    let messageError = null;

    if (chatId) {
      try {
        const text =
          `⚡ *Local PM Monitor — Test Connection*\n\n` +
          `✅ Bot: *@${me.username}* (${me.first_name})\n` +
          `🕒 Waktu: \`${new Date().toLocaleString("id-ID")}\`\n` +
          `🚀 Sistem monitoring terhubung dengan sukses!`;

        await this.sendMessage(token, chatId, text);
        messageSent = true;
      } catch (err) {
        messageError = err.message;
      }
    }

    return {
      success: true,
      bot: {
        id: me.id,
        name: me.first_name,
        username: me.username,
      },
      messageSent,
      messageError,
    };
  }

  /**
   * Sinkronisasi command bot ke menu Telegram (setMyCommands)
   */
  async syncBotCommands(botId) {
    const bot = findTelegramBot(botId);
    if (!bot) throw new Error("Bot tidak ditemukan");
    if (!bot.token) throw new Error("Bot belum memiliki token");

    const commands = (bot.commands || [])
      .filter((c) => c.command && c.description)
      .map((c) => ({
        command: c.command.toLowerCase().replace(/[^a-z0-9_]/g, ""),
        description: c.description.slice(0, 256),
      }));

    if (commands.length === 0) {
      throw new Error("Tidak ada command valid untuk didaftarkan");
    }

    await this.callApi(bot.token, "setMyCommands", { commands });
    this.logActivity(botId, "system", `Commands disinkronisasi ke Telegram (@${bot.username || bot.name})`);
    return { success: true, count: commands.length };
  }

  /**
   * Broadcast pesan ke semua bot aktif
   */
  async broadcastMessage(text, options = {}) {
    const bots = readTelegramBots().filter((b) => b.enabled && b.token && b.defaultChatId);
    const results = [];

    for (const bot of bots) {
      try {
        await this.sendMessage(bot.token, bot.defaultChatId, text, options);
        results.push({ botId: bot.id, success: true });
        this.logActivity(bot.id, "alert", `Broadcast terkirim ke chat ID ${bot.defaultChatId}`);
      } catch (err) {
        results.push({ botId: bot.id, success: false, error: err.message });
      }
    }

    return results;
  }

  /**
   * Jalankan Polling untuk satu bot
   */
  async startBotPolling(bot) {
    if (!bot || !bot.enabled || !bot.pollingEnabled || !bot.token) {
      return;
    }

    this.stopBotPolling(bot.id);

    const abortController = new AbortController();
    const pollerState = {
      abortController,
      offset: 0,
      status: "starting",
      lastActive: new Date().toISOString(),
      lastError: null,
      username: bot.username || "",
    };

    this.activePollers.set(bot.id, pollerState);

    // Ambil info username bot terlebih dahulu
    try {
      const me = await this.getMe(bot.token);
      pollerState.username = me.username;
      if (bot.username !== me.username) {
        updateTelegramBot(bot.id, { username: me.username, botInfo: me });
      }
      pollerState.status = "listening";
      this.logActivity(bot.id, "system", `Bot @${me.username} mulai mendengarkan perintah (Polling aktif)`);
    } catch (err) {
      pollerState.status = "error";
      pollerState.lastError = err.message;
      this.logActivity(bot.id, "error", `Gagal memulai bot: ${err.message}`);
      return;
    }

    // Polling Loop
    (async () => {
      while (!abortController.signal.aborted) {
        try {
          const updates = await this.callApi(
            bot.token,
            "getUpdates",
            {
              offset: pollerState.offset,
              timeout: 20,
              allowed_updates: ["message"],
            },
            abortController.signal
          );

          if (abortController.signal.aborted) break;

          pollerState.lastActive = new Date().toISOString();
          pollerState.status = "listening";

          if (Array.isArray(updates) && updates.length > 0) {
            for (const update of updates) {
              pollerState.offset = update.update_id + 1;
              if (update.message) {
                await this.handleIncomingMessage(bot, update.message);
              }
            }
          }
        } catch (err) {
          if (abortController.signal.aborted) break;
          pollerState.status = "error";
          pollerState.lastError = err.message;
          // Tunggu sebentar sebelum reconnect jika ada network error
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    })();
  }

  /**
   * Hentikan polling bot
   */
  stopBotPolling(botId) {
    const existing = this.activePollers.get(botId);
    if (existing) {
      existing.abortController.abort();
      existing.status = "stopped";
      this.activePollers.delete(botId);
      this.logActivity(botId, "system", `Bot polling dihentikan`);
    }
  }

  /**
   * Inisialisasi semua bot yang tersimpan saat server start
   */
  async initAllBots() {
    const bots = readTelegramBots();
    for (const bot of bots) {
      if (bot.enabled && bot.pollingEnabled && bot.token) {
        await this.startBotPolling(bot);
      }
    }
  }

  /**
   * Hentikan semua polling (misal saat shutdown)
   */
  stopAllBots() {
    for (const [botId] of this.activePollers) {
      this.stopBotPolling(botId);
    }
  }

  /**
   * Dapatkan status runtime semua bot
   */
  getBotsRuntimeStatus() {
    const bots = readTelegramBots();
    return bots.map((bot) => {
      const runtime = this.activePollers.get(bot.id);
      return {
        ...bot,
        runtimeStatus: runtime ? runtime.status : "inactive",
        lastActive: runtime ? runtime.lastActive : null,
        lastError: runtime ? runtime.lastError : null,
        username: runtime?.username || bot.username || "",
      };
    });
  }

  /**
   * Proses Pesan Masuk dari Pengguna Telegram
   */
  async handleIncomingMessage(bot, message) {
    const chatId = String(message.chat?.id || "");
    const text = (message.text || "").trim();
    const senderName = message.from?.first_name || message.from?.username || "User";

    if (!text) return;

    this.logActivity(bot.id, "message", `Pesan dari ${senderName} (${chatId}): "${text}"`);

    // Whitelist Chat ID Authorization Check
    const allowed = Array.isArray(bot.allowedChatIds) && bot.allowedChatIds.length > 0;
    if (allowed && !bot.allowedChatIds.includes(chatId)) {
      const rejectMsg =
        `⛔ *Akses Ditolak*\n\n` +
        `ID Telegram Anda: \`${chatId}\`\n` +
        `Anda belum terdaftar di whitelist bot ini. Silakan masukkan Chat ID ini di pengaturan dashboard monitoring.`;
      try {
        await this.sendMessage(bot.token, chatId, rejectMsg);
      } catch (_) {}
      this.logActivity(bot.id, "alert", `Akses ditolak untuk chat ID ${chatId}`);
      return;
    }

    // Jika bukan command (tidak berawalan '/')
    if (!text.startsWith("/")) {
      return;
    }

    // Parse command: "/restart_all extra params" -> cmd = "restart_all", args = ["extra", "params"]
    const parts = text.slice(1).split(/\s+/);
    // Handle bot username suffix in command (e.g. /status@MyBot)
    const rawCmd = parts[0].split("@")[0].toLowerCase();
    const args = parts.slice(1);

    this.logActivity(bot.id, "command", `Eksekusi command: /${rawCmd} [${args.join(" ")}]`);

    try {
      await this.executeCommand(bot, chatId, rawCmd, args, { sendToChat: true });
    } catch (err) {
      await this.sendMessage(
        bot.token,
        chatId,
        `❌ *Error saat menjalankan command:* \`${err.message}\``
      );
      this.logActivity(bot.id, "error", `Error command /${rawCmd}: ${err.message}`);
    }
  }

  /**
   * Jalankan dan Uji Command dari Dashboard (Simulasi / Direct Run)
   */
  async testRunCommand(botId, rawCommandText, { sendToChat = false, customChatId = null } = {}) {
    const bot = findTelegramBot(botId);
    if (!bot) throw new Error("Bot tidak ditemukan");

    const text = (rawCommandText || "").trim();
    if (!text) throw new Error("Perintah tidak boleh kosong");

    const cleanText = text.startsWith("/") ? text.slice(1) : text;
    const parts = cleanText.split(/\s+/);
    const rawCmd = parts[0].split("@")[0].toLowerCase();
    const args = parts.slice(1);

    const targetChatId = customChatId || bot.defaultChatId || null;

    this.logActivity(
      bot.id,
      "command",
      `Dashboard test run: /${rawCmd} [${args.join(" ")}] (SendToChat: ${sendToChat && !!targetChatId})`
    );

    const result = await this.executeCommand(bot, targetChatId, rawCmd, args, {
      sendToChat: Boolean(sendToChat && targetChatId),
    });

    return {
      success: true,
      bot: { id: bot.id, name: bot.name, username: bot.username },
      command: rawCmd,
      args,
      output: result.replyText,
      sentToTelegram: result.messageSent,
      targetChatId,
    };
  }

  /**
   * Eksekusi Perintah (Built-in & Custom Commands)
   */
  async executeCommand(bot, chatId, cmd, args, { sendToChat = true } = {}) {
    let replyText = "";

    // 1. Cek apakah ada custom command mapping
    const customCmd = (bot.commands || []).find(
      (c) => c.command.toLowerCase() === cmd
    );

    // Default: Help Command
    if (cmd === "help" || cmd === "start_bot") {
      replyText = this.buildHelpText(bot);
    }
    // Built-in: Status
    else if (cmd === "status") {
      replyText = await this.buildStatusText();
    }
    // Built-in: Start
    else if (cmd === "start" || (customCmd && customCmd.action === "start")) {
      const targetId = customCmd?.targetProjectId || args[0];
      replyText = await this.execStartProject(targetId);
    }
    // Built-in: Stop
    else if (cmd === "stop" || (customCmd && customCmd.action === "stop")) {
      const targetId = customCmd?.targetProjectId || args[0];
      replyText = await this.execStopProject(targetId);
    }
    // Built-in: Restart
    else if (cmd === "restart" || (customCmd && customCmd.action === "restart")) {
      const targetId = customCmd?.targetProjectId || args[0];
      replyText = await this.execRestartProject(targetId);
    }
    // Built-in: Logs
    else if (cmd === "logs" || (customCmd && customCmd.action === "logs")) {
      const targetId = customCmd?.targetProjectId || args[0];
      replyText = this.execGetLogs(targetId);
    }
    // Custom Response Action
    else if (customCmd && customCmd.actionType === "custom_response") {
      let reply = customCmd.customResponse || "Command berhasil dieksekusi.";
      reply = reply
        .replace(/{date}/g, new Date().toLocaleDateString("id-ID"))
        .replace(/{time}/g, new Date().toLocaleTimeString("id-ID"))
        .replace(/{uptime}/g, `${Math.floor(process.uptime())}s`);
      replyText = reply;
    }
    // Custom Project Action (e.g. shortcut /start_backend)
    else if (customCmd && customCmd.actionType === "project_action") {
      const targetId = customCmd.targetProjectId;
      if (!targetId) {
        replyText = `⚠️ Target project belum ditentukan untuk command ini.`;
      } else if (customCmd.action === "stop") {
        replyText = await this.execStopProject(targetId);
      } else if (customCmd.action === "restart") {
        replyText = await this.execRestartProject(targetId);
      } else {
        replyText = await this.execStartProject(targetId);
      }
    }
    // Unknown command
    else {
      replyText = `❓ *Perintah tidak dikenali:* \`/${cmd}\`\nKetik /help untuk melihat daftar perintah yang tersedia.`;
    }

    let messageSent = false;
    if (sendToChat && chatId && bot.token) {
      try {
        await this.sendMessage(bot.token, chatId, replyText);
        messageSent = true;
      } catch (err) {
        this.logActivity(bot.id, "error", `Gagal kirim pesan command /${cmd}: ${err.message}`);
      }
    }

    return {
      success: true,
      command: cmd,
      replyText,
      messageSent,
    };
  }

  /**
   * Helper Builders untuk Response Text
   */
  buildHelpText(bot) {
    const cmdList = (bot.commands || [])
      .map((c) => `• \`/${c.command}\` — ${c.description}`)
      .join("\n");

    return (
      `🤖 *Bantuan Bot Monitoring: ${bot.name}*\n\n` +
      `*Daftar Perintah Tersedia:*\n` +
      `${cmdList || "Belum ada perintah terdaftar."}\n\n` +
      `💡 *Tips:* Gunakan \`/status\` untuk melihat kondisi server & project secara berkala.`
    );
  }

  async buildStatusText() {
    if (!this.processManager) {
      return "⚠️ Process Manager belum terhubung.";
    }

    await this.processManager.reconcileAll();
    const projects = discoverProjects().map((p) => this.processManager.enrichProject(p));

    const running = projects.filter((p) => p.status === "running");
    const stopped = projects.filter((p) => p.status === "stopped");

    let text =
      `📊 *STATUS MONITORING PROJEK*\n` +
      `🕒 \`${new Date().toLocaleString("id-ID")}\`\n\n` +
      `🟢 *Berjalan (${running.length}):*\n`;

    if (running.length === 0) {
      text += `_Tidak ada projek yang sedang berjalan_\n`;
    } else {
      running.forEach((p) => {
        const portStr = p.port ? `:${p.port}` : "";
        const cpuStr = p.stats?.cpu !== undefined ? ` • CPU: ${p.stats.cpu}%` : "";
        const memStr = p.stats?.memory !== undefined ? ` • RAM: ${Math.round(p.stats.memory)}MB` : "";
        text += `• *${p.name}* (\`${p.id}\`)${portStr}${cpuStr}${memStr}\n`;
      });
    }

    text += `\n🔴 *Berhenti (${stopped.length}):*\n`;
    if (stopped.length === 0) {
      text += `_Semua projek aktif_\n`;
    } else {
      stopped.slice(0, 10).forEach((p) => {
        text += `• ${p.name} (\`${p.id}\`)\n`;
      });
      if (stopped.length > 10) {
        text += `_...dan ${stopped.length - 10} projek lainnya_\n`;
      }
    }

    return text;
  }

  async execStartProject(targetId) {
    if (!this.processManager) return "⚠️ Process Manager belum terhubung.";
    if (!targetId || targetId === "all") {
      if (targetId === "all") {
        await this.processManager.startAll();
        return `🚀 *Semua project sedang dijalankan...*`;
      }
      return `⚠️ Sertakan ID project: \`/start <project_id>\` atau \`/start all\``;
    }

    const project = findProject(targetId);
    if (!project) {
      return `❌ Project dengan ID \`${targetId}\` tidak ditemukan.`;
    }

    await this.processManager.start(targetId);
    return `🚀 Berhasil memulai project *${project.name}* (\`${targetId}\`)`;
  }

  async execStopProject(targetId) {
    if (!this.processManager) return "⚠️ Process Manager belum terhubung.";
    if (!targetId || targetId === "all") {
      if (targetId === "all") {
        await this.processManager.stopAll();
        return `🛑 *Semua project sedang dihentikan...*`;
      }
      return `⚠️ Sertakan ID project: \`/stop <project_id>\` atau \`/stop all\``;
    }

    const project = findProject(targetId);
    if (!project) {
      return `❌ Project dengan ID \`${targetId}\` tidak ditemukan.`;
    }

    await this.processManager.stop(targetId);
    return `🛑 Berhasil menghentikan project *${project.name}* (\`${targetId}\`)`;
  }

  async execRestartProject(targetId) {
    if (!this.processManager) return "⚠️ Process Manager belum terhubung.";
    if (!targetId || targetId === "all") {
      if (targetId === "all") {
        await this.processManager.restartAll();
        return `🔄 *Semua project sedang di-restart...*`;
      }
      return `⚠️ Sertakan ID project: \`/restart <project_id>\` atau \`/restart all\``;
    }

    const project = findProject(targetId);
    if (!project) {
      return `❌ Project dengan ID \`${targetId}\` tidak ditemukan.`;
    }

    await this.processManager.restart(targetId);
    return `🔄 Berhasil me-restart project *${project.name}* (\`${targetId}\`)`;
  }

  execGetLogs(targetId) {
    if (!this.processManager) return "⚠️ Process Manager belum terhubung.";
    if (!targetId) {
      return `⚠️ Sertakan ID project: \`/logs <project_id>\``;
    }

    const project = findProject(targetId);
    if (!project) {
      return `❌ Project dengan ID \`${targetId}\` tidak ditemukan.`;
    }

    const logs = this.processManager.getLogs(targetId, 15);
    if (!logs || logs.length === 0) {
      return `📄 Log kosong untuk project *${project.name}*.`;
    }

    const logText = logs
      .map((l) => (typeof l === "string" ? l : l.message || JSON.stringify(l)))
      .join("\n")
      .slice(-3500);

    return `📄 *15 Log Terakhir [${project.name}]:*\n\`\`\`\n${logText}\n\`\`\``;
  }
}

