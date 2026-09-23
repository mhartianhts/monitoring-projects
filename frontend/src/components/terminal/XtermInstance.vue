<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { getSocket } from "../../composables/useSocket";

const props = defineProps<{
  sessionId: string;
  projectId?: string | null;
  cwd?: string;
  shell?: string;
  active?: boolean;
}>();

const emit = defineEmits<{
  (e: "exit", exitCode: number): void;
  (e: "ready", session: any): void;
  (e: "title", title: string): void;
}>();

const terminalContainer = ref<HTMLDivElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;

const initTerminal = () => {
  if (!terminalContainer.value) return;

  terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: "bar",
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, 'Courier New', monospace",
    lineHeight: 1.25,
    letterSpacing: 0,
    allowProposedApi: true,
    theme: {
      background: "#080c14",
      foreground: "#e2e8f0",
      cursor: "#38bdf8",
      cursorAccent: "#080c14",
      selectionBackground: "rgba(56, 189, 248, 0.35)",
      selectionForeground: "#ffffff",
      black: "#0f172a",
      red: "#f87171",
      green: "#4ade80",
      yellow: "#facc15",
      blue: "#60a5fa",
      magenta: "#c084fc",
      cyan: "#38bdf8",
      white: "#f1f5f9",
      brightBlack: "#64748b",
      brightRed: "#ef4444",
      brightGreen: "#22c55e",
      brightYellow: "#eab308",
      brightBlue: "#38bdf8",
      brightMagenta: "#d8b4fe",
      brightCyan: "#67e8f9",
      brightWhite: "#ffffff",
    },
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  terminal.open(terminalContainer.value);

  // Fit immediately to calculate true container dimensions
  let initialCols = 120;
  let initialRows = 30;
  try {
    fitAddon.fit();
    if (terminal.cols > 10) initialCols = terminal.cols;
    if (terminal.rows > 5) initialRows = terminal.rows;
  } catch {}

  const socket = getSocket();

  // Send input from xterm to socket
  terminal.onData((data) => {
    socket.emit("terminal:data", {
      sessionId: props.sessionId,
      data,
    });
  });

  // Listen to terminal's onResize event so every resize triggers socket emit
  terminal.onResize(({ cols, rows }) => {
    socket.emit("terminal:resize", {
      sessionId: props.sessionId,
      cols,
      rows,
    });
  });

  terminal.onTitleChange((title) => {
    emit("title", title);
  });

  // Create or join session on backend with true measured dimensions
  socket.emit(
    "terminal:create",
    {
      id: props.sessionId,
      projectId: props.projectId || null,
      cwd: props.cwd || null,
      shell: props.shell || "powershell",
      cols: initialCols,
      rows: initialRows,
    },
    (res: { success: boolean; session?: any; history?: string; error?: string }) => {
      if (res && res.success) {
        emit("ready", res.session);
        if (res.history && terminal) {
          terminal.write(res.history);
        }
        nextTick(() => {
          fitTerminal();
        });
      } else if (res && res.error) {
        terminal?.writeln(`\r\n\x1b[31m[Error starting terminal: ${res.error}]\x1b[0m\r\n`);
      }
    }
  );

  // Output handler
  socket.on("terminal:output", onSocketOutput);
  socket.on("terminal:exit", onSocketExit);

  // Setup ResizeObserver on container
  resizeObserver = new ResizeObserver(() => {
    fitTerminal();
  });
  resizeObserver.observe(terminalContainer.value);
};

const onSocketOutput = (payload: { sessionId: string; data: string }) => {
  if (payload.sessionId === props.sessionId && terminal) {
    terminal.write(payload.data);
  }
};

const onSocketExit = (payload: { sessionId: string; exitCode: number }) => {
  if (payload.sessionId === props.sessionId) {
    emit("exit", payload.exitCode);
    if (terminal) {
      terminal.writeln(`\r\n\x1b[33m[Process exited with code ${payload.exitCode}]\x1b[0m\r\n`);
    }
  }
};

const fitTerminal = () => {
  if (!fitAddon || !terminal || !terminalContainer.value) return;
  try {
    fitAddon.fit();
    const cols = terminal.cols;
    const rows = terminal.rows;
    const socket = getSocket();
    socket.emit("terminal:resize", {
      sessionId: props.sessionId,
      cols,
      rows,
    });
  } catch {
    // Ignore fit errors if container hidden
  }
};

const sendInput = (text: string) => {
  const socket = getSocket();
  socket.emit("terminal:data", {
    sessionId: props.sessionId,
    data: text,
  });
};

const clearScreen = () => {
  if (terminal) {
    terminal.clear();
  }
  sendInput("cls\r");
};

const sendInterrupt = () => {
  sendInput("\x03"); // Ctrl+C
};

const focus = () => {
  if (terminal) {
    terminal.focus();
  }
};

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      nextTick(() => {
        fitTerminal();
        focus();
      });
    }
  }
);

onMounted(() => {
  initTerminal();
});

onBeforeUnmount(() => {
  const socket = getSocket();
  socket.off("terminal:output", onSocketOutput);
  socket.off("terminal:exit", onSocketExit);

  if (resizeObserver && terminalContainer.value) {
    resizeObserver.unobserve(terminalContainer.value);
    resizeObserver.disconnect();
  }

  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
});

defineExpose({
  fitTerminal,
  sendInput,
  clearScreen,
  sendInterrupt,
  focus,
});
</script>

<template>
  <div class="relative h-full w-full bg-[#080c14] overflow-hidden flex flex-col flex-1 min-w-0">
    <div
      ref="terminalContainer"
      class="h-full w-full p-2.5 overflow-hidden flex-1 min-w-0"
      @click="focus"
    />
  </div>
</template>

<style>
.xterm {
  height: 100%;
  width: 100%;
}
.xterm .xterm-screen {
  width: 100% !important;
}
.xterm .xterm-viewport {
  width: 100% !important;
}
/* Custom styling for xterm viewport scrollbar to blend with dark mode */
.xterm .xterm-viewport::-webkit-scrollbar {
  width: 8px;
}
.xterm .xterm-viewport::-webkit-scrollbar-track {
  background: #080c14;
}
.xterm .xterm-viewport::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 4px;
}
.xterm .xterm-viewport::-webkit-scrollbar-thumb:hover {
  background: #334155;
}
</style>
