/**
 * SIGINT (Ctrl+C) → stop semua managed project (shutdown sengaja).
 * SIGTERM → JANGAN stopAll. Node --watch / restart kirim SIGTERM;
 * kalau stopAll di sini, semua project ikut mati setiap backend reload.
 */
export const registerShutdownHook = (processManager) => {
  let shuttingDown = false;

  const shutdownAll = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] received ${signal}, stopping managed projects...`);
    try {
      await processManager.stopAll();
    } catch (error) {
      console.error("[shutdown] error", error);
    } finally {
      process.exit(0);
    }
  };

  const leaveProjectsRunning = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      `[shutdown] received ${signal} — leaving managed projects running (PID persist)`,
    );
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdownAll("SIGINT");
  });
  process.on("SIGTERM", () => {
    leaveProjectsRunning("SIGTERM");
  });
};
