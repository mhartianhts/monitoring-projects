import fs from "node:fs";
import path from "node:path";
import { appConfig } from "../config/app.js";
import { autoDetectConfig } from "./autoDetect.service.js";
import { readExtraProjects } from "./extraProjects.service.js";

const REQUIRED_FIELDS = ["name", "type", "start"];

const readConfig = (projectPath) => {
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

const resolveProjectMeta = (projectPath, folderName) => {
  const fromFile = readConfig(projectPath);
  if (fromFile.hasConfig) return fromFile;

  // Invalid/missing explicit config → try auto-detect
  const detected = autoDetectConfig(projectPath, folderName);
  if (detected) {
    return {
      hasConfig: true,
      config: detected,
      configError: fromFile.configError,
      configSource: "auto",
    };
  }

  return fromFile;
};

const mapDiscovered = (projectPath, folderName) => {
  const { hasConfig, config, configError, configSource } = resolveProjectMeta(
    projectPath,
    folderName,
  );
  return {
    id: folderName,
    name: config?.name || folderName,
    path: projectPath,
    type: config?.type || "unknown",
    port: config?.port ?? null,
    url: config?.url ?? null,
    start: config?.start || null,
    stop: config?.stop || null,
    cwd: config?.cwd || ".",
    hasConfig,
    configError,
    configSource,
  };
};

export const discoverProjects = (
  root = appConfig.projectsRoot,
  { includeExtras } = {},
) => {
  const byId = new Map();
  const shouldIncludeExtras =
    includeExtras ??
    path.resolve(root) === path.resolve(appConfig.projectsRoot);

  if (fs.existsSync(root)) {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const project = mapDiscovered(path.join(root, entry.name), entry.name);
      byId.set(project.id, project);
    }
  }

  // Extra / pinned projects (boleh di luar PROJECTS_ROOT) — override by id
  if (shouldIncludeExtras) {
    for (const project of readExtraProjects()) {
      byId.set(project.id, project);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const findProject = (id, root = appConfig.projectsRoot) => {
  return discoverProjects(root).find((project) => project.id === id) || null;
};
