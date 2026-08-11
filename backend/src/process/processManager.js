import { spawn } from "node:child_process";
import path from "node:path";
import kill from "tree-kill";
import {
  discoverProjects,
  findProject,
} from "../services/projectDiscovery.service.js";
import { isFavorite } from "../services/preferences.service.js";
import {
  clearRuntimeStore,
  isPidAlive,
  readRuntimeStore,
  removeRuntimeEntry,
  saveRuntimeEntry,
} from "../services/runtimeStore.service.js";
import {
  findPidByPort,
  isPortListening,
} from "../services/portProbe.service.js";
import {
  appendProjectLog,
  buildRedirectedStartCommand,
  clearProjectLog,
  getProjectLogPath,
  LogFileTailer,
  readProjectLogTail,
  truncateProjectLog,
} from "./logFileStore.js";
import { LogBuffer } from "./logBuffer.js";
import { StatsMonitor } from "./statsMonitor.js";
import { appConfig } from "../config/app.js";

const STOP_TIMEOUT_MS = 10000;
const AUTO_RESTART_MAX = 3;
const AUTO_RESTART_DELAY_MS = 2000;
const AUTO_RESTART_STABLE_MS = 30000;
const ORPHAN_POLL_MS = 3000;
const RECONCILE_DEBOUNCE_MS = 1000;

/** Env vars milik dashboard — jangan diwariskan ke child project. */
const DASHBOARD_ENV_KEYS = [
  "PORT",
  "FRONTEND_ORIGIN",
  "PROJECTS_ROOT",
  "STATS_INTERVAL_MS",
  "LOG_BUFFER_SIZE",
];

export class ProcessManager {
  constructor({ io }) {
    this.io = io;
    this.processes = new Map();
    this.crashCounts = new Map();
    this.restartTimers = new Map();
    this.orphanTimers = new Map();
    this.stoppedProjects = new Set();
    this.reconcileInflight = null;
    this.lastReconcileAt = 0;
    this.logTailers = new Map();
    this.logBuffer = new LogBuffer(appConfig.logBufferSize);
    this.statsMonitor = new StatsMonitor({
      intervalMs: appConfig.statsIntervalMs,
      onStats: (stats) => {
        this.io?.emit("project:stats", stats);
        const runtime = this.processes.get(stats.projectId);
        if (runtime) {
          runtime.stats = {
            cpu: stats.cpu,
            memory: stats.memory,
            uptime: stats.uptime,
          };
        }
      },
    });
    this.statsMonitor.start();
  }

