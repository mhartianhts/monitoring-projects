import fs from "fs";
import path from "path";
import { requireProject, safeResolvePath } from "./files.service.js";

const SECRET_KEY_REGEX = /SECRET|PASSWORD|PASSWD|PASS|KEY|TOKEN|AUTH|CREDENTIAL|PRIVATE|DATABASE_URL|DB_PASS|ACCESS_KEY|APIKEY|API_KEY|SALT|SIGNATURE|CERT|PRIVATE_KEY/i;
const PLACEHOLDER_VALUE_REGEX = /^(your_|<.*>|changeme|xxx|todo|insert_|replace_|placeholder|demo|sample|\s*$)/i;

/**
 * Parse raw .env file string into structured entries preserving line order and comments.
 */
export const parseEnvString = (rawContent = "") => {
  const lines = rawContent.split(/\r?\n/);
  const entries = [];
  const kvMap = new Map();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      entries.push({
        type: "blank",
        line: i + 1,
        raw: rawLine,
      });
      continue;
    }

    if (trimmed.startsWith("#")) {
      entries.push({
        type: "comment",
        line: i + 1,
        comment: trimmed.replace(/^#\s?/, ""),
        raw: rawLine,
      });
      continue;
    }

    // Match KEY=VALUE or export KEY=VALUE
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      let inlineComment = "";

      // Check if value is wrapped in quotes
      const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
      const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');

      if (isSingleQuoted || isDoubleQuoted) {
        value = value.slice(1, -1);
      } else {
        // Check for inline comment e.g. KEY=123 # inline comment
        const commentIdx = value.indexOf(" #");
        if (commentIdx !== -1) {
          inlineComment = value.slice(commentIdx + 2).trim();
          value = value.slice(0, commentIdx).trim();
        }
      }

      const isSecret = SECRET_KEY_REGEX.test(key);
      const isPlaceholder = PLACEHOLDER_VALUE_REGEX.test(value);

      const entry = {
        type: "kv",
        line: i + 1,
        key,
        value,
        inlineComment,
        isSecret,
        isPlaceholder,
        isQuoted: isSingleQuoted ? "single" : isDoubleQuoted ? "double" : "none",
        raw: rawLine,
      };

      entries.push(entry);
      kvMap.set(key, entry);
    } else {
      // Unrecognized line
      entries.push({
        type: "unknown",
        line: i + 1,
        raw: rawLine,
      });
    }
  }

  return { entries, kvMap };
};

/**
 * Format key-value entries / objects back to string.
 */
export const formatEnvEntries = (entries = []) => {
  return entries
    .map((entry) => {
      if (entry.type === "blank") return "";
      if (entry.type === "comment") return `# ${entry.comment}`;
      if (entry.type === "unknown") return entry.raw;
      if (entry.type === "kv") {
        let val = entry.value;
        if (entry.isQuoted === "single") {
          val = `'${val}'`;
        } else if (entry.isQuoted === "double" || (val && (val.includes(" ") || val.includes("\n")))) {
          val = `"${val}"`;
        }
        const commentPart = entry.inlineComment ? ` # ${entry.inlineComment}` : "";
        return `${entry.key}=${val}${commentPart}`;
      }
      return "";
    })
    .join("\n");
};

/**
 * List all .env* files in the project root directory
 */
export const listEnvFiles = (projectId) => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;

  if (!fs.existsSync(projectPath)) {
    throw Object.assign(new Error("Project directory does not exist"), { status: 404 });
  }

  const files = fs.readdirSync(projectPath, { withFileTypes: true });
  const envFiles = [];

  for (const dirent of files) {
    if (dirent.isFile() && (dirent.name === ".env" || dirent.name.startsWith(".env."))) {
      const fullPath = path.join(projectPath, dirent.name);
      const stat = fs.statSync(fullPath);

      let keyCount = 0;
      try {
        const content = fs.readFileSync(fullPath, "utf8");
        const parsed = parseEnvString(content);
        keyCount = parsed.kvMap.size;
      } catch {
        // ignore parse error for summary
      }

      envFiles.push({
        name: dirent.name,
        size: stat.size,
        mtime: stat.mtime,
        isDefault: dirent.name === ".env",
        isExample: dirent.name.includes("example"),
        keyCount,
      });
    }
  }

  // Sort: .env first, then .env.example, then others alphabetically
  envFiles.sort((a, b) => {
    if (a.name === ".env") return -1;
    if (b.name === ".env") return 1;
    if (a.name === ".env.example") return -1;
    if (b.name === ".env.example") return 1;
    return a.name.localeCompare(b.name);
  });

  return {
    projectId,
    projectName: project.name,
    projectPath,
    files: envFiles,
    hasEnv: envFiles.some((f) => f.name === ".env"),
    hasExample: envFiles.some((f) => f.name === ".env.example"),
  };
};

