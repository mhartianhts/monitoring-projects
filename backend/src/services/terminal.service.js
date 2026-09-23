import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import treeKill from "tree-kill";
import { appConfig } from "../config/app.js";

const require = createRequire(import.meta.url);
const pty = require("node-pty");

export class TerminalService {
  constructor({ io } = {}) {
    this.io = io;
    this.sessions = new Map();
  }

  setIo(io) {
    this.io = io;
  }

  resolveShell(requestedShell) {
    const isWindows = os.platform() === "win32";
    if (isWindows) {
      if (requestedShell === "cmd") {
        return {
          bin: process.env.COMSPEC || "cmd.exe",
          args: [],
        };
      }
      // Default to powershell
      return {
        bin: "powershell.exe",
        args: ["-NoLogo"],
      };
    }
    return {
      bin: process.env.SHELL || "/bin/bash",
      args: [],
    };
  }

  resolveCwd(requestedCwd, projectId) {
    const defaultRoot = appConfig.projectsRoot || process.cwd();

    if (projectId) {
      const projectPath = path.resolve(defaultRoot, projectId);
      if (fs.existsSync(projectPath)) {
        return projectPath;
      }
    }

    if (requestedCwd && typeof requestedCwd === "string") {
      const resolved = path.resolve(requestedCwd);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }

    if (fs.existsSync(defaultRoot)) {
      return defaultRoot;
    }

    return process.cwd();
  }

  createSession({
    id,
    cwd,
    projectId = null,
    shell = "powershell",
    cols = 120,
    rows = 30,
  } = {}) {
    const sessionId = id || `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    // If session with this ID already exists, return existing
    if (this.sessions.has(sessionId)) {
      return this.getSessionInfo(sessionId);
    }

    const { bin, args } = this.resolveShell(shell);
    const resolvedCwd = this.resolveCwd(cwd, projectId);

    const isWindows = os.platform() === "win32";
    const initialCols = Math.max(10, Math.min(500, Number(cols) || 120));
    const initialRows = Math.max(5, Math.min(200, Number(rows) || 30));

    const ptyProcess = pty.spawn(bin, args, {
      name: "xterm-256color",
      cols: initialCols,
      rows: initialRows,
      cwd: resolvedCwd,
      useConpty: isWindows,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });

    const sessionData = {
      id: sessionId,
      ptyProcess,
      pid: ptyProcess.pid,
      cwd: resolvedCwd,
      shell,
      projectId,
      createdAt: new Date().toISOString(),
      history: [],
      historyBytes: 0,
      maxHistoryBytes: 1024 * 1024, // 1 MB buffer
    };

    ptyProcess.onData((data) => {
      // Keep generous buffer for reconnects and page refresh
      sessionData.history.push(data);
      sessionData.historyBytes += data.length;
      while (
        sessionData.history.length > 3000 ||
        sessionData.historyBytes > sessionData.maxHistoryBytes
      ) {
        const removed = sessionData.history.shift();
        sessionData.historyBytes -= removed ? removed.length : 0;
      }

      if (this.io) {
        this.io.to(`terminal:${sessionId}`).emit("terminal:output", {
          sessionId,
          data,
        });
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[terminal] Session ${sessionId} (PID ${ptyProcess.pid}) exited with code ${exitCode}`);
      if (this.io) {
        this.io.to(`terminal:${sessionId}`).emit("terminal:exit", {
          sessionId,
          exitCode,
          signal,
        });
      }
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, sessionData);
    console.log(`[terminal] Created session ${sessionId} in "${resolvedCwd}" (PID ${ptyProcess.pid})`);

    return this.getSessionInfo(sessionId);
  }

  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.ptyProcess) {
      return false;
    }
    session.ptyProcess.write(data);
    return true;
  }

  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.ptyProcess) {
      return false;
    }
    const safeCols = Math.max(10, Math.min(500, Number(cols) || 80));
    const safeRows = Math.max(5, Math.min(200, Number(rows) || 24));
    try {
      session.ptyProcess.resize(safeCols, safeRows);
      return true;
    } catch (err) {
      console.warn(`[terminal] Resize error on session ${sessionId}:`, err.message);
      return false;
    }
  }

  killSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    try {
      if (session.pid) {
        try {
          treeKill(session.pid, "SIGKILL");
        } catch {}
      }
      if (session.ptyProcess) {
        if (session.ptyProcess._socket) {
          try {
            session.ptyProcess._socket.unref();
            session.ptyProcess._socket.destroy();
          } catch {}
        }
        try {
          session.ptyProcess.kill();
        } catch {}
      }
    } catch (err) {
      console.warn(`[terminal] Kill error on session ${sessionId}:`, err.message);
    }
    this.sessions.delete(sessionId);
    return true;
  }

  killAll() {
    console.log(`[terminal] Terminating ${this.sessions.size} active terminal sessions...`);
    for (const [id, session] of this.sessions.entries()) {
      try {
        if (session.pid) {
          try {
            treeKill(session.pid, "SIGKILL");
          } catch {}
        }
        if (session.ptyProcess) {
          if (session.ptyProcess._socket) {
            try {
              session.ptyProcess._socket.unref();
              session.ptyProcess._socket.destroy();
            } catch {}
          }
          try {
            session.ptyProcess.kill();
          } catch {}
        }
      } catch (err) {
        // ignore
      }
    }
    this.sessions.clear();
  }

  getSessionInfo(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return null;
    return {
      id: s.id,
      pid: s.pid,
      cwd: s.cwd,
      shell: s.shell,
      projectId: s.projectId,
      createdAt: s.createdAt,
    };
  }

  getSessionHistory(sessionId) {
    const s = this.sessions.get(sessionId);
    return s ? s.history.join("") : "";
  }

  listSessions() {
    const list = [];
    for (const s of this.sessions.values()) {
      list.push({
        id: s.id,
        pid: s.pid,
        cwd: s.cwd,
        shell: s.shell,
        projectId: s.projectId,
        createdAt: s.createdAt,
      });
    }
    return list;
  }
}
