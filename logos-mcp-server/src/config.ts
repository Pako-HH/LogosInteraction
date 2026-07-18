import { homedir } from "os";
import { join } from "path";
import { readdirSync } from "fs";

// ─── Logos Data Paths ────────────────────────────────────────────────────────

const LOGOS_DOCUMENTS_ROOT = join(
  homedir(),
  "Library",
  "Application Support",
  "Logos4",
  "Documents"
);

// Catalog DB lives under Data/ (not Documents/)
const LOGOS_DATA_ROOT = join(
  homedir(),
  "Library",
  "Application Support",
  "Logos4",
  "Data"
);

// Logos stores each installation's data under a generated per-machine ID folder
// (e.g. "lpfinojk.yny") that cannot be known in advance. Pick the first
// (alphabetically sorted, for determinism) subdirectory instead of hardcoding
// an ID that would only match a single installation.
function detectLogosInstallDir(rootDir: string): string {
  try {
    const subdirs = readdirSync(rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    if (subdirs.length > 0) {
      return join(rootDir, subdirs[0]);
    }
  } catch {
    // rootDir doesn't exist or isn't readable; fall through to rootDir itself
  }
  return rootDir;
}

export const LOGOS_DATA_DIR =
  process.env.LOGOS_DATA_DIR ?? detectLogosInstallDir(LOGOS_DOCUMENTS_ROOT);

export const LOGOS_CATALOG_DIR =
  process.env.LOGOS_CATALOG_DIR ?? detectLogosInstallDir(LOGOS_DATA_ROOT);

export const DB_PATHS = {
  visualMarkup: join(LOGOS_DATA_DIR, "VisualMarkup", "visualmarkup.db"),
  favorites: join(LOGOS_DATA_DIR, "FavoritesManager", "favorites.db"),
  workflows: join(LOGOS_DATA_DIR, "Workflows", "Workflows.db"),
  readingLists: join(LOGOS_DATA_DIR, "ReadingLists", "ReadingLists.db"),
  shortcuts: join(LOGOS_DATA_DIR, "ShortcutsManager", "shortcuts.db"),
  guides: join(LOGOS_DATA_DIR, "Guides", "guides.db"),
  notes: join(LOGOS_DATA_DIR, "NotesToolManager", "notestool.db"),
  clippings: join(LOGOS_DATA_DIR, "Documents", "Clippings", "Clippings.db"),
  passageLists: join(LOGOS_DATA_DIR, "Documents", "PassageList", "PassageList.db"),
  catalog: join(LOGOS_CATALOG_DIR, "LibraryCatalog", "catalog.db"),
} as const;

// ─── Biblia API ──────────────────────────────────────────────────────────────

export const BIBLIA_API_KEY = process.env.BIBLIA_API_KEY ?? "";
export const BIBLIA_API_BASE = "https://api.biblia.com/v1/bible";
export const DEFAULT_BIBLE = "LEB";

// ─── Logos URL Schemes ───────────────────────────────────────────────────────

export const LOGOS_URL_BASE = "logos4:";

// ─── Server Info ─────────────────────────────────────────────────────────────

export const SERVER_NAME = "logos-bible";
export const SERVER_VERSION = "1.0.0";