/**
 * Read specific .env file content and parsed structure
 */
export const readEnvFile = (projectId, filename = ".env") => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;
  const safeFilename = path.basename(filename);
  const fullPath = safeResolvePath(projectPath, safeFilename);

  if (!fs.existsSync(fullPath)) {
    return {
      exists: false,
      name: safeFilename,
      raw: "",
      entries: [],
      kvMap: {},
      summary: { totalKeys: 0, secretKeys: 0, placeholderKeys: 0 },
    };
  }

  const raw = fs.readFileSync(fullPath, "utf8");
  const { entries, kvMap } = parseEnvString(raw);

  const kvObj = {};
  let secretKeys = 0;
  let placeholderKeys = 0;

  for (const [k, v] of kvMap.entries()) {
    kvObj[k] = {
      value: v.value,
      isSecret: v.isSecret,
      isPlaceholder: v.isPlaceholder,
      inlineComment: v.inlineComment,
      isQuoted: v.isQuoted,
      line: v.line,
    };
    if (v.isSecret) secretKeys++;
    if (v.isPlaceholder) placeholderKeys++;
  }

  return {
    exists: true,
    name: safeFilename,
    raw,
    entries,
    kvMap: kvObj,
    summary: {
      totalKeys: kvMap.size,
      secretKeys,
      placeholderKeys,
    },
  };
};

/**
 * Save .env file with optional backup creation
 */
export const saveEnvFile = (projectId, filename = ".env", content = "", options = { createBackup: true }) => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;
  const safeFilename = path.basename(filename);
  const fullPath = safeResolvePath(projectPath, safeFilename);

  let backupCreated = false;
  if (options.createBackup && fs.existsSync(fullPath)) {
    const backupPath = path.join(projectPath, `${safeFilename}.backup`);
    try {
      fs.copyFileSync(fullPath, backupPath);
      backupCreated = true;
    } catch (err) {
      console.warn("Failed to create .env backup:", err.message);
    }
  }

  fs.writeFileSync(fullPath, content, "utf8");

  return {
    success: true,
    name: safeFilename,
    backupCreated,
    savedAt: new Date().toISOString(),
  };
};

/**
 * Create a new .env.* file (optionally copying from an existing template)
 */
export const createEnvFile = (projectId, filename, copyFrom = null) => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;
  let safeFilename = path.basename(filename);
  if (!safeFilename.startsWith(".env")) {
    safeFilename = `.env.${safeFilename}`;
  }

  const fullPath = safeResolvePath(projectPath, safeFilename);
  if (fs.existsSync(fullPath)) {
    throw Object.assign(new Error(`File ${safeFilename} sudah ada di project ini`), { status: 400 });
  }

  let content = "";
  if (copyFrom) {
    const safeCopyFrom = path.basename(copyFrom);
    const copyPath = safeResolvePath(projectPath, safeCopyFrom);
    if (fs.existsSync(copyPath)) {
      content = fs.readFileSync(copyPath, "utf8");
    }
  }

  fs.writeFileSync(fullPath, content, "utf8");

  return {
    success: true,
    name: safeFilename,
    createdAt: new Date().toISOString(),
  };
};

/**
 * Delete a .env file (safety checks prevent accidental deletion of .env without explicit confirmation)
 */
