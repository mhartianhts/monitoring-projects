const { app, BrowserWindow, Tray, Menu, shell, ipcMain, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
// Load .env from root if available
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (key && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
    }
  } catch (err) {
    console.warn("[Electron] Gagal membaca .env:", err.message);
  }
}

const BACKEND_PORT = Number(process.env.PORT || 7171);
const FRONTEND_PORT = 7070;
const FRONTEND_URL = process.env.FRONTEND_ORIGIN || `http://localhost:${FRONTEND_PORT}`;
const BACKEND_HEALTH_URL = `http://127.0.0.1:${BACKEND_PORT}/api/health`;
const PROJECTS_ROOT = process.env.PROJECTS_ROOT || "D:\\mhartian\\project";

let mainWindow = null;
let tray = null;
let isQuitting = false;
let hasShownTrayNotification = false;
let backendProcess = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

async function isPortReady(url, timeoutMs = 1500) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function ensureBackendRunning() {
  const isHealthy = await isPortReady(BACKEND_HEALTH_URL);
  if (isHealthy) {
    console.log("[Electron] Backend sudah berjalan di port", BACKEND_PORT);
    return;
  }

  console.log("[Electron] Menjalankan backend server otomatis...");
  const serverScript = path.join(rootDir, "backend", "src", "server.js");
  backendProcess = spawn(process.execPath || "node", [serverScript], {
    cwd: path.join(rootDir, "backend"),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  backendProcess.stdout?.on("data", (d) => {
    console.log(`[Backend-Out] ${d.toString().trim()}`);
  });
  backendProcess.stderr?.on("data", (d) => {
    console.error(`[Backend-Err] ${d.toString().trim()}`);
  });

  // Wait for health check up to 10 seconds
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isPortReady(BACKEND_HEALTH_URL)) {
      console.log("[Electron] Backend siap!");
      return;
    }
  }
}

function stopBackendIfOwned() {
  if (backendProcess) {
    try {
      console.log("[Electron] Menghentikan backend yang di-manage Electron...");
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", backendProcess.pid.toString(), "/f", "/t"]);
      } else {
        backendProcess.kill("SIGINT");
      }
    } catch (e) {
      console.error("[Electron] Gagal mematikan backend:", e.message);
    }
    backendProcess = null;
  }
}

function createTray() {
  const iconPath = path.join(__dirname, "assets", process.platform === "win32" ? "icon.ico" : "icon.png");
  tray = new Tray(iconPath);
  tray.setToolTip("Local Project Manager");

  const buildMenu = () => {
    return Menu.buildFromTemplate([
      {
        label: "🖥️  Buka Dashboard",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: "📁  Buka Folder Projects",
        click: () => {
          if (fs.existsSync(PROJECTS_ROOT)) {
            shell.openPath(PROJECTS_ROOT);
          } else {
            dialog.showMessageBox({
              type: "warning",
              title: "Folder Tidak Ditemukan",
              message: `Direktori project tidak ditemukan di:\n${PROJECTS_ROOT}`,
            });
          }
        },
      },
      {
        label: "🌐  Buka di Browser Web",
        click: () => {
          shell.openExternal(FRONTEND_URL);
        },
      },
      { type: "separator" },
      {
        label: "🔄  Muat Ulang Tampilan",
        click: () => {
          if (mainWindow) mainWindow.reload();
        },
      },
      { type: "separator" },
      {
        label: "❌  Keluar Aplikasi",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
  };

  tray.setContextMenu(buildMenu());

  tray.on("double-click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

function createMainWindow() {
  const iconPath = path.join(__dirname, "assets", "icon.png");

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0f19",
    autoHideMenuBar: true,
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load splash screen first
  mainWindow.loadFile(path.join(__dirname, "splash.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Handle close to tray
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (!hasShownTrayNotification && tray) {
        if (process.platform === "win32") {
          tray.displayBalloon({
            title: "Local Project Manager",
            content: "Aplikasi berjalan di latar belakang (System Tray). Klik icon untuk membuka kembali.",
            iconType: "info",
          });
        }
        hasShownTrayNotification = true;
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle external links safely
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Wait for frontend dev server or fallback to dist
  pollAndLoadFrontend();
}

async function pollAndLoadFrontend() {
  const distHtml = path.join(rootDir, "frontend", "dist", "index.html");

  // Loop checking Vite dev server (up to 30 seconds)
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    const isFeReady = await isPortReady(FRONTEND_URL, 800);
    if (isFeReady && mainWindow) {
      console.log(`[Electron] Frontend siap di ${FRONTEND_URL}, memuat halaman...`);
      mainWindow.loadURL(FRONTEND_URL);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // If Vite dev server is not running, check if built dist exists
  if (fs.existsSync(distHtml) && mainWindow) {
    console.log("[Electron] Memuat frontend dari build dist/index.html");
    mainWindow.loadFile(distHtml);
  } else if (mainWindow) {
    console.warn("[Electron] Vite dev server tidak ditemukan dan dist/index.html belum di-build.");
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Menunggu Frontend",
      message: `Frontend belum aktif di ${FRONTEND_URL}.\nJalankan "npm run dev" di terminal untuk menjalankan Vite dev server.`,
    });
  }
}

// IPC Handlers
ipcMain.handle("desktop:open-external", (_e, url) => shell.openExternal(url));
ipcMain.handle("desktop:open-path", (_e, pathStr) => shell.openPath(pathStr));
ipcMain.handle("desktop:minimize", () => mainWindow?.minimize());
ipcMain.handle("desktop:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.handle("desktop:hide", () => mainWindow?.hide());
ipcMain.handle("desktop:get-version", () => app.getVersion());

// Lifecycle
app.whenReady().then(async () => {
  await ensureBackendRunning();
  createTray();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackendIfOwned();
});

app.on("window-all-closed", () => {
  // On Windows, keep running in background tray unless isQuitting is true
  if (process.platform !== "win32") {
    app.quit();
  }
});
