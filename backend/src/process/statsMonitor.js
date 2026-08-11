import pidusage from "pidusage";

export class StatsMonitor {
  constructor({ intervalMs, onStats }) {
    this.intervalMs = intervalMs;
    this.onStats = onStats;
    this.timer = null;
    this.tracked = new Map();
  }

  track(projectId, pid, startedAt) {
    this.tracked.set(projectId, { pid, startedAt });
  }

  untrack(projectId) {
    this.tracked.delete(projectId);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.#tick();
    }, this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async #tick() {
    for (const [projectId, meta] of this.tracked.entries()) {
      try {
        const usage = await pidusage(meta.pid);
        this.onStats?.({
          projectId,
          cpu: Number(usage.cpu.toFixed(1)),
          memory: Number((usage.memory / (1024 * 1024)).toFixed(1)),
          uptime: Math.floor((Date.now() - meta.startedAt) / 1000),
        });
      } catch {
        // process may have exited; ProcessManager will reconcile
      }
    }
  }
}
