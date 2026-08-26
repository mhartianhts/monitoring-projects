import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appConfig } from "../config/app.js";
import { autoDetectConfig } from "./autoDetect.service.js";
import { readExtraProjects } from "./extraProjects.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const storePath = path.join(dataDir, "managed-projects.json");

const REQUIRED_FIELDS = ["name", "type", "start"];

const readConfigFromFile = (projectPath) => {
  const configPath = path.join(projectPath, "project.config.json");
  if (!fs.existsSync(configPath)) {
    return {
      hasConfig: false,
      config: null,
      configError: null,
      configSource: null,
    };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const missing = REQUIRED_FIELDS.filter((key) => !parsed[key]);
    if (missing.length > 0) {
      return {
        hasConfig: false,
        config: null,
        configError: `Missing fields: ${missing.join(", ")}`,
        configSource: null,
      };
    }
    return {
      hasConfig: true,
      config: {
        name: String(parsed.name),
        type: String(parsed.type),
        start: String(parsed.start),
        stop: parsed.stop ? String(parsed.stop) : null,
        port: parsed.port != null ? Number(parsed.port) : null,
        url: parsed.url ? String(parsed.url) : null,
        cwd: parsed.cwd ? String(parsed.cwd) : ".",
      },
      configError: null,
      configSource: "file",
    };
  } catch (error) {
    return {
      hasConfig: false,
      config: null,
      configError: error.message,
      configSource: null,
    };
  }
};

const resolveFolderMeta = (projectPath, folderName) => {
  const fromFile = readConfigFromFile(projectPath);
  if (fromFile.hasConfig) {
    return {
      name: fromFile.config.name || folderName,
      type: fromFile.config.type || "unknown",
      start: fromFile.config.start || null,
      stop: fromFile.config.stop || null,
      port: fromFile.config.port ?? null,
      url: fromFile.config.url ?? null,
      cwd: fromFile.config.cwd || ".",
      hasConfig: true,
      configError: null,
      configSource: "file",
    };
  }

  const detected = autoDetectConfig(projectPath, folderName);
  if (detected) {
    return {
      name: detected.name || folderName,
      type: detected.type || "unknown",
      start: detected.start || null,
      stop: detected.stop || null,
      port: detected.port ?? null,
      url: detected.url ?? null,
      cwd: detected.cwd || ".",
      hasConfig: true,
      configError: fromFile.configError,
      configSource: "auto",
    };
  }

  return {
    name: folderName,
    type: "unknown",
    start: null,
    stop: null,
    port: null,
    url: null,
    cwd: ".",
    hasConfig: false,
    configError: fromFile.configError,
    configSource: null,
  };
};

const ensureStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    // Inisialisasi awal: jika ada extraProjects, masukkan ke store
    const extras = readExtraProjects();
    const initialData = {
      initialized: false,
      projects: extras.map((p) => ({
        id: p.id,
        name: p.name,
        path: p.path,
        type: p.type,
        start: p.start,
        stop: p.stop,
        port: p.port,
        url: p.url,
        cwd: p.cwd,
        enabled: true,
      })),
    };
    fs.writeFileSync(storePath, JSON.stringify(initialData, null, 2), "utf8");
  }
};

export const readManagedStore = () => {
  ensureStore();
  try {
    const raw = fs.readFileSync(storePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed.projects) ? parsed.projects : [];
    return {
      initialized: Boolean(parsed.initialized),
      projects: list,
    };
  } catch {
    return { initialized: false, projects: [] };
  }
};

export const writeManagedStore = (data) => {
  ensureStore();
  fs.writeFileSync(
    storePath,
    JSON.stringify(
      {
        initialized: true,
        projects: data.projects || [],
      },
      null,
      2,
    ),
    "utf8",
  );
};

/**
 * Scan seluruh folder di root (PROJECTS_ROOT) untuk ditampilkan di modal pemilih folder.
 */
