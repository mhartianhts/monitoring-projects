import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import treeKill from "tree-kill";
import { appConfig } from "../config/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../../data/claude-workspace");

// Map aktif untuk melacak child process per session
const activeProcesses = new Map();

const ensureWorkspace = () => {
  if (!fs.existsSync(workspaceRoot)) {
    fs.mkdirSync(workspaceRoot, { recursive: true });
  }
  return workspaceRoot;
};

export const DEFAULT_GENERAL_SYSTEM_PROMPT =
  "Anda adalah Claude, asisten AI umum yang cerdas, ramah, dan serbaguna. Anda dapat menjawab dan berdiskusi secara luas tentang apa saja seperti chatbot pada umumnya — percakapan sehari-hari, brainstorming ide, penulisan artikel & pesan, penjelasan konsep umum & sains, analisis logika & matematika, hingga rekayasa perangkat lunak dan pemrograman. Jawablah secara terstruktur, ramah, padat, dan jelas dalam format Markdown yang rapi. Jangan mengomentari status repositori git, branch, atau uncommitted changes lokal kecuali jika diminta secara spesifik oleh pengguna.";

export const resolveClaudeExecutable = () => {
  if (appConfig.claudeCliPath && fs.existsSync(appConfig.claudeCliPath)) {
    return appConfig.claudeCliPath;
  }

  const isWindows = process.platform === "win32";
  if (isWindows) {
    const candidates = [
      path.join(process.env.APPDATA || "", "npm", "claude.cmd"),
      path.join(process.env.LOCALAPPDATA || "", "npm", "claude.cmd"),
      path.join(
        process.env.ProgramFiles || "C:\\Program Files",
        "nodejs",
        "claude.cmd",
      ),
    ];

    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
    return "claude.cmd";
  }

  return "claude";
};

export const getClaudeStatus = async () => {
  const binary = resolveClaudeExecutable();

  return new Promise((resolve) => {
    let resolved = false;
    const isWindows = process.platform === "win32";
    const command = isWindows ? "cmd.exe" : binary;
    const args = isWindows ? ["/c", binary, "--version"] : ["--version"];

    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      try {
        child.kill();
      } catch {}
      resolve({
        available: false,
        version: null,
        binary,
        error: "Timeout memeriksa Claude CLI",
      });
    }, 6000);

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
    });

    child.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);

      const verMatch = stdout.trim() || stderr.trim();
      const isAvailable = code === 0 || verMatch.includes("Claude Code");

      resolve({
        available: isAvailable,
        version: isAvailable ? verMatch.replace(/\r?\n.*/s, "").trim() : null,
        binary,
        models: [
          {
            id: "default",
            name: "Auto (Model Bawaan)",
            desc: "Gunakan model standar Claude Code (Sonnet / Opus)",
          },
          {
            id: "sonnet",
            name: "Claude 3.7 Sonnet",
            desc: "Paling seimbang, sangat cepat & cerdas dalam koding",
          },
          {
            id: "opus",
            name: "Claude 3 Opus",
            desc: "Penalaran sangat mendalam untuk arsitektur kompleks",
          },
          {
            id: "haiku",
            name: "Claude 3.5 Haiku",
            desc: "Ringan, respons instan & efisien",
          },
        ],
        hint: isAvailable
          ? "Claude Code CLI terhubung langsung ke laptop Anda."
          : "Claude Code CLI belum terdeteksi. Pastikan terpasang: npm i -g @anthropic-ai/claude-code",
      });
    });

    child.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve({
        available: false,
        version: null,
        binary,
        error: err.message,
        hint: "Gagal menjalankan Claude CLI. Pastikan Node.js & Claude CLI terinstal.",
      });
    });
  });
};

