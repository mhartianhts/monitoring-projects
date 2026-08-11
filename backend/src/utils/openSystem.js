import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EDITOR_DEFS = [
  {
    id: "cursor",
    label: "Cursor",
    commands: ["cursor"],
    winPaths: [
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "cursor",
        "Cursor.exe",
      ),
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "cursor",
        "resources",
        "app",
        "bin",
        "cursor.cmd",
      ),
    ],
  },
  {
    id: "code",
    label: "VS Code",
    commands: ["code"],
    winPaths: [
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Microsoft VS Code",
        "Code.exe",
      ),
      path.join(
        process.env.ProgramFiles || "",
        "Microsoft VS Code",
        "Code.exe",
      ),
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Microsoft VS Code",
        "bin",
        "code.cmd",
      ),
    ],
  },
  {
    id: "antigravity",
    label: "Antigravity IDE",
    commands: ["antigravity-ide", "agy", "antigravity"],
    winPaths: [
      // Prefer Antigravity IDE (VS Code–based install)
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Antigravity IDE",
        "Antigravity IDE.exe",
      ),
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Antigravity IDE",
        "bin",
        "antigravity-ide.cmd",
      ),
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Antigravity IDE",
        "Antigravity.exe",
      ),
      // Fallback: older/non-IDE Antigravity build
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Antigravity",
        "Antigravity.exe",
      ),
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Google",
        "Antigravity",
        "Antigravity.exe",
      ),
    ],
  },
];

let editorsCache = null;
let editorsCacheAt = 0;
const CACHE_MS = 60_000;

const fileExists = (filePath) => {
  try {
    return Boolean(filePath) && fs.existsSync(filePath);
  } catch {
    return false;
  }
};

/** Prefer .exe / .cmd over extensionless shims from `where`. */
const normalizeWindowsCommand = (candidate) => {
  if (!candidate) return null;
  if (fileExists(candidate) && /\.(exe|cmd|bat)$/i.test(candidate)) {
    return candidate;
  }

  const withCmd = `${candidate}.cmd`;
  if (fileExists(withCmd)) return withCmd;

  const withBat = `${candidate}.bat`;
  if (fileExists(withBat)) return withBat;

  const withExe = `${candidate}.exe`;
  if (fileExists(withExe)) return withExe;

  // Sibling .cmd next to extensionless shim (e.g. ...\bin\code → code.cmd)
  const siblingCmd = path.join(
    path.dirname(candidate),
    `${path.basename(candidate)}.cmd`,
  );
  if (fileExists(siblingCmd)) return siblingCmd;

  if (fileExists(candidate)) return candidate;
  return null;
};

const resolveFromPath = async (command) => {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("where.exe", [command], {
        windowsHide: true,
      });
      const candidates = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const candidate of candidates) {
        const normalized = normalizeWindowsCommand(candidate);
        if (normalized) return normalized;
      }
      return null;
    }
    const { stdout } = await execFileAsync("which", [command]);
    const first = stdout.trim().split(/\r?\n/).find(Boolean);
    return first || null;
  } catch {
    return null;
  }
};

const resolveEditor = async (def) => {
  // Windows: prefer real .exe/.cmd install paths first (more reliable than PATH shims)
  if (process.platform === "win32") {
    for (const candidate of def.winPaths) {
      if (fileExists(candidate)) {
        return {
          id: def.id,
          label: def.label,
          command: candidate,
          available: true,
        };
      }
    }
  }

  for (const command of def.commands) {
    const resolved = await resolveFromPath(command);
    if (resolved) {
      return {
        id: def.id,
        label: def.label,
        command: resolved,
        available: true,
      };
    }
  }

  return {
    id: def.id,
    label: def.label,
    command: null,
    available: false,
  };
};

export const detectEditors = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && editorsCache && now - editorsCacheAt < CACHE_MS) {
    return editorsCache;
  }

  const editors = [];
  for (const def of EDITOR_DEFS) {
    editors.push(await resolveEditor(def));
  }

  editorsCache = editors;
  editorsCacheAt = now;
  return editors;
};

const spawnDetached = (command, args, { shell = false } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell,
      windowsHide: true,
    });

    let settled = false;
    const finishOk = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const finishErr = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    // Spawn failures emit 'error'; success usually emits 'spawn' quickly.
    child.once("error", finishErr);
    child.once("spawn", finishOk);
    // Fallback if neither fires promptly
    setTimeout(finishOk, 250).unref?.();
    child.unref();
  });

export const openFolder = (folderPath) => {
  if (process.platform === "win32") {
    spawn("explorer.exe", [folderPath], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [folderPath], { detached: true, stdio: "ignore" }).unref();
};

export const openBrowser = (url) => {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      shell: false,
    }).unref();
    return;
  }
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
};

export const openInEditor = async (editorId, folderPath) => {
  // Always re-resolve so we don't keep a bad cached shim path
  const editors = await detectEditors({ force: true });
  const editor = editors.find((item) => item.id === editorId && item.available);
  if (!editor?.command) {
    throw Object.assign(
      new Error(
        `Editor "${editorId}" tidak tersedia. Install CLI/app-nya atau refresh daftar editor.`,
      ),
      { status: 400 },
    );
  }

  let command = editor.command;
  if (process.platform === "win32") {
    command = normalizeWindowsCommand(command) || command;
  }

  const isWinScript =
    process.platform === "win32" && /\.(cmd|bat)$/i.test(command);
  const isWinExe = process.platform === "win32" && /\.exe$/i.test(command);

  try {
    if (isWinScript) {
      await spawnDetached(command, [folderPath], { shell: true });
    } else if (isWinExe || process.platform !== "win32") {
      await spawnDetached(command, [folderPath], { shell: false });
    } else {
      // Extensionless Windows shim — run via cmd
      await spawnDetached("cmd.exe", ["/c", command, folderPath], {
        shell: false,
      });
    }
  } catch (error) {
    throw Object.assign(
      new Error(
        `Gagal membuka ${editor.label}: ${error.message || "spawn failed"}`,
      ),
      { status: 500 },
    );
  }

  return {
    opened: true,
    editor: { id: editor.id, label: editor.label },
    path: folderPath,
    command,
  };
};