export const scanAvailableFolders = (root = appConfig.projectsRoot) => {
  const { projects } = readManagedStore();
  const managedMap = new Map(projects.map((p) => [p.path, p]));
  const managedIdMap = new Map(projects.map((p) => [p.id, p]));

  const results = [];
  if (fs.existsSync(root)) {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const folderPath = path.join(root, entry.name);
      const meta = resolveFolderMeta(folderPath, entry.name);
      const existing = managedMap.get(folderPath) || managedIdMap.get(entry.name);

      results.push({
        id: existing?.id || entry.name,
        name: existing?.name || meta.name,
        folderName: entry.name,
        path: folderPath,
        type: existing?.type || meta.type,
        start: existing?.start || meta.start,
        stop: existing?.stop || meta.stop,
        port: existing?.port ?? meta.port,
        url: existing?.url ?? meta.url,
        cwd: existing?.cwd || meta.cwd,
        hasConfig: meta.hasConfig,
        configSource: meta.configSource,
        configError: meta.configError,
        isManaged: Boolean(existing),
        enabled: existing ? Boolean(existing.enabled) : false,
      });
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Mendapatkan daftar projek yang saat ini aktif (enabled) untuk digunakan oleh dashboard.
 */
export const getActiveProjects = () => {
  const store = readManagedStore();
  // Jika belum pernah diatur/dikonfigurasi sama sekali (first run),
  // kita kembalikan projek yang enabled atau fallback scan jika belum ada
  if (!store.initialized && store.projects.length === 0) {
    // First run fallback: scan root dan set semua yang valid
    const scanned = scanAvailableFolders();
    const active = scanned
      .filter((p) => p.hasConfig)
      .map((p) => ({
        id: p.id,
        name: p.name,
        path: p.path,
        type: p.type,
        start: p.start,
        stop: p.stop,
        port: p.port,
        url: p.url,
        cwd: p.cwd,
        enabled: true,
      }));
    if (active.length > 0) {
      writeManagedStore({ projects: active });
      return active.map((p) => ({
        ...p,
        hasConfig: true,
        configError: null,
        configSource: "managed",
      }));
    }
  }

  return store.projects
    .filter((p) => p.enabled !== false)
    .map((p) => {
      const pathExists = fs.existsSync(p.path);
      return {
        id: p.id,
        name: p.name || p.id,
        path: p.path,
        type: p.type || "unknown",
        port: p.port != null ? Number(p.port) : null,
        url: p.url || null,
        start: p.start || null,
        stop: p.stop || null,
        cwd: p.cwd || ".",
        hasConfig: pathExists && Boolean(p.start),
        configError: pathExists ? null : `Path tidak ditemukan: ${p.path}`,
        configSource: "managed",
      };
    });
};

/**
 * Sinkronisasi pemilihan folder dari modal checklist.
 * @param {Array<{path: string, enabled: boolean, name?: string, type?: string, start?: string, port?: number, stop?: string, url?: string, cwd?: string}>} selectedFolders
 */
export const syncSelectedFolders = (selectedFolders) => {
  const current = readManagedStore();
  const projectMap = new Map(current.projects.map((p) => [p.path, p]));

  for (const item of selectedFolders) {
    if (!item.path) continue;
    const existing = projectMap.get(item.path);
    if (existing) {
      existing.enabled = Boolean(item.enabled);
      if (item.name) existing.name = item.name;
      if (item.type) existing.type = item.type;
      if (item.start) existing.start = item.start;
      if (item.stop !== undefined) existing.stop = item.stop;
      if (item.port !== undefined) existing.port = item.port;
      if (item.url !== undefined) existing.url = item.url;
      if (item.cwd !== undefined) existing.cwd = item.cwd;
    } else if (item.enabled) {
      const folderName = path.basename(item.path);
      const meta = resolveFolderMeta(item.path, folderName);
      projectMap.set(item.path, {
        id: folderName,
        name: item.name || meta.name || folderName,
        path: item.path,
        type: item.type || meta.type || "unknown",
        start: item.start || meta.start || "",
        stop: item.stop || meta.stop || null,
        port: item.port !== undefined ? item.port : meta.port,
        url: item.url || meta.url || null,
        cwd: item.cwd || meta.cwd || ".",
        enabled: true,
      });
    }
  }

  const updatedProjects = [...projectMap.values()];
  writeManagedStore({ projects: updatedProjects });
  return updatedProjects;
};

/**
 * Menambahkan projek kustom secara manual (misal dari folder lain).
 */
export const addCustomProject = (projectData) => {
  const current = readManagedStore();
  const projectPath = String(projectData.path || "").trim();
  if (!projectPath) {
    throw new Error("Path projek wajib diisi");
  }

  const id = String(projectData.id || path.basename(projectPath)).trim();
  if (!id) {
    throw new Error("ID projek tidak valid");
  }

  // Cek duplikasi ID atau path
  const existingIdx = current.projects.findIndex(
    (p) => p.id === id || p.path === projectPath,
  );

  const newEntry = {
    id,
    name: String(projectData.name || id).trim(),
    path: projectPath,
    type: String(projectData.type || "unknown"),
    start: String(projectData.start || "").trim(),
    stop: projectData.stop ? String(projectData.stop).trim() : null,
    port: projectData.port != null && projectData.port !== "" ? Number(projectData.port) : null,
    url: projectData.url ? String(projectData.url).trim() : null,
    cwd: projectData.cwd ? String(projectData.cwd).trim() : ".",
    enabled: true,
  };

  if (existingIdx >= 0) {
    current.projects[existingIdx] = { ...current.projects[existingIdx], ...newEntry };
  } else {
    current.projects.push(newEntry);
  }

  writeManagedStore(current);
  return newEntry;
};

/**
 * Update data / config satu project yang sudah ada.
 */
export const updateManagedProject = (id, updates) => {
  const current = readManagedStore();
  const idx = current.projects.findIndex((p) => p.id === id);
  if (idx < 0) {
    throw new Error(`Project dengan ID ${id} tidak ditemukan`);
  }

  current.projects[idx] = {
    ...current.projects[idx],
    ...(updates.name ? { name: String(updates.name).trim() } : {}),
    ...(updates.type ? { type: String(updates.type).trim() } : {}),
    ...(updates.start !== undefined ? { start: String(updates.start || "").trim() } : {}),
    ...(updates.stop !== undefined ? { stop: updates.stop ? String(updates.stop).trim() : null } : {}),
    ...(updates.port !== undefined ? { port: updates.port != null && updates.port !== "" ? Number(updates.port) : null } : {}),
    ...(updates.url !== undefined ? { url: updates.url ? String(updates.url).trim() : null } : {}),
    ...(updates.cwd !== undefined ? { cwd: String(updates.cwd || ".").trim() } : {}),
    ...(updates.enabled !== undefined ? { enabled: Boolean(updates.enabled) } : {}),
  };

  writeManagedStore(current);
  return current.projects[idx];
};

/**
 * Hapus projek dari daftar managed.
 */
export const removeManagedProject = (id) => {
  const current = readManagedStore();
  const filtered = current.projects.filter((p) => p.id !== id);
  writeManagedStore({ projects: filtered });
  return { id, removed: true };
};
