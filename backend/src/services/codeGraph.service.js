import fs from "node:fs";
import path from "node:path";
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

const CODE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".vue",
  ".jsx",
  ".tsx",
  ".json",
]);

// Classify layer based on file path or conventions
const classifyLayer = (relPath) => {
  const norm = relPath.replace(/\\/g, "/").toLowerCase();

  if (norm.includes("route") || norm.includes("/api/") || norm.includes("endpoints")) {
    return "route";
  }
  if (norm.includes("controller") || norm.includes("/handlers/")) {
    return "controller";
  }
  if (norm.includes("service") || norm.includes("/usecases/") || norm.includes("/use-cases/")) {
    return "service";
  }
  if (norm.includes("model") || norm.includes("entity") || norm.includes("schema") || norm.includes("/entities/")) {
    return "model";
  }
  if (norm.includes("middleware") || norm.includes("/guards/")) {
    return "middleware";
  }
  if (norm.includes("component") || norm.includes("view") || norm.includes("page") || norm.endsWith(".vue") || norm.endsWith(".tsx") || norm.endsWith(".jsx")) {
    return "component";
  }
  if (norm.includes("config") || norm.includes("env") || norm.includes("constant")) {
    return "config";
  }
  if (norm.includes("util") || norm.includes("helper") || norm.includes("lib/") || norm.includes("composable") || norm.includes("hook")) {
    return "util";
  }
  if (norm.includes("store") || norm.includes("redux") || norm.includes("pinia")) {
    return "store";
  }
  if (norm.includes("test") || norm.includes("spec") || norm.includes("__tests__")) {
    return "test";
  }

  return "other";
};

// Regex patterns to capture imports
const IMPORT_PATTERNS = [
  /import\s+(?:(?:[\w*\s{},$]+)\s+from\s+)?['"]([^'"]+)['"]/g,
  /export\s+(?:(?:[\w*\s{},$]+)\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/**
 * Scan directory recursively for code files
 */
const scanDirectory = (dir, rootDir, collected = []) => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(rootDir, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        scanDirectory(fullPath, rootDir, collected);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
          let sizeBytes = 0;
          let linesCount = 0;
          try {
            const stat = fs.statSync(fullPath);
            sizeBytes = stat.size;
            // Only read content for files < 1MB
            if (sizeBytes < 1024 * 1024) {
              const content = fs.readFileSync(fullPath, "utf-8");
              linesCount = content.split("\n").length;
            }
          } catch {}

          collected.push({
            id: relPath,
            name: path.basename(relPath),
            fullPath,
            relPath,
            ext,
            sizeBytes,
            linesCount,
            layer: classifyLayer(relPath),
          });
        }
      }
    }
  } catch {}
  return collected;
};

/**
 * Resolve relative import path to matched file node
 */
const resolveImport = (importPath, fromRelPath, fileMap) => {
  // Ignore external libraries (not starting with . or /)
  if (!importPath.startsWith(".") && !importPath.startsWith("/") && !importPath.startsWith("@/")) {
    return null;
  }

  const fromDir = path.dirname(fromRelPath);
  let candidateRel = "";

  if (importPath.startsWith("@/")) {
    candidateRel = importPath.replace(/^@\//, "src/");
  } else {
    candidateRel = path.normalize(path.join(fromDir, importPath)).replace(/\\/g, "/");
  }

  // Exact match
  if (fileMap.has(candidateRel)) return candidateRel;

  // Try common extensions
  const extensions = [".js", ".ts", ".vue", ".jsx", ".tsx", ".mjs", ".json", "/index.js", "/index.ts", "/index.vue"];
  for (const ext of extensions) {
    const withExt = candidateRel + ext;
    if (fileMap.has(withExt)) return withExt;
  }

  return null;
};

/**
 * Detect circular dependency cycles in graph
 */
const detectCycles = (nodes, edges) => {
  const adj = new Map();
  for (const n of nodes) {
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (adj.has(e.source)) {
      adj.get(e.source).push(e.target);
    }
  }

  const visited = new Set();
  const recStack = new Set();
  const cycles = [];

  const dfs = (nodeId, currentPath = []) => {
    visited.add(nodeId);
    recStack.add(nodeId);
    currentPath.push(nodeId);

    const neighbors = adj.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...currentPath]);
      } else if (recStack.has(neighbor)) {
        const cycleStartIndex = currentPath.indexOf(neighbor);
        if (cycleStartIndex >= 0) {
          cycles.push([...currentPath.slice(cycleStartIndex), neighbor]);
        }
      }
    }

    recStack.delete(nodeId);
  };

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      dfs(n.id, []);
    }
  }

  return cycles.slice(0, 10); // cap top 10 cycles
};

