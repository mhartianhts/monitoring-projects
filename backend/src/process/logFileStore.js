import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const logsDir = path.join(dataDir, "logs");

const sanitizeId = (projectId) =>
  String(projectId).replace(/[^a-zA-Z0-9._-]+/g, "_");

export const ensureLogDir = () => {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

export const getProjectLogPath = (projectId) =>
  path.join(logsDir, `${sanitizeId(projectId)}.log`);

export const truncateProjectLog = (projectId) => {
  ensureLogDir();
  try {
    fs.writeFileSync(getProjectLogPath(projectId), "", "utf8");
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EACCES" || err.code === "EPERM") {
      return;
    }
    throw err;
  }
};

export const appendProjectLog = (projectId, text) => {
  ensureLogDir();
  const chunk = String(text);
  const line = chunk.endsWith("\n") ? chunk : `${chunk}\n`;
  try {
    fs.appendFileSync(getProjectLogPath(projectId), line, "utf8");
  } catch (err) {
    if (err.code === "EBUSY" || err.code === "EACCES" || err.code === "EPERM") {
      // Abaikan transient file lock error di OS Windows ketika file sedang ditulis oleh proses lain
      return;
    }
    throw err;
  }
};

export const readProjectLogTail = (projectId, maxLines = 2000) => {
  const filePath = getProjectLogPath(projectId);
  if (!fs.existsSync(filePath)) return [];
  try {
    const content = fs.readFileSync(filePath, "utf8");
    if (!content) return [];
    const lines = content.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
};

export const clearProjectLog = (projectId) => {
  truncateProjectLog(projectId);
};

export const getLogFileSize = (projectId) => {
  const filePath = getProjectLogPath(projectId);
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
};

/**
 * Poll file untuk baris baru (aman untuk reattach / shell redirect).
 */
export class LogFileTailer {
  constructor(projectId, onChunk, { intervalMs = 400 } = {}) {
    this.projectId = projectId;
    this.filePath = getProjectLogPath(projectId);
    this.onChunk = onChunk;
    this.intervalMs = intervalMs;
    this.position = 0;
    this.pending = "";
    this.timer = null;
    this.reading = false;
  }

  start({ fromBeginning = false } = {}) {
    ensureLogDir();
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "", "utf8");
    }
    this.position = fromBeginning ? 0 : getLogFileSize(this.projectId);
    this.pending = "";
    this.stop();
    this.timer = setInterval(() => {
      void this.#poll();
    }, this.intervalMs);
    this.timer.unref?.();
    // baca segera sekali
    void this.#poll();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async #poll() {
    if (this.reading) return;
    this.reading = true;
    try {
      if (!fs.existsSync(this.filePath)) return;
      const stat = fs.statSync(this.filePath);
      if (stat.size < this.position) {
        // file di-truncate
        this.position = 0;
        this.pending = "";
      }
      if (stat.size === this.position) return;

      const length = stat.size - this.position;
      const fd = fs.openSync(this.filePath, "r");
      try {
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, this.position);
        this.position = stat.size;
        const text = this.pending + buffer.toString("utf8");
        const parts = text.split(/\r?\n/);
        this.pending = parts.pop() ?? "";
        if (parts.length > 0) {
          this.onChunk(`${parts.join("\n")}\n`);
        }
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // ignore transient read errors
    } finally {
      this.reading = false;
    }
  }
}

/** Bangun perintah start yang menulis stdout/stderr ke file log. */
export const buildRedirectedStartCommand = (startCmd, logFilePath) => {
  const normalized = path.resolve(logFilePath);
  const quoted = `"${normalized.replace(/"/g, '\\"')}"`;
  if (process.platform === "win32") {
    return `${startCmd} >> ${quoted} 2>&1`;
  }
  return `(${startCmd}) >> ${quoted} 2>&1`;
};
