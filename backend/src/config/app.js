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
  tokenportalApiKey: process.env.TOKENPORTAL_API_KEY || "",
  tokenportalBaseUrl: (
    process.env.TOKENPORTAL_BASE_URL || "https://api.tokenportal.id/v1"
  ).replace(/\/$/, ""),
  tokenportalModel: process.env.TOKENPORTAL_MODEL || "kimi-k27-code",
  tokenportalTimeoutMs: Number(process.env.TOKENPORTAL_TIMEOUT_MS || 60000),
  webhookSecret: (process.env.WEBHOOK_SECRET || "").trim(),
  webhookMaxInbox: Number(process.env.WEBHOOK_MAX_INBOX || 2000),
  webhookMediaTimeoutMs: Number(process.env.WEBHOOK_MEDIA_TIMEOUT_MS || 20000),
  webhookMaxMediaBytes: Number(
    process.env.WEBHOOK_MAX_MEDIA_BYTES || 50 * 1024 * 1024,
  ),
};
