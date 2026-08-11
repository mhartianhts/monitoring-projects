import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const ragCacheDir = path.join(dataDir, "rag-cache");

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

const CODE_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".vue",
  ".jsx",
  ".tsx",
  ".py",
  ".php",
  ".go",
  ".java",
  ".sql",
  ".json",
  ".html",
  ".css",
]);

const ensureDir = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(ragCacheDir)) {
    fs.mkdirSync(ragCacheDir, { recursive: true });
  }
};

const safeRagFileName = (projectPath) => {
  const safe = String(projectPath || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${(safe || "unknown").slice(0, 180)}.json`;
};

const getCachePath = (projectPath) =>
  path.join(ragCacheDir, safeRagFileName(projectPath));

// Split file into chunks (~40 lines each with 5 lines overlap)
const chunkFileContent = (relPath, content, chunkSize = 40, overlap = 5) => {
  const lines = content.split("\n");
  if (lines.length <= chunkSize) {
    return [
      {
        path: relPath,
        startLine: 1,
        endLine: lines.length,
        content: content.slice(0, 4000),
      },
    ];
  }

  const chunks = [];
  let start = 0;
  while (start < lines.length) {
    const end = Math.min(start + chunkSize, lines.length);
    const chunkLines = lines.slice(start, end);
    chunks.push({
      path: relPath,
      startLine: start + 1,
      endLine: end,
      content: chunkLines.join("\n").slice(0, 4000),
    });
    start += chunkSize - overlap;
  }

  return chunks;
};

// Build index of all code chunks in project
export const buildCodebaseIndex = async (projectPath) => {
  if (!projectPath || !fs.existsSync(projectPath)) return [];

  const chunks = [];

  const traverse = (dir) => {
    let items = [];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Prioritize source folders
    items.sort((a, b) => {
      const priority = ["src", "app", "lib", "controllers", "services", "models", "routes"];
      const aIdx = priority.indexOf(a.name.toLowerCase());
      const bIdx = priority.indexOf(b.name.toLowerCase());
      if (aIdx !== -1 && bIdx === -1) return -1;
      if (aIdx === -1 && bIdx !== -1) return 1;
      return 0;
    });

    for (const item of items) {
      if (IGNORE_DIRS.has(item.name)) continue;

      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        traverse(fullPath);
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 500 * 1024) continue; // Skip huge files >500KB

          const relPath = path.relative(projectPath, fullPath).replace(/\\/g, "/");
          const content = fs.readFileSync(fullPath, "utf-8");
          const fileChunks = chunkFileContent(relPath, content);
          chunks.push(...fileChunks);
        } catch {
          // ignore read fail
        }
      }
    }
  };

  traverse(projectPath);
  return chunks;
};

// Simple & efficient BM25 / TF-IDF Relevance Scoring
const tokenize = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

export const searchCodebaseRAG = async (projectPath, query, topK = 4) => {
  if (!projectPath || !query || typeof query !== "string") return [];

  ensureDir();
  const cacheFile = getCachePath(projectPath);

  let chunks = [];
  try {
    if (fs.existsSync(cacheFile)) {
      const raw = fs.readFileSync(cacheFile, "utf-8");
      const cached = JSON.parse(raw);
      // Cache valid for 5 minutes
      if (Date.now() - cached.timestamp < 300000 && Array.isArray(cached.chunks)) {
        chunks = cached.chunks;
      }
    }
  } catch {
    // ignore
  }

  if (chunks.length === 0) {
    chunks = await buildCodebaseIndex(projectPath);
    try {
      fs.writeFileSync(
        cacheFile,
        JSON.stringify({ timestamp: Date.now(), chunks }, null, 2),
        "utf-8",
      );
    } catch {
      // ignore
    }
  }

  if (chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored = chunks.map((chunk) => {
    const contentTokens = tokenize(chunk.content);
    const pathTokens = tokenize(chunk.path);
    let score = 0;

    for (const qToken of queryTokens) {
      // Match in path gets higher weight (x3)
      for (const pToken of pathTokens) {
        if (pToken.includes(qToken) || qToken.includes(pToken)) {
          score += 3;
        }
      }

      // Match in content
      for (const cToken of contentTokens) {
        if (cToken === qToken) {
          score += 1;
        } else if (cToken.includes(qToken)) {
          score += 0.5;
        }
      }
    }

    // Boost files in src/ or controllers/ or services/
    if (chunk.path.startsWith("src/") || chunk.path.startsWith("controllers/") || chunk.path.startsWith("services/")) {
      score *= 1.2;
    }

    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const topMatches = scored.filter((c) => c.score > 0).slice(0, topK);
  return topMatches;
};
