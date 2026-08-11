import fs from "fs";
import path from "path";
import { findProject } from "./projectDiscovery.service.js";

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".agents",
  ".claude",
  ".github",
  "dist",
  "build",
  ".cache",
  ".next",
  ".output",
  "coverage",
  "tmp",
  ".vscode",
  ".idea",
  "vendor",
  "docs",
  "data",
  "logs",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".mp3",
  ".mp4",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

export const isPathInside = (parentPath, targetPath) => {
  const relative = path.relative(parentPath, targetPath);
  return (
    relative &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
};

export const requireProject = (projectId) => {
  const id = String(projectId || "").trim();
  if (!id) {
    throw Object.assign(new Error("Field projectId wajib diisi"), {
      status: 400,
    });
  }
  const project = findProject(id);
  if (!project) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }
  return project;
};

export const safeResolvePath = (projectPath, relativePath = "") => {
  const normalizedRel = path.normalize(String(relativePath || ""));
  const fullPath = path.resolve(projectPath, normalizedRel);
  if (fullPath !== projectPath && !isPathInside(projectPath, fullPath)) {
    throw Object.assign(new Error("Akses di luar direktori project tidak diizinkan"), {
      status: 403,
    });
  }
  return fullPath;
};

export const getProjectFileTree = async (projectPath, maxDepth = 6) => {
  const buildTree = (dirPath, currentDepth = 0) => {
    if (currentDepth > maxDepth) return [];
    let items = [];
    try {
      items = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes = [];
    for (const item of items) {
      if (IGNORE_DIRS.has(item.name) || item.name.startsWith(".DS_Store")) {
        continue;
      }
      const fullPath = path.join(dirPath, item.name);
      const relativePath = path.relative(projectPath, fullPath).replace(/\\/g, "/");

      if (item.isDirectory()) {
        const children = buildTree(fullPath, currentDepth + 1);
        nodes.push({
          name: item.name,
          path: relativePath,
          type: "directory",
          children,
        });
      } else if (item.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch {
          // ignore stat error
        }
        nodes.push({
          name: item.name,
          path: relativePath,
          type: "file",
          size,
        });
      }
    }

    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return nodes;
  };

  return {
    rootName: path.basename(projectPath),
    tree: buildTree(projectPath),
  };
};

export const readProjectFile = async (projectPath, relativePath) => {
  if (!relativePath) {
    throw Object.assign(new Error("Parameter path wajib diisi"), { status: 400 });
  }
  const fullPath = safeResolvePath(projectPath, relativePath);

  if (!fs.existsSync(fullPath)) {
    throw Object.assign(new Error(`File '${relativePath}' tidak ditemukan`), { status: 404 });
  }

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    throw Object.assign(new Error(`'${relativePath}' adalah direktori`), { status: 400 });
  }

  const ext = path.extname(fullPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return {
      path: relativePath.replace(/\\/g, "/"),
      isBinary: true,
      size: stat.size,
      content: "(File biner tidak dapat ditampilkan sebagai teks)",
    };
  }

  if (stat.size > 1024 * 1024) {
    return {
      path: relativePath.replace(/\\/g, "/"),
      isBinary: false,
      size: stat.size,
      content: "(Ukuran file terlalu besar, melebih batas 1MB)",
    };
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  return {
    path: relativePath.replace(/\\/g, "/"),
    isBinary: false,
    size: stat.size,
    content,
  };
};

export const searchProjectFiles = async (projectPath, query, maxResults = 50) => {
  if (!query || typeof query !== "string" || !query.trim()) {
    return [];
  }
  const searchTerm = query.trim().toLowerCase();
  const results = [];
  const visitedPaths = new Set();

  const searchDir = (dirPath) => {
    if (results.length >= maxResults * 2) return;
    let items = [];
    try {
      items = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort directories to prioritize source code folders first (src, app, lib, controllers, services, etc.)
    const SOURCE_PRIORITY_DIRS = new Set([
      "src",
      "app",
      "lib",
      "controllers",
      "services",
      "routes",
      "models",
      "backend",
      "frontend",
      "api",
    ]);

    items.sort((a, b) => {
      const aIsPri = SOURCE_PRIORITY_DIRS.has(a.name.toLowerCase());
      const bIsPri = SOURCE_PRIORITY_DIRS.has(b.name.toLowerCase());
      if (aIsPri && !bIsPri) return -1;
      if (!aIsPri && bIsPri) return 1;
      return 0;
    });

    for (const item of items) {
      if (results.length >= maxResults * 2) break;
      if (IGNORE_DIRS.has(item.name)) continue;

      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory()) {
        searchDir(fullPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        const relPath = path.relative(projectPath, fullPath).replace(/\\/g, "/");
        if (visitedPaths.has(relPath)) continue;

        // Check path match
        if (item.name.toLowerCase().includes(searchTerm) || relPath.toLowerCase().includes(searchTerm)) {
          visitedPaths.add(relPath);
          results.push({
            path: relPath,
            matchType: "filename",
            line: 1,
            content: `Filename match: ${item.name}`,
            isCodeFile: [".js", ".ts", ".vue", ".jsx", ".tsx", ".py", ".php", ".go", ".java"].includes(ext),
          });
        }

        // Check content match
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size < 500 * 1024) {
            const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (results.length >= maxResults * 2) break;
              if (lines[i].toLowerCase().includes(searchTerm)) {
                results.push({
                  path: relPath,
                  matchType: "content",
                  line: i + 1,
                  content: lines[i].trim(),
                  isCodeFile: [".js", ".ts", ".vue", ".jsx", ".tsx", ".py", ".php", ".go", ".java"].includes(ext),
                });
              }
            }
          }
        } catch {
          // ignore read errors
        }
      }
    }
  };

  searchDir(projectPath);

  // Sort results: prioritize source code files (src/) and .js/.ts/.vue over .md/.txt
  results.sort((a, b) => {
    const aInSrc = a.path.startsWith("src/") || a.path.startsWith("app/") || a.path.startsWith("backend/") || a.isCodeFile;
    const bInSrc = b.path.startsWith("src/") || b.path.startsWith("app/") || b.path.startsWith("backend/") || b.isCodeFile;
    if (aInSrc && !bInSrc) return -1;
    if (!aInSrc && bInSrc) return 1;

    if (a.matchType === "filename" && b.matchType !== "filename") return -1;
    if (a.matchType !== "filename" && b.matchType === "filename") return 1;

    return 0;
  });

  return results.slice(0, maxResults);
};

