import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const runtimePath = path.join(dataDir, "runtime.json");

const emptyStore = () => ({ processes: {} });

const ensureStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(runtimePath)) {
    fs.writeFileSync(
      runtimePath,
      JSON.stringify(emptyStore(), null, 2),
      "utf8",
    );
  }
};

export const isPidAlive = (pid) => {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
};

export const readRuntimeStore = () => {
  ensureStore();
  try {
    const raw = fs.readFileSync(runtimePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const processes =
      parsed && typeof parsed.processes === "object" && parsed.processes
        ? parsed.processes
        : {};
    return { processes };
  } catch {
    return emptyStore();
  }
};

const writeRuntimeStore = (store) => {
  ensureStore();
  fs.writeFileSync(runtimePath, JSON.stringify(store, null, 2), "utf8");
};

export const saveRuntimeEntry = (projectId, entry) => {
  const store = readRuntimeStore();
  store.processes[projectId] = {
    pid: entry.pid,
    startedAt: entry.startedAt,
    start: entry.start || null,
    type: entry.type || null,
    path: entry.path || null,
    port: entry.port ?? null,
  };
  writeRuntimeStore(store);
};

export const removeRuntimeEntry = (projectId) => {
  const store = readRuntimeStore();
  if (!(projectId in store.processes)) return;
  delete store.processes[projectId];
  writeRuntimeStore(store);
};

export const clearRuntimeStore = () => {
  writeRuntimeStore(emptyStore());
};
