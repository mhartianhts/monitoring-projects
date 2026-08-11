import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const appConfig = {
  port: Number(process.env.PORT || 7171),
  projectsRoot: process.env.PROJECTS_ROOT || "D:\\mhartian\\project",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "http://localhost:7070",
  statsIntervalMs: Number(process.env.STATS_INTERVAL_MS || 2000),
  logBufferSize: Number(process.env.LOG_BUFFER_SIZE || 2000),
  codexCliPath: process.env.CODEX_CLI_PATH || "",
  codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 120000),
  ollamaBaseUrl: (
    process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"
  ).replace(/\/$/, ""),
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5-coder:7b",
  ollamaTimeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 0),
};
