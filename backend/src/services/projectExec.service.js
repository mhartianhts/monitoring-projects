import { exec } from "child_process";
import fs from "fs";

const FORBIDDEN_PATTERNS = [
  /\brm\s+-rf\s+[\/\\]/i,
  /\bformat\s+[a-z]:/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bdel\s+\/f\s+\/s\s+\/q\s+c:\\/i,
];

export const runProjectCommand = async (projectPath, command, timeoutMs = 60000) => {
  if (!command || typeof command !== "string" || !command.trim()) {
    throw Object.assign(new Error("Parameter command wajib diisi"), { status: 400 });
  }

  const cleanCommand = command.trim();

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(cleanCommand)) {
      throw Object.assign(
        new Error(`Eksekusi command '${cleanCommand}' diblokir karena berpotensi berbahaya`),
        { status: 403 }
      );
    }
  }

  if (!fs.existsSync(projectPath)) {
    throw Object.assign(new Error(`Direktori project tidak ditemukan: ${projectPath}`), {
      status: 404,
    });
  }

  const startTime = Date.now();

  return new Promise((resolve) => {
    exec(
      cleanCommand,
      {
        cwd: projectPath,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024, // 2MB
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        resolve({
          command: cleanCommand,
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: error ? error.code ?? 1 : 0,
          error: error ? error.message : null,
          durationMs,
        });
      }
    );
  });
};