  #buildChildEnv(project) {
    const env = {
      ...process.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      CLICOLOR: "0",
      PYTHON_COLORS: "0",
    };
    for (const key of DASHBOARD_ENV_KEYS) {
      delete env[key];
    }
    // CRA / Vite / Express baca PORT dari env parent sebelum .env project.
    // Set dari project.config.json agar port project dipakai.
    if (project.port != null && Number.isFinite(Number(project.port))) {
      env.PORT = String(project.port);
    }
    return env;
  }

  getRuntime(projectId) {
    return this.processes.get(projectId) || null;
  }

  getLogs(projectId, limit = 500) {
    this.#hydrateLogs(projectId);
    return this.logBuffer.get(projectId, limit);
  }

  clearLogs(projectId) {
    this.logBuffer.clear(projectId);
    clearProjectLog(projectId);
    // reset tailer offset supaya tidak membaca ulang isi lama
    const tailer = this.logTailers.get(projectId);
    if (tailer) {
      tailer.start({ fromBeginning: false });
    }
    this.io?.emit("log:clear", { projectId });
  }

  #stopLogTail(projectId) {
    const tailer = this.logTailers.get(projectId);
    if (!tailer) return;
    tailer.stop();
    this.logTailers.delete(projectId);
  }

  #startLogTail(projectId, { fromBeginning = false } = {}) {
    this.#stopLogTail(projectId);
    const tailer = new LogFileTailer(projectId, (chunk) => {
      this.#appendLog(projectId, chunk, "stdout", { persist: false });
    });
    this.logTailers.set(projectId, tailer);
    tailer.start({ fromBeginning });
  }

  #hydrateLogs(projectId) {
    const existing = this.logBuffer.get(projectId, 1);
    if (existing.length > 0) return;
    const lines = readProjectLogTail(projectId, appConfig.logBufferSize);
    for (const line of lines) {
      const stream = line.includes("[dashboard]") ? "system" : "stdout";
      this.logBuffer.append(projectId, line, stream);
    }
  }

  enrichProject(project) {
    const runtime = this.processes.get(project.id);
    return {
      ...project,
      favorite: isFavorite(project.id),
      status: runtime ? "running" : "stopped",
      pid: runtime?.pid ?? null,
      stats: runtime?.stats || { cpu: 0, memory: 0, uptime: 0 },
    };
  }

  #projectPort(project) {
    if (project?.port == null) return null;
    const port = Number(project.port);
    return Number.isFinite(port) && port > 0 ? port : null;
  }

  #adoptRuntime(project, pid, { reason, startedAt } = {}) {
    if (this.processes.has(project.id)) {
      return this.processes.get(project.id);
    }

    const alivePid = pid && isPidAlive(pid) ? Number(pid) : null;
    const started = Number(startedAt) || Date.now();
    const runtime = {
      pid: alivePid,
      child: null,
      startedAt: started,
      project,
      stats: { cpu: 0, memory: 0, uptime: 0 },
      stopping: false,
      reattached: true,
    };

    this.processes.set(project.id, runtime);
    if (alivePid) {
      this.statsMonitor.track(project.id, alivePid, started);
      this.#watchOrphan(project.id, alivePid);
    } else {
      this.#watchPortOnly(project.id);
    }
    this.#persistRuntime(project.id, runtime);
    this.#hydrateLogs(project.id);
    this.#emitStatus(project.id, "running", alivePid);
    this.#appendLog(
      project.id,
      `[dashboard] ${reason || "reattached managed process"}`,
      "system",
      { persist: true },
    );
    // Tail setelah system line di-persist supaya tidak dobel
    this.#startLogTail(project.id, { fromBeginning: false });
    return runtime;
  }

  async #resolveLivePid(project, preferredPid = null) {
    if (preferredPid && isPidAlive(preferredPid)) {
      return Number(preferredPid);
    }
    const port = this.#projectPort(project);
    if (!port)
      return preferredPid && isPidAlive(preferredPid) ? preferredPid : null;
    if (!(await isPortListening(port))) return null;
    const fromPort = await findPidByPort(port);
    if (fromPort && isPidAlive(fromPort)) return fromPort;
    return fromPort || null;
  }

  async reconcileProject(projectOrId) {
    const project =
      typeof projectOrId === "string" ? findProject(projectOrId) : projectOrId;
    if (!project) return null;
    // Sudah tracked → bukan recovery baru (penting untuk hitungan reconcileAll)
    if (this.processes.has(project.id)) return null;
    // Sengaja di-stop oleh user → jangan auto-reconcile
    if (this.stoppedProjects.has(project.id)) return null;

    const port = this.#projectPort(project);
    if (!port) return null;
    if (!(await isPortListening(port))) return null;

    const pid = await findPidByPort(port);
    return this.#adoptRuntime(project, pid, {
      reason: `recovered via port ${port}${pid ? ` (PID ${pid})` : ""}`,
    });
  }

  async reconcileAll({ force = false } = {}) {
    const now = Date.now();
    if (
      !force &&
      this.lastReconcileAt &&
      now - this.lastReconcileAt < RECONCILE_DEBOUNCE_MS &&
      !this.reconcileInflight
    ) {
      return 0;
    }
    if (this.reconcileInflight) {
      return this.reconcileInflight;
    }

    this.reconcileInflight = (async () => {
      const projects = discoverProjects().filter(
        (p) => p.hasConfig && this.#projectPort(p),
      );
      const results = await Promise.all(
        projects.map((project) => this.reconcileProject(project)),
      );
      const recovered = results.filter(Boolean).length;
      if (recovered > 0) {
        console.log(`[lpm] recovered ${recovered} process(es) via port`);
      }
      this.lastReconcileAt = Date.now();
      return recovered;
    })().finally(() => {
      this.reconcileInflight = null;
    });

    return this.reconcileInflight;
  }

  #emitStatus(projectId, status, pid = null) {
    this.io?.emit("project:status", { projectId, status, pid });
  }

  #appendLog(projectId, chunk, stream, { persist = false } = {}) {
    const text = chunk.toString();
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (line === "" && i === lines.length - 1) continue;
      if (persist) {
        appendProjectLog(projectId, line);
      }
      const entry = this.logBuffer.append(projectId, line, stream);
      this.io?.emit("log:line", {
        projectId,
        line: entry.line,
        stream: entry.stream,
        ts: entry.ts,
      });
    }
  }

  #persistRuntime(projectId, runtime) {
    saveRuntimeEntry(projectId, {
      pid: runtime.pid,
      startedAt: runtime.startedAt,
      start: runtime.project?.start,
      type: runtime.project?.type,
      path: runtime.project?.path,
      port: runtime.project?.port ?? null,
    });
  }

  #clearRestartTimer(projectId) {
    const timer = this.restartTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.restartTimers.delete(projectId);
    }
  }

  #clearOrphanTimer(projectId) {
    const timer = this.orphanTimers.get(projectId);
    if (timer) {
      clearInterval(timer);
      this.orphanTimers.delete(projectId);
    }
  }

  #handleExit(projectId, child, { code = null, signal = null } = {}) {
    void this.#onProcessGone(projectId, child, { code, signal });
  }

  #finalizeStopped(
    projectId,
    {
      code = null,
      signal = null,
      wasStopping = false,
      processStartedAt = Date.now(),
    } = {},
  ) {
    this.#clearOrphanTimer(projectId);
    this.#stopLogTail(projectId);
    this.processes.delete(projectId);
    this.statsMonitor.untrack(projectId);
    removeRuntimeEntry(projectId);
    this.#appendLog(
      projectId,
      `[dashboard] exited code=${code ?? "null"} signal=${signal ?? "null"}`,
      "system",
      { persist: true },
    );
    this.#emitStatus(projectId, "stopped", null);

    if (!wasStopping && !this.stoppedProjects.has(projectId)) {
      this.#scheduleAutoRestart(projectId, processStartedAt);
    } else {
      this.crashCounts.delete(projectId);
    }
  }

  async #retargetToPort(projectId, runtime) {
    const port = this.#projectPort(runtime.project);
    if (!port) return false;
    if (!(await isPortListening(port))) return false;

    const newPid = await findPidByPort(port);
    runtime.child = null;
    runtime.reattached = true;
    runtime.pid = newPid && isPidAlive(newPid) ? newPid : runtime.pid;

    this.statsMonitor.untrack(projectId);
    if (runtime.pid && isPidAlive(runtime.pid)) {
      this.statsMonitor.track(projectId, runtime.pid, runtime.startedAt);
      this.#watchOrphan(projectId, runtime.pid);
    } else {
      this.#watchPortOnly(projectId);
    }
    this.#persistRuntime(projectId, runtime);
    this.#emitStatus(projectId, "running", runtime.pid);
    if (!this.logTailers.has(projectId)) {
      this.#startLogTail(projectId, { fromBeginning: false });
    }
    this.#appendLog(
      projectId,
      `[dashboard] spawn/PID hilang tapi port ${port} masih listen — tetap running${
        runtime.pid ? ` (PID ${runtime.pid})` : ""
      }`,
      "system",
      { persist: true },
    );
    return true;
  }

  async #onProcessGone(projectId, child, { code = null, signal = null } = {}) {
    const current = this.processes.get(projectId);
    if (!current) return;
    if (child && current.child && current.child !== child) return;

    const wasStopping = current.stopping;
    const processStartedAt = current.startedAt;

    if (!wasStopping) {
      const kept = await this.#retargetToPort(projectId, current);
      if (kept) return;
    }

    this.#finalizeStopped(projectId, {
      code,
      signal,
      wasStopping,
      processStartedAt,
    });
  }

  #watchOrphan(projectId, pid) {
    this.#clearOrphanTimer(projectId);
    const timer = setInterval(() => {
      void (async () => {
        if (isPidAlive(pid)) return;
        const runtime = this.processes.get(projectId);
        if (!runtime || runtime.stopping) return;
        if (runtime.pid !== pid) return;

        const kept = await this.#retargetToPort(projectId, runtime);
        if (kept) return;
        await this.#onProcessGone(projectId, null, {
          code: null,
          signal: null,
        });
      })();
    }, ORPHAN_POLL_MS);
    timer.unref?.();
    this.orphanTimers.set(projectId, timer);
  }

  /** Port masih listen tapi PID belum diketahui / tidak valid. */
  #watchPortOnly(projectId) {
    this.#clearOrphanTimer(projectId);
    const timer = setInterval(() => {
      void (async () => {
        const runtime = this.processes.get(projectId);
        if (!runtime || runtime.stopping) return;

        const port = this.#projectPort(runtime.project);
        if (!port) {
          await this.#onProcessGone(projectId, null, {
            code: null,
            signal: null,
          });
          return;
        }

        if (!(await isPortListening(port))) {
          await this.#onProcessGone(projectId, null, {
            code: null,
            signal: null,
          });
          return;
        }

        const newPid = await findPidByPort(port);
        if (newPid && isPidAlive(newPid) && newPid !== runtime.pid) {
          runtime.pid = newPid;
          this.statsMonitor.untrack(projectId);
          this.statsMonitor.track(projectId, newPid, runtime.startedAt);
          this.#persistRuntime(projectId, runtime);
          this.#watchOrphan(projectId, newPid);
          this.#emitStatus(projectId, "running", newPid);
        }
      })();
    }, ORPHAN_POLL_MS);
    timer.unref?.();
    this.orphanTimers.set(projectId, timer);
  }

  #scheduleAutoRestart(projectId, startedAt) {
    const livedMs = Date.now() - startedAt;
    let crashes = this.crashCounts.get(projectId) || 0;
    if (livedMs >= AUTO_RESTART_STABLE_MS) {
      crashes = 0;
    }
    crashes += 1;
    this.crashCounts.set(projectId, crashes);

    if (crashes > AUTO_RESTART_MAX) {
      this.#appendLog(
        projectId,
        `[dashboard] auto-restart stopped after ${AUTO_RESTART_MAX} crashes`,
        "system",
      );
      return;
    }

    this.#appendLog(
      projectId,
      `[dashboard] crash detected — auto-restart ${crashes}/${AUTO_RESTART_MAX} in ${AUTO_RESTART_DELAY_MS}ms`,
      "system",
    );

    this.#clearRestartTimer(projectId);
    const timer = setTimeout(() => {
      this.restartTimers.delete(projectId);
      this.start(projectId).catch((error) => {
        this.#appendLog(
          projectId,
          `[dashboard] auto-restart failed: ${error.message}`,
          "system",
        );
      });
    }, AUTO_RESTART_DELAY_MS);
    timer.unref?.();
    this.restartTimers.set(projectId, timer);
  }

  /**
   * Setelah backend restart (--watch / crash), reclaim process yang masih hidup.
   * 1) PID dari runtime.json  2) fallback port listen (orphan / shell PID hilang)
   */
  async reattachAll() {
    const store = readRuntimeStore();
    const entries = Object.entries(store.processes || {});
    let reattached = 0;

    for (const [projectId, entry] of entries) {
      if (this.processes.has(projectId)) continue;

      const project = findProject(projectId) || {
        id: projectId,
        name: projectId,
        path: entry.path || "",
        type: entry.type || "unknown",
        start: entry.start || null,
        port: entry.port ?? null,
        cwd: ".",
        hasConfig: Boolean(entry.start),
      };

      let pid = Number(entry?.pid);
      if (!isPidAlive(pid)) {
        pid = await this.#resolveLivePid(project, null);
        if (!pid) {
          const port = this.#projectPort(project);
          if (port && (await isPortListening(port))) {
            this.#adoptRuntime(project, null, {
              reason: `reattached via port ${port} after backend restart`,
              startedAt: entry.startedAt,
            });
            reattached += 1;
            continue;
          }
          removeRuntimeEntry(projectId);
          continue;
        }
      }

      this.#adoptRuntime(project, pid, {
        reason: `reattached PID ${pid} after backend restart`,
        startedAt: entry.startedAt,
      });
      reattached += 1;
    }

    const recovered = await this.reconcileAll({ force: true });
    reattached += recovered;

    if (reattached > 0) {
      console.log(`[lpm] reattached ${reattached} managed process(es)`);
    }
    return reattached;
  }

  async start(projectId) {
    this.stoppedProjects.delete(projectId);
    this.#clearRestartTimer(projectId);
    await this.reconcileProject(projectId);

    if (this.processes.has(projectId)) {
      throw Object.assign(new Error("Project already running"), {
        status: 409,
      });
    }

    const project = findProject(projectId);
    if (!project) {
      throw Object.assign(new Error("Project not found"), { status: 404 });
    }
    if (!project.hasConfig || !project.start) {
      throw Object.assign(
        new Error("Tidak ada perintah start (config / auto-detect gagal)"),
        { status: 400 },
      );
    }

    const port = this.#projectPort(project);
    if (port && (await isPortListening(port))) {
      await this.reconcileProject(project);
      throw Object.assign(new Error("Project already running"), {
        status: 409,
      });
    }

    const cwd = path.resolve(project.path, project.cwd || ".");
    // Redirect stdout/stderr ke file supaya log survive reattach / refresh.
    // Windows: JANGAN detached — Node docs: detached child dapat console window
    // sendiri. Survival parent-restart lewat skip stopAll di SIGTERM + port reconcile.
    truncateProjectLog(projectId);
    this.logBuffer.clear(projectId);
    const logPath = getProjectLogPath(projectId);
    const startCmd = buildRedirectedStartCommand(project.start, logPath);
    const child = spawn(startCmd, {
      cwd,
      shell: true,
      env: this.#buildChildEnv(project),
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "ignore", "ignore"],
    });

    const startedAt = Date.now();
    const runtime = {
      pid: child.pid,
      child,
      startedAt,
      project,
      stats: { cpu: 0, memory: 0, uptime: 0 },
      stopping: false,
      reattached: false,
    };

    this.processes.set(projectId, runtime);
    this.statsMonitor.track(projectId, child.pid, startedAt);
    this.#persistRuntime(projectId, runtime);
    this.#emitStatus(projectId, "running", child.pid);
    this.#appendLog(
      projectId,
      `[dashboard] started: ${project.start}${
        project.configSource === "auto" ? " (auto-detect)" : ""
      }`,
      "system",
      { persist: true },
    );
    this.#startLogTail(projectId, { fromBeginning: false });

    child.on("error", (error) => {
      this.#appendLog(
        projectId,
        `[dashboard] spawn error: ${error.message}`,
        "system",
        { persist: true },
      );
    });

    child.on("exit", (code, signal) => {
      this.#handleExit(projectId, child, { code, signal });
    });

    return this.enrichProject(project);
  }

  #killTree(pid) {
    return new Promise((resolve) => {
      if (!pid) {
        resolve();
        return;
      }
      kill(pid, "SIGTERM", (err) => {
        if (!err) {
          resolve();
          return;
        }
        kill(pid, "SIGKILL", () => resolve());
      });
      setTimeout(() => {
        kill(pid, "SIGKILL", () => resolve());
      }, STOP_TIMEOUT_MS).unref?.();
    });
  }

  #runStopCommand(project) {
    return new Promise((resolve) => {
      const cwd = path.resolve(project.path, project.cwd || ".");
      const stopCmd = project.stop || "docker compose down";
      const child = spawn(stopCmd, {
        cwd,
        shell: true,
        env: process.env,
        windowsHide: true,
      });

      child.stdout?.on("data", (chunk) =>
        this.#appendLog(project.id, chunk, "stdout"),
      );
      child.stderr?.on("data", (chunk) =>
        this.#appendLog(project.id, chunk, "stderr"),
      );

      const timer = setTimeout(() => {
        if (child.pid) kill(child.pid, "SIGKILL", () => {});
        resolve();
      }, STOP_TIMEOUT_MS);
      timer.unref?.();

      child.on("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async stop(projectId) {
    this.stoppedProjects.add(projectId);
    this.#clearRestartTimer(projectId);
    this.crashCounts.delete(projectId);
    await this.reconcileProject(projectId);

    const runtime = this.processes.get(projectId);
    if (!runtime) {
      const project = findProject(projectId);
      if (project) {
        const port = this.#projectPort(project);
        if (port && (await isPortListening(port))) {
          const portPid = await findPidByPort(port);
          if (portPid && isPidAlive(portPid)) {
            await this.#killTree(portPid);
          }
        }
      }
      throw Object.assign(new Error("Project is not running"), { status: 409 });
    }

    runtime.stopping = true;
    this.#clearOrphanTimer(projectId);
    this.#appendLog(projectId, "[dashboard] stopping...", "system", {
      persist: true,
    });

    const livePid = await this.#resolveLivePid(runtime.project, runtime.pid);
    if (livePid) runtime.pid = livePid;

    if (runtime.project.type === "docker") {
      await this.#runStopCommand(runtime.project);
      await this.#killTree(runtime.pid);
    } else {
      await this.#killTree(runtime.pid);
    }

    // Pengecekan tambahan: jika port masih listening, kill PID yang mendengarkan di port tersebut
    const port = this.#projectPort(runtime.project);
    if (port && (await isPortListening(port))) {
      const portPid = await findPidByPort(port);
      if (portPid && isPidAlive(portPid)) {
        await this.#killTree(portPid);
      }
    }

    // exit handler cleans map; ensure cleanup if hang / reattached (no child event)
    const stillTracked = this.processes.get(projectId);
    if (stillTracked && stillTracked === runtime) {
      this.#clearOrphanTimer(projectId);
      this.#stopLogTail(projectId);
      this.processes.delete(projectId);
      this.statsMonitor.untrack(projectId);
      removeRuntimeEntry(projectId);
      this.#emitStatus(projectId, "stopped", null);
    }

    const project = findProject(projectId) || runtime.project;
    return this.enrichProject(project);
  }

  async restart(projectId) {
    this.#clearRestartTimer(projectId);
    this.crashCounts.delete(projectId);
    if (this.processes.has(projectId)) {
      await this.stop(projectId);
      await new Promise((r) => setTimeout(r, 400));
    }
    return this.start(projectId);
  }

  async startAll() {
    await this.reconcileAll({ force: true });
    const projects = discoverProjects().filter((p) => p.hasConfig && p.start);
    const results = [];
    for (const project of projects) {
      if (this.processes.has(project.id)) {
        results.push({
          id: project.id,
          ok: true,
          skipped: true,
          reason: "already running",
        });
        continue;
      }
      try {
        await this.start(project.id);
        results.push({ id: project.id, ok: true, skipped: false });
      } catch (error) {
        results.push({
          id: project.id,
          ok: false,
          skipped: false,
          error: error.message,
        });
      }
    }
    return {
      action: "start-all",
      results,
      projects: discoverProjects().map((p) => this.enrichProject(p)),
    };
  }

  async stopAll() {
    await this.reconcileAll({ force: true });
    const ids = [...this.processes.keys()];
    const results = [];
    for (const id of ids) {
      try {
        await this.stop(id);
        results.push({ id, ok: true, skipped: false });
      } catch (error) {
        results.push({ id, ok: false, skipped: false, error: error.message });
      }
    }
    if (ids.length === 0) {
      clearRuntimeStore();
    }
    return {
      action: "stop-all",
      results,
      projects: discoverProjects().map((p) => this.enrichProject(p)),
    };
  }

  async restartAll() {
    await this.reconcileAll({ force: true });
    const runningIds = [...this.processes.keys()];
    const results = [];
    for (const id of runningIds) {
      try {
        await this.restart(id);
        results.push({ id, ok: true, skipped: false });
      } catch (error) {
        results.push({ id, ok: false, skipped: false, error: error.message });
      }
    }
    return {
      action: "restart-all",
      results,
      projects: discoverProjects().map((p) => this.enrichProject(p)),
    };
  }
}
