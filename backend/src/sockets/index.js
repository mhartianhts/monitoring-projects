export const registerSockets = (io, processManager, terminalService) => {
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

    // Terminal socket events
    socket.on("terminal:create", (payload = {}, ack) => {
      if (!terminalService) return;
      try {
        const session = terminalService.createSession(payload);
        socket.join(`terminal:${session.id}`);
        const history = terminalService.getSessionHistory(session.id);
        if (typeof ack === "function") {
          ack({ success: true, session, history });
        } else {
          socket.emit("terminal:ready", { session, history });
        }
      } catch (err) {
        if (typeof ack === "function") {
          ack({ success: false, error: err.message });
        } else {
          socket.emit("terminal:error", { error: err.message });
        }
      }
    });

    socket.on("terminal:join", ({ sessionId } = {}, ack) => {
      if (!terminalService || !sessionId) return;
      const session = terminalService.getSessionInfo(sessionId);
      if (!session) {
        if (typeof ack === "function") {
          ack({ success: false, error: "Session tidak ditemukan" });
        }
        return;
      }
      socket.join(`terminal:${sessionId}`);
      const history = terminalService.getSessionHistory(sessionId);
      if (typeof ack === "function") {
        ack({ success: true, session, history });
      }
    });

    socket.on("terminal:data", ({ sessionId, data } = {}) => {
      if (!terminalService || !sessionId || typeof data !== "string") return;
      terminalService.write(sessionId, data);
    });

    socket.on("terminal:resize", ({ sessionId, cols, rows } = {}) => {
      if (!terminalService || !sessionId) return;
      terminalService.resize(sessionId, cols, rows);
    });

    socket.on("terminal:close", ({ sessionId } = {}, ack) => {
      if (!terminalService || !sessionId) return;
      terminalService.killSession(sessionId);
      if (typeof ack === "function") {
        ack({ success: true });
      }
    });
  });
};
