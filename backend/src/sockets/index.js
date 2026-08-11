export const registerSockets = (io, processManager) => {
  io.on("connection", (socket) => {
    socket.on("subscribe:project", ({ projectId } = {}) => {
      if (!projectId) return;
      socket.join(`project:${projectId}`);
      const logs = processManager.getLogs(projectId, 200);
      socket.emit("log:snapshot", { projectId, logs });
    });

    socket.on("log:clear", ({ projectId } = {}) => {
      if (!projectId) return;
      processManager.clearLogs(projectId);
    });
  });
};
