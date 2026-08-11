const fs = require("fs");
const path = require("path");

const root = "D:\\mhartian\\project";
const configs = {
  ai_agent_lsp: {
    name: "AI Agent LSP",
    type: "python",
    start: "python app.py",
    port: 5000,
    cwd: ".",
  },
  "api-dmsedu-id": {
    name: "API DMS Edu",
    type: "python",
    start: "python app.py",
    port: 5559,
    cwd: ".",
  },
  auto_article: {
    name: "Auto Article",
    type: "docker",
    start: "docker compose up",
    stop: "docker compose down",
    port: 8000,
    cwd: ".",
  },
  "backend-aira": {
    name: "Backend Aira",
    type: "node",
    start: "npm run dev",
    port: 5075,
    cwd: ".",
  },
  backup: {
    name: "Backup",
    type: "other",
    start: "cmd /c echo Backup folder - bukan app runnable & pause",
    cwd: ".",
  },
  "be-sertifikasi-lsp-dmi-ai": {
    name: "BE Sertifikasi LSP DMI AI",
    type: "node",
    start: "npm run dev",
    port: 5544,
    cwd: ".",
  },
  "claude-guide": {
    name: "Claude Guide",
    type: "docker",
    start: "docker compose up",
    stop: "docker compose down",
    port: 8000,
    cwd: ".",
  },
  docker: {
    name: "Docker Stack",
    type: "docker",
    start: "docker compose up",
    stop: "docker compose down",
    port: 80,
    cwd: ".",
  },
  "fe-dmi-ai": {
    name: "FE DMI AI",
    type: "node",
    start: "npm start",
    port: 3000,
    cwd: ".",
  },
  "frontend-aira": {
    name: "Frontend Aira",
    type: "node",
    start: "npm start",
    port: 3005,
    cwd: ".",
  },
  linkzoom_lspapi: {
    name: "LinkZoom LSP API",
    type: "python",
    start: "python app.py",
    port: 5005,
    cwd: ".",
  },
  logs: {
    name: "Logs",
    type: "other",
    start: "cmd /c echo Logs folder - bukan app runnable & pause",
    cwd: ".",
  },
  tools: {
    name: "Tools",
    type: "other",
    start: "cmd /c echo Tools folder - bukan app runnable & pause",
    cwd: ".",
  },
  uploads: {
    name: "Uploads",
    type: "other",
    start: "cmd /c echo Uploads folder - bukan app runnable & pause",
    cwd: ".",
  },
  whatsapp_services: {
    name: "WhatsApp Services",
    type: "docker",
    start: "docker compose up",
    stop: "docker compose down",
    port: 4000,
    cwd: ".",
  },
};

for (const [folder, cfg] of Object.entries(configs)) {
  const dir = path.join(root, folder);
  if (!fs.existsSync(dir)) {
    console.log("SKIP missing", folder);
    continue;
  }
  const file = path.join(dir, "project.config.json");
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  console.log("OK", folder, "->", cfg.start, cfg.port ?? "-");
}