export const abortClaudeChat = (sessionId) => {
  if (!sessionId) return false;
  const child = activeProcesses.get(sessionId);
  if (child) {
    try {
      if (child.pid) {
        treeKill(child.pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
    } catch {}
    activeProcesses.delete(sessionId);
    return true;
  }
  return false;
};

export const streamChatWithClaudeCli = ({
  message,
  sessionId,
  isFollowUp = false,
  model = "default",
  projectPath = null,
  mode = "safe",
  systemPrompt = null,
  onChunk,
  onDone,
  onError,
}) => {
  const prompt = String(message || "").trim();
  if (!prompt) {
    throw new Error("Pesan tidak boleh kosong");
  }

  const binary = resolveClaudeExecutable();
  const timeoutMs = appConfig.claudeTimeoutMs || 180000;
  const isWindows = process.platform === "win32";

  // Tentukan CWD yang dipakai Claude
  let cwd = ensureWorkspace();
  if (projectPath && fs.existsSync(projectPath)) {
    cwd = projectPath;
  }

  // Siapkan argumen CLI Claude
  const cliArgs = ["-p", prompt];

  // Aktifkan --safe-mode agar bersih dari persona/rules lokal repo
  cliArgs.push("--safe-mode");

  // Terapkan system prompt umum
  const effectiveSystemPrompt =
    (systemPrompt && String(systemPrompt).trim()) ||
    DEFAULT_GENERAL_SYSTEM_PROMPT;
  cliArgs.push("--system-prompt", effectiveSystemPrompt);

  if (isFollowUp && sessionId) {
    cliArgs.push("--resume", sessionId);
  } else if (sessionId) {
    cliArgs.push("--session-id", sessionId);
  }

  cliArgs.push(
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  );

  if (model && model !== "default") {
    cliArgs.push("--model", model);
  }

  // Safe mode: matikan tools eksekusi agar Claude hanya menjawab murni tanpa sentuh file
  if (mode === "safe") {
    cliArgs.push("--tools", "");
  }

  const spawnCommand = isWindows ? "cmd.exe" : binary;
  const spawnArgs = isWindows ? ["/c", binary, ...cliArgs] : cliArgs;

  let settled = false;
  let stdoutBuffer = "";
  let stderrText = "";
  let fullAccumulatedText = "";
  let finalResultPayload = null;

  const child = spawn(spawnCommand, spawnArgs, {
    cwd,
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (sessionId) {
    activeProcesses.set(sessionId, child);
  }

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    if (sessionId) activeProcesses.delete(sessionId);
    try {
      if (child.pid) treeKill(child.pid, "SIGKILL");
      else child.kill();
    } catch {}
    const err = new Error(
      `Claude Code timeout setelah ${Math.round(timeoutMs / 1000)}s`,
    );
    err.status = 504;
    onError?.(err);
  }, timeoutMs);

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed);

        // Streaming text delta
        if (
          parsed.type === "stream_event" &&
          parsed.event?.type === "content_block_delta" &&
          typeof parsed.event?.delta?.text === "string"
        ) {
          const deltaText = parsed.event.delta.text;
          fullAccumulatedText += deltaText;
          onChunk?.(deltaText);
        }

        // Final result payload
        if (parsed.type === "result" || parsed.result) {
          finalResultPayload = parsed;
          if (parsed.result && !fullAccumulatedText) {
            fullAccumulatedText = parsed.result;
            onChunk?.(parsed.result);
          }
        }
      } catch {
        // Bukan baris JSON murni, abaikan
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    stderrText += chunk.toString("utf8");
  });

  child.on("error", (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (sessionId) activeProcesses.delete(sessionId);
    onError?.(err);
  });

  child.on("close", (code) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (sessionId) activeProcesses.delete(sessionId);

    // Proses sisa buffer jika ada
    if (stdoutBuffer.trim()) {
      try {
        const parsed = JSON.parse(stdoutBuffer.trim());
        if (parsed.type === "result" || parsed.result) {
          finalResultPayload = parsed;
          if (parsed.result && !fullAccumulatedText) {
            fullAccumulatedText = parsed.result;
            onChunk?.(parsed.result);
          }
        }
      } catch {}
    }

    const reply = (
      fullAccumulatedText ||
      finalResultPayload?.result ||
      ""
    ).trim();

    if (code === 0 || reply) {
      const stats = {
        durationMs: finalResultPayload?.duration_api_ms || null,
        totalCostUsd: finalResultPayload?.total_cost_usd || null,
        model:
          finalResultPayload?.modelUsage &&
          Object.keys(finalResultPayload.modelUsage)[0]
            ? Object.keys(finalResultPayload.modelUsage)[0]
            : model,
        usage: finalResultPayload?.usage || null,
      };

      onDone?.({
        reply,
        stats,
        sessionId: finalResultPayload?.session_id || sessionId,
      });
      return;
    }

    const combinedErr = stderrText.trim() || `Claude CLI keluar dengan exit code ${code}`;
    const err = new Error(combinedErr);
    err.status = 502;
    onError?.(err);
  });

  return {
    abort: () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (sessionId) activeProcesses.delete(sessionId);
      try {
        if (child.pid) treeKill(child.pid, "SIGKILL");
        else child.kill();
      } catch {}
    },
  };
};