export const writeProjectFile = async (projectPath, relativePath, content) => {
  if (!relativePath) {
    throw Object.assign(new Error("Parameter path wajib diisi"), { status: 400 });
  }
  const fullPath = safeResolvePath(projectPath, relativePath);
  const dir = path.dirname(fullPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let originalContent = null;
  if (fs.existsSync(fullPath)) {
    try {
      originalContent = fs.readFileSync(fullPath, "utf-8");
    } catch {
      // ignore if non-readable
    }
  }

  fs.writeFileSync(fullPath, content, "utf-8");

  return {
    path: relativePath.replace(/\\/g, "/"),
    isNew: originalContent === null,
    originalContent,
    newContent: content,
  };
};

export const editProjectFile = async (
  projectPath,
  relativePath,
  targetContent,
  replacementContent
) => {
  if (!relativePath) {
    throw Object.assign(new Error("Parameter path wajib diisi"), { status: 400 });
  }
  const fileData = await readProjectFile(projectPath, relativePath);
  if (fileData.isBinary) {
    throw Object.assign(new Error("Tidak dapat merubah file biner"), { status: 400 });
  }

  const originalContent = fileData.content;
  if (!originalContent.includes(targetContent)) {
    throw Object.assign(
      new Error(`Teks yang ditargetkan tidak ditemukan di file '${relativePath}'`),
      { status: 400 }
    );
  }

  const newContent = originalContent.replace(targetContent, replacementContent);
  return await writeProjectFile(projectPath, relativePath, newContent);
};
