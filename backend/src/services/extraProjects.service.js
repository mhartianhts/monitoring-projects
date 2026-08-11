import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureFavorite } from "./preferences.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const storePath = path.join(dataDir, "extra-projects.json");

/** Project khusus di luar PROJECTS_ROOT (path absolut). */
const DEFAULT_EXTRAS = {
  projects: [
    {
      id: "dms2024cery",
      name: "DMS 2024 Cery",
      path: "C:\\xampp\\htdocs\\dms2024cery",
      type: "php",
      start: "docker compose up",
      stop: "docker compose down",
      port: 3012,
      url: "http://localhost/dms2024cery",
      cwd: ".",
      favorite: true,
    },
  ],
};

const ensureStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(
      storePath,
      JSON.stringify(DEFAULT_EXTRAS, null, 2),
      "utf8",
    );
  }
};

const normalizeEntry = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const projectPath = String(raw.path || "").trim();
  const id = String(raw.id || path.basename(projectPath) || "").trim();
  const start = raw.start != null ? String(raw.start) : null;
  if (!id || !projectPath || !start) return null;

  const pathExists = fs.existsSync(projectPath);
  return {
    id,
    name: String(raw.name || id),
    path: projectPath,
    type: String(raw.type || "unknown"),
    port: raw.port != null && raw.port !== "" ? Number(raw.port) : null,
    url: raw.url ? String(raw.url) : null,
    start,
    stop: raw.stop ? String(raw.stop) : null,
    cwd: raw.cwd ? String(raw.cwd) : ".",
    hasConfig: pathExists,
    configError: pathExists ? null : `Path tidak ditemukan: ${projectPath}`,
    configSource: "extra",
    favoriteDefault: Boolean(raw.favorite),
  };
};

export const readExtraProjects = () => {
  ensureStore();
  try {
    const raw = fs.readFileSync(storePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    const projects = list.map(normalizeEntry).filter(Boolean);

    for (const project of projects) {
      if (project.favoriteDefault) ensureFavorite(project.id);
    }

    return projects.map(({ favoriteDefault, ...project }) => project);
  } catch {
    return [];
  }
};
