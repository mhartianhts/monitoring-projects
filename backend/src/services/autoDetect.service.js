import fs from "node:fs";
import path from "node:path";

const exists = (projectPath, fileName) =>
  fs.existsSync(path.join(projectPath, fileName));

const readJson = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const detectDocker = (projectPath, folderName) => {
  const composeFiles = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];
  if (!composeFiles.some((file) => exists(projectPath, file))) return null;

  return {
    name: folderName,
    type: "docker",
    start: "docker compose up",
    stop: "docker compose down",
    port: null,
    cwd: ".",
  };
};

const detectLaravel = (projectPath, folderName) => {
  if (!exists(projectPath, "artisan")) return null;
  return {
    name: folderName,
    type: "php",
    start: "php artisan serve",
    stop: null,
    port: 8000,
    cwd: ".",
  };
};

const detectNode = (projectPath, folderName) => {
  const pkgPath = path.join(projectPath, "package.json");
  if (!exists(projectPath, "package.json")) return null;

  const pkg = readJson(pkgPath);
  if (!pkg) return null;

  const scripts = pkg.scripts || {};
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };

  let start = null;
  if (scripts.dev) start = "npm run dev";
  else if (scripts.start) start = "npm start";
  else if (scripts.serve) start = "npm run serve";

  if (!start) return null;

  let type = "node";
  let port = 3000;
  if (deps.vue || deps.nuxt || deps["@vue/cli-service"] || deps.vite) {
    type = "vue";
    if (
      deps.vite ||
      exists(projectPath, "vite.config.ts") ||
      exists(projectPath, "vite.config.js")
    ) {
      port = 5173;
    }
  } else if (deps.next) {
    type = "next";
    port = 3000;
  } else if (deps.react || deps["react-scripts"]) {
    type = "react";
    port = 3000;
  }

  return {
    name: pkg.name || folderName,
    type,
    start,
    stop: null,
    port,
    cwd: ".",
  };
};

const detectPython = (projectPath, folderName) => {
  const hasPythonMarkers =
    exists(projectPath, "requirements.txt") ||
    exists(projectPath, "pyproject.toml") ||
    exists(projectPath, "Pipfile") ||
    exists(projectPath, "manage.py") ||
    exists(projectPath, "app.py") ||
    exists(projectPath, "main.py");

  if (!hasPythonMarkers) return null;

  let start = null;
  let port = 5000;

  if (exists(projectPath, "manage.py")) {
    start = "python manage.py runserver";
    port = 8000;
  } else if (exists(projectPath, "app.py")) {
    start = "python app.py";
  } else if (exists(projectPath, "main.py")) {
    start = "python main.py";
  } else {
    return null;
  }

  // Prefer venv python on Windows/Unix if present
  const venvPythonWin = path.join(
    projectPath,
    ".venv",
    "Scripts",
    "python.exe",
  );
  const venvPythonUnix = path.join(projectPath, ".venv", "bin", "python");
  if (fs.existsSync(venvPythonWin)) {
    start = start.replace(/^python\b/, `"${venvPythonWin}"`);
  } else if (fs.existsSync(venvPythonUnix)) {
    start = start.replace(/^python\b/, `"${venvPythonUnix}"`);
  }

  return {
    name: folderName,
    type: "python",
    start,
    stop: null,
    port,
    cwd: ".",
  };
};

/**
 * Infer runnable config when project.config.json is absent.
 * Priority: docker → laravel → node/vue → python
 */
export const autoDetectConfig = (projectPath, folderName) => {
  const detectors = [detectDocker, detectLaravel, detectNode, detectPython];
  for (const detect of detectors) {
    const result = detect(projectPath, folderName);
    if (result) return result;
  }
  return null;
};
