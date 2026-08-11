import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { appConfig } from "../config/app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "../../data/ai-workspace");

const resolveCodexEntry = () => {
  if (appConfig.codexCliPath) return appConfig.codexCliPath;

  const candidates = [
    path.join(
      process.env.APPDATA || "",
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    ),
    path.join(
      process.env.LOCALAPPDATA || "",
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    ),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  return null;
};

const ensureWorkspace = () => {
  fs.mkdirSync(workspaceRoot, { recursive: true });
  return workspaceRoot;
};

const buildHint = (message = "") => {
  const lower = String(message).toLowerCase();
  if (
    lower.includes("not logged") ||
    lower.includes("login") ||
    lower.includes("unauthorized")
  ) {
    return "Jalankan `codex login` di terminal, pilih Sign in with ChatGPT.";
  }
  if (lower.includes("enoent") || lower.includes("not found")) {
    return "Codex CLI tidak ditemukan. Install: npm i -g @openai/codex";
  }
  if (lower.includes("timeout")) {
    return "Codex lama merespons. Coba lagi atau naikkan CODEX_TIMEOUT_MS.";
  }
  return "Pastikan Codex CLI terpasang dan sudah `codex login` (ChatGPT).";
};

const extractReplyFromStdout = (stdout = "") => {
  const text = String(stdout);
  const marker = "\ncodex\n";
  const idx = text.lastIndexOf(marker);
  if (idx >= 0) {
    const after = text.slice(idx + marker.length);
    const tokensIdx = after.search(/\ntokens used\n/i);
    const reply = (tokensIdx >= 0 ? after.slice(0, tokensIdx) : after).trim();
    if (reply) return reply;
  }
  return "";
};

export const getCodexCliStatus = async () => {
  const entry = resolveCodexEntry();
  return {
    available: Boolean(entry),
    entry,
    timeoutMs: appConfig.codexTimeoutMs,
    hint: entry
      ? "Codex CLI terdeteksi. Chat memakai `codex exec` + login ChatGPT."
      : "Codex CLI tidak ditemukan. Set CODEX_CLI_PATH atau install @openai/codex.",
  };
};

export const chatWithCodexCli = ({ message }) => {
  const prompt = String(message || "").trim();
  if (!prompt) {
    const error = new Error("Pesan tidak boleh kosong");
    error.status = 400;
    throw error;
  }

  const entry = resolveCodexEntry();
  const cwd = ensureWorkspace();
  const timeoutMs = appConfig.codexTimeoutMs;
  const outputFile = path.join(
    os.tmpdir(),
    `codex-chat-${process.pid}-${Date.now()}.txt`,
  );

  const chatPrompt = [
    "You are a helpful assistant in a local project manager dashboard chat.",
    "Answer the user directly. Do not edit files or run shell tools unless absolutely required to answer.",
    "Keep the reply concise unless the user asks for detail.",
    "",
    `User message: ${prompt}`,
  ].join("\n");

  const baseArgs = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "-C",
    cwd,
    "-s",
    "read-only",
    "--color",
    "never",
    "-o",
    outputFile,
    chatPrompt,
  ];

  const command = entry
    ? process.execPath
    : process.platform === "win32"
      ? "codex.cmd"
      : "codex";
  const args = entry ? [entry, ...baseArgs] : baseArgs;
  const useShell = !entry;

  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const cleanup = () => {
      try {
        fs.unlinkSync(outputFile);
      } catch {
        // ignore
      }
    };

    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
      windowsHide: true,
      shell: useShell,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      cleanup();
      const error = new Error(
        `Codex CLI timeout setelah ${Math.round(timeoutMs / 1000)}s`,
      );
      error.status = 504;
      error.hint = buildHint(error.message);
      reject(error);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      const error = new Error(
        err.code === "ENOENT"
          ? "Codex CLI tidak ditemukan. Install: npm i -g @openai/codex"
          : err.message || "Gagal menjalankan Codex CLI",
      );
      error.status = 503;
      error.hint = buildHint(error.message);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      let reply = "";
      try {
        if (fs.existsSync(outputFile)) {
          reply = fs.readFileSync(outputFile, "utf8").trim();
        }
      } catch {
        reply = "";
      }
      cleanup();

      if (!reply) {
        reply = extractReplyFromStdout(stdout);
      }

      if (reply && (code === 0 || code === null)) {
        resolve({ reply, stats: null });
        return;
      }

      const combined = `${stderr}\n${stdout}`.trim();
      const error = new Error(
        combined || `Codex CLI gagal (exit code ${code ?? "unknown"})`,
      );
      error.status = 502;
      error.hint = buildHint(combined);
      error.details = { code, stderr: stderr.trim(), stdout: stdout.trim() };
      reject(error);
    });
  });
};
