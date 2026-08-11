import fs from "node:fs";
import path from "node:path";
import { findProject } from "./projectDiscovery.service.js";
import { getGitDiffSummary, getGitStatus } from "./git.service.js";
import { getProjectFileTree } from "./files.service.js";
import { formatMemoryForContext } from "./aiMemory.service.js";

const formatLogs = (logs = [], limit = 80) => {
  const slice = logs.slice(-limit);
  if (slice.length === 0) return "(tidak ada log tersimpan untuk project ini)";
  return slice
    .map((entry) => {
      const stream = entry.stream || "stdout";
      return `[${stream}] ${entry.line}`;
    })
    .join("\n");
};

const flattenFileTree = (nodes = [], maxLines = 100) => {
  const lines = [];
  const walk = (items, currentIndent) => {
    for (const item of items) {
      if (lines.length >= maxLines) break;
      const isDir = item.type === "directory";
      lines.push(`${currentIndent}${isDir ? "📁" : "📄"} ${item.path}`);
      if (isDir && Array.isArray(item.children)) {
        walk(item.children, `${currentIndent}  `);
      }
    }
  };
  walk(nodes, "");
  if (lines.length >= maxLines) {
    lines.push("  ... [beberapa file lainnya disembunyikan]");
  }
  return lines.join("\n");
};

export const requireProjectOrThrow = (projectId) => {
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

export const buildProjectAiContext = async (
  project,
  processManager,
  { includeLogs = true, includeGit = true, logLimit = 80 } = {},
) => {
  const enriched = processManager.enrichProject(project);
  const sections = [];

  sections.push(
    [
      "## Active project",
      `- id: ${enriched.id}`,
      `- name: ${enriched.name}`,
      `- path: ${enriched.path}`,
      `- type: ${enriched.type}`,
      `- status: ${enriched.status}`,
      `- port: ${enriched.port ?? "n/a"}`,
      `- pid: ${enriched.pid ?? "n/a"}`,
      `- start: ${enriched.start ?? "n/a"}`,
      `- hasConfig: ${enriched.hasConfig}`,
      `- configSource: ${enriched.configSource ?? "n/a"}`,
      `- favorite: ${Boolean(enriched.favorite)}`,
    ].join("\n"),
  );

  // Project Memory Context
  try {
    const memoryText = await formatMemoryForContext(enriched.id);
    if (memoryText) {
      sections.push(memoryText);
    }
  } catch {
    // ignore memory error
  }

  // File Tree Context
  try {
    const treeData = await getProjectFileTree(enriched.path, 3);
    if (treeData && treeData.length > 0) {
      const treeText = flattenFileTree(treeData, 100);
      sections.push(`## Project File Structure\n${treeText}`);
    }
  } catch {
    // ignore tree error
  }

  // Package.json Context if present
  const pkgPath = path.join(enriched.path, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw);
      const pkgSummary = [
        pkg.name ? `- name: ${pkg.name}` : null,
        pkg.scripts ? `- scripts: ${Object.keys(pkg.scripts).join(", ")}` : null,
        pkg.dependencies ? `- dependencies: ${Object.keys(pkg.dependencies).join(", ")}` : null,
      ].filter(Boolean).join("\n");
      if (pkgSummary) {
        sections.push(`## package.json Manifest\n${pkgSummary}`);
      }
    } catch {
      // ignore
    }
  }

  if (includeLogs) {
    const logs = processManager.getLogs(enriched.id, logLimit);
    sections.push(
      `## Recent logs (last ${logs.length})\n${formatLogs(logs, logLimit)}`,
    );
  }

  let git = null;
  let diff = null;
  if (includeGit) {
    git = await getGitStatus(enriched.path);
    sections.push(
      [
        "## Git status",
        `- isRepo: ${git.isRepo}`,
        `- branch: ${git.branch ?? "n/a"}`,
        `- dirty: ${git.dirty}`,
        `- ahead/behind: ${git.ahead}/${git.behind}`,
        `- remote: ${git.remote ?? "n/a"}`,
        `- changedFiles:`,
        git.changedFiles.length
          ? git.changedFiles.map((f) => `  - ${f}`).join("\n")
          : "  - (none)",
      ].join("\n"),
    );

    if (git.isRepo && git.dirty) {
      diff = await getGitDiffSummary(enriched.path, { maxChars: 10000 });
      if (diff.stat) {
        sections.push(`## Git diff --stat\n${diff.stat}`);
      }
      if (diff.diff) {
        sections.push(`## Git diff (truncated)\n${diff.diff}`);
      }
    }
  }

  return {
    project: enriched,
    git,
    diff,
    contextText: sections.join("\n\n"),
  };
};