/**
 * Build Full Codebase Graph
 */
export const buildCodeGraph = (projectId) => {
  const project = findProject(projectId);
  if (!project) {
    throw Object.assign(new Error("Project not found"), { status: 404 });
  }

  const rootDir = project.path || project.dir || project.cwdPath;
  const rawFiles = scanDirectory(rootDir, rootDir);
  const fileMap = new Map();

  for (const f of rawFiles) {
    fileMap.set(f.relPath, f);
  }

  const nodes = [];
  const edges = [];
  const edgeSet = new Set();
  const inDegree = new Map();
  const outDegree = new Map();

  for (const f of rawFiles) {
    inDegree.set(f.relPath, 0);
    outDegree.set(f.relPath, 0);
  }

  // Parse imports for each file
  for (const f of rawFiles) {
    let content = "";
    try {
      if (f.sizeBytes < 1024 * 1024) {
        content = fs.readFileSync(f.fullPath, "utf-8");
      }
    } catch {}

    const imports = new Set();

    if (content) {
      for (const pattern of IMPORT_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const importStr = match[1];
          if (importStr) {
            const resolved = resolveImport(importStr, f.relPath, fileMap);
            if (resolved && resolved !== f.relPath) {
              imports.add(resolved);
            }
          }
        }
      }
    }

    for (const targetId of imports) {
      const edgeKey = `${f.relPath}->${targetId}`;
      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey);
        edges.push({
          id: edgeKey,
          source: f.relPath,
          target: targetId,
          sourceLayer: f.layer,
          targetLayer: fileMap.get(targetId)?.layer || "other",
        });

        outDegree.set(f.relPath, (outDegree.get(f.relPath) || 0) + 1);
        inDegree.set(targetId, (inDegree.get(targetId) || 0) + 1);
      }
    }
  }

  // Assemble node objects with degree stats & orphan detection
  for (const f of rawFiles) {
    const inCount = inDegree.get(f.relPath) || 0;
    const outCount = outDegree.get(f.relPath) || 0;
    const isEntry = f.relPath.includes("server") || f.relPath.includes("app") || f.relPath.includes("main") || f.relPath.includes("index");
    const isOrphan = inCount === 0 && !isEntry && f.layer !== "route" && f.layer !== "config";

    nodes.push({
      id: f.relPath,
      name: f.name,
      relPath: f.relPath,
      layer: f.layer,
      ext: f.ext,
      linesCount: f.linesCount,
      sizeBytes: f.sizeBytes,
      inDegree: inCount,
      outDegree: outCount,
      isOrphan,
      isEntry,
    });
  }

  // Detect circular dependencies
  const cycles = detectCycles(nodes, edges);

  // Layer statistics breakdown
  const layerCounts = {
    route: 0,
    controller: 0,
    service: 0,
    model: 0,
    middleware: 0,
    component: 0,
    store: 0,
    util: 0,
    config: 0,
    test: 0,
    other: 0,
  };

  let totalLines = 0;
  for (const n of nodes) {
    totalLines += n.linesCount || 0;
    if (layerCounts[n.layer] !== undefined) {
      layerCounts[n.layer]++;
    } else {
      layerCounts.other++;
    }
  }

  const orphanCount = nodes.filter((n) => n.isOrphan).length;
  const healthScore = Math.max(
    10,
    Math.min(100, Math.round(100 - (cycles.length * 8 + orphanCount * 1.5)))
  );

  return {
    projectId,
    projectName: project.name,
    projectType: project.type,
    nodes,
    edges,
    stats: {
      totalFiles: nodes.length,
      totalConnections: edges.length,
      totalLines,
      healthScore,
      orphanCount,
      circularCyclesCount: cycles.length,
      cycles,
      layerCounts,
    },
  };
};