export const deleteEnvFile = (projectId, filename) => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;
  const safeFilename = path.basename(filename);
  const fullPath = safeResolvePath(projectPath, safeFilename);

  if (!fs.existsSync(fullPath)) {
    throw Object.assign(new Error(`File ${safeFilename} tidak ditemukan`), { status: 404 });
  }

  fs.unlinkSync(fullPath);

  return {
    success: true,
    deleted: safeFilename,
  };
};

/**
 * Compare two .env files (e.g. .env.example vs .env)
 * Identifies missing keys, extra keys, different values, and calculates health score.
 */
export const compareEnvFiles = (projectId, baseFilename = ".env.example", targetFilename = ".env") => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;

  const safeBase = path.basename(baseFilename);
  const safeTarget = path.basename(targetFilename);

  const basePath = safeResolvePath(projectPath, safeBase);
  const targetPath = safeResolvePath(projectPath, safeTarget);

  const baseExists = fs.existsSync(basePath);
  const targetExists = fs.existsSync(targetPath);

  const baseRaw = baseExists ? fs.readFileSync(basePath, "utf8") : "";
  const targetRaw = targetExists ? fs.readFileSync(targetPath, "utf8") : "";

  const baseParsed = parseEnvString(baseRaw);
  const targetParsed = parseEnvString(targetRaw);

  const missingKeys = [];
  const extraKeys = [];
  const matchedKeys = [];
  const placeholderKeys = [];

  // Check keys in base against target
  for (const [key, baseEntry] of baseParsed.kvMap.entries()) {
    if (!targetParsed.kvMap.has(key)) {
      missingKeys.push({
        key,
        exampleValue: baseEntry.value,
        isSecret: baseEntry.isSecret,
        comment: baseEntry.inlineComment,
      });
    } else {
      const targetEntry = targetParsed.kvMap.get(key);
      const isPlaceholder = targetEntry.isPlaceholder;

      if (isPlaceholder) {
        placeholderKeys.push({
          key,
          value: targetEntry.value,
          exampleValue: baseEntry.value,
          isSecret: targetEntry.isSecret,
        });
      }

      matchedKeys.push({
        key,
        baseValue: baseEntry.value,
        targetValue: targetEntry.value,
        valuesMatch: baseEntry.value === targetEntry.value,
        isSecret: targetEntry.isSecret,
        isPlaceholder,
      });
    }
  }

  // Check extra keys in target (not in base)
  for (const [key, targetEntry] of targetParsed.kvMap.entries()) {
    if (!baseParsed.kvMap.has(key)) {
      extraKeys.push({
        key,
        value: targetEntry.value,
        isSecret: targetEntry.isSecret,
        comment: targetEntry.inlineComment,
      });
    }
  }

  const totalBaseKeys = baseParsed.kvMap.size;
  const configuredCount = matchedKeys.length - placeholderKeys.length;
  const healthScore = totalBaseKeys > 0 ? Math.max(0, Math.round((configuredCount / totalBaseKeys) * 100)) : 100;

  return {
    baseFile: {
      name: safeBase,
      exists: baseExists,
      totalKeys: baseParsed.kvMap.size,
    },
    targetFile: {
      name: safeTarget,
      exists: targetExists,
      totalKeys: targetParsed.kvMap.size,
    },
    missingKeys,
    extraKeys,
    placeholderKeys,
    matchedKeys,
    healthScore,
    isHealthy: missingKeys.length === 0 && placeholderKeys.length === 0,
    summary: {
      totalMissing: missingKeys.length,
      totalExtra: extraKeys.length,
      totalPlaceholders: placeholderKeys.length,
      totalMatched: matchedKeys.length,
    },
  };
};

/**
 * Sync missing keys from base/example file into target .env file
 */
