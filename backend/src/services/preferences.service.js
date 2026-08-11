import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const prefsPath = path.join(dataDir, "preferences.json");

const defaultPrefs = () => ({ favorites: [] });

const ensureStore = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(prefsPath)) {
    fs.writeFileSync(
      prefsPath,
      JSON.stringify(defaultPrefs(), null, 2),
      "utf8",
    );
  }
};

export const readPreferences = () => {
  ensureStore();
  try {
    const raw = fs.readFileSync(prefsPath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const favorites = Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((id) => typeof id === "string")
      : [];
    return { favorites };
  } catch {
    return defaultPrefs();
  }
};

const writePreferences = (prefs) => {
  ensureStore();
  fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2), "utf8");
};

export const isFavorite = (projectId) => {
  return readPreferences().favorites.includes(projectId);
};

/** Tambah ke favorites tanpa toggle (idempotent). */
export const ensureFavorite = (projectId) => {
  const prefs = readPreferences();
  if (prefs.favorites.includes(projectId)) return prefs.favorites;
  const next = { favorites: [...prefs.favorites, projectId] };
  writePreferences(next);
  return next.favorites;
};

export const toggleFavorite = (projectId) => {
  const prefs = readPreferences();
  const set = new Set(prefs.favorites);
  if (set.has(projectId)) set.delete(projectId);
  else set.add(projectId);
  const next = { favorites: [...set] };
  writePreferences(next);
  return {
    projectId,
    favorite: set.has(projectId),
    favorites: next.favorites,
  };
};

export const sortProjectsByFavorite = (projects) => {
  const favorites = new Set(readPreferences().favorites);
  return [...projects].sort((a, b) => {
    const af = favorites.has(a.id) ? 0 : 1;
    const bf = favorites.has(b.id) ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name);
  });
};