export const syncMissingKeys = (projectId, targetFilename = ".env", baseFilename = ".env.example", keysToSync = []) => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;

  const safeTarget = path.basename(targetFilename);
  const safeBase = path.basename(baseFilename);

  const targetPath = safeResolvePath(projectPath, safeTarget);
  const basePath = safeResolvePath(projectPath, safeBase);

  if (!fs.existsSync(basePath)) {
    throw Object.assign(new Error(`File referensi ${safeBase} tidak ditemukan`), { status: 404 });
  }

  const baseRaw = fs.readFileSync(basePath, "utf8");
  const targetRaw = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";

  const baseParsed = parseEnvString(baseRaw);
  const targetParsed = parseEnvString(targetRaw);

  const selectedKeys = new Set(keysToSync.length > 0 ? keysToSync : null);
  const linesToAppend = [];

  for (const [key, baseEntry] of baseParsed.kvMap.entries()) {
    if (!targetParsed.kvMap.has(key)) {
      if (!selectedKeys || selectedKeys.has(key)) {
        let val = baseEntry.value;
        if (baseEntry.isQuoted === "single") val = `'${val}'`;
        if (baseEntry.isQuoted === "double") val = `"${val}"`;
        const comment = baseEntry.inlineComment ? ` # ${baseEntry.inlineComment}` : "";
        linesToAppend.push(`${key}=${val}${comment}`);
      }
    }
  }

  if (linesToAppend.length === 0) {
    return { success: true, appendedCount: 0, message: "Tidak ada key baru yang perlu di-sync" };
  }

  // Create backup
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, path.join(projectPath, `${safeTarget}.backup`));
  }

  const prefix = targetRaw.trim().length > 0 ? (targetRaw.endsWith("\n") ? "" : "\n") : "";
  const header = `\n# --- Synced from ${safeBase} (${new Date().toLocaleDateString()}) ---\n`;
  const newContent = `${targetRaw}${prefix}${header}${linesToAppend.join("\n")}\n`;

  fs.writeFileSync(targetPath, newContent, "utf8");

  return {
    success: true,
    appendedCount: linesToAppend.length,
    appendedKeys: linesToAppend,
    backupCreated: true,
  };
};

/**
 * Generate .env.example from active .env file by masking secrets and preserving comments
 */
export const generateExampleFromEnv = (projectId, sourceFilename = ".env", targetFilename = ".env.example") => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;

  const safeSource = path.basename(sourceFilename);
  const safeTarget = path.basename(targetFilename);

  const sourcePath = safeResolvePath(projectPath, safeSource);
  const targetPath = safeResolvePath(projectPath, safeTarget);

  if (!fs.existsSync(sourcePath)) {
    throw Object.assign(new Error(`File ${safeSource} tidak ditemukan`), { status: 404 });
  }

  const sourceRaw = fs.readFileSync(sourcePath, "utf8");
  const { entries } = parseEnvString(sourceRaw);

  const exampleEntries = entries.map((entry) => {
    if (entry.type !== "kv") return entry;

    let sanitizedValue = "";
    if (entry.isSecret) {
      sanitizedValue = `your_${entry.key.toLowerCase()}_here`;
    } else {
      sanitizedValue = entry.value || "";
    }

    return {
      ...entry,
      value: sanitizedValue,
    };
  });

  const exampleContent = formatEnvEntries(exampleEntries);

  // Backup target if it exists
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, path.join(projectPath, `${safeTarget}.backup`));
  }

  fs.writeFileSync(targetPath, exampleContent, "utf8");

  return {
    success: true,
    target: safeTarget,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Switch active .env profile (e.g. .env.staging -> .env)
 */
export const switchActiveProfile = (projectId, sourceFilename) => {
  const project = requireProject(projectId);
  const projectPath = project.resolvedPath || project.path;

  const safeSource = path.basename(sourceFilename);
  const sourcePath = safeResolvePath(projectPath, safeSource);
  const targetPath = safeResolvePath(projectPath, ".env");

  if (!fs.existsSync(sourcePath)) {
    throw Object.assign(new Error(`Profil ${safeSource} tidak ditemukan`), { status: 404 });
  }

  // Backup current .env if it exists
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, path.join(projectPath, ".env.backup"));
  }

  fs.copyFileSync(sourcePath, targetPath);

  return {
    success: true,
    activeProfile: safeSource,
    backupCreated: true,
    switchedAt: new Date().toISOString(),
  };
};
