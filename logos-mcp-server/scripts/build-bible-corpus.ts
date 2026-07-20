// Phase 3D-2 — production build pipeline for the local Bible text corpus.
//
// STATUS: Build-time tooling only (docs/16_MCP2_Zielarchitektur.md §14,
// "kein Teil des Server-Laufzeitpfads"). Not imported by src/index.ts, not
// a LocalBibleTextProvider, not wired into src/services/providers/ — those
// remain untouched in this phase.
//
// Converts a raw eBible.org VPL ("Verse Per Line") text file into a
// SQLite + FTS5 corpus database, matching the schema validated by the
// Phase 3C spike (logos-mcp-server/spike/corpus-prototype.ts) but now
// production-grade: exported, tested, CLI-driven, with a completeness
// check against the project's existing versification.ts.
//
// This script never downloads anything itself — per the Phase 3D-2
// instruction ("Lade keine neuen Quellen herunter"), the raw VPL file must
// already exist on disk (e.g. the eng-web_vpl.txt verified in Phase 3D-1)
// and its path is passed in explicitly.
//
// Usage:
//   tsx scripts/build-bible-corpus.ts <path-to-eng-web_vpl.txt> [outputPath]
//   WEB_VPL_SOURCE_PATH=<path> tsx scripts/build-bible-corpus.ts

import { fileURLToPath } from "url";
import { readFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import Database from "better-sqlite3";
import { BOOK_ORDER } from "../src/services/reference-parser.js";
import { versesInChapter } from "../src/data/versification.js";

// ─── SIL/UBS 3-letter book code → canonical book name ──────────────────────
// eBible.org's VPL files use the standard SIL/UBS codes (see
// eng-web_about.htm / eng-web_vpl.xml in the Phase 3D-1 analysis). This
// mapping is intentionally local to the build pipeline, not merged into
// reference-parser.ts, since no other part of the system needs SIL codes —
// keeping reference-parser.ts's canonical BOOK_ORDER as the single source
// of truth for book *names* (validated against it in validateSilMapping()).
export const SIL_TO_CANONICAL_BOOK: Record<string, string> = {
  GEN: "Genesis", EXO: "Exodus", LEV: "Leviticus", NUM: "Numbers", DEU: "Deuteronomy",
  JOS: "Joshua", JDG: "Judges", RUT: "Ruth", "1SA": "1 Samuel", "2SA": "2 Samuel",
  "1KI": "1 Kings", "2KI": "2 Kings", "1CH": "1 Chronicles", "2CH": "2 Chronicles",
  EZR: "Ezra", NEH: "Nehemiah", EST: "Esther", JOB: "Job", PSA: "Psalms",
  PRO: "Proverbs", ECC: "Ecclesiastes", SOL: "Song of Solomon", ISA: "Isaiah",
  JER: "Jeremiah", LAM: "Lamentations", EZE: "Ezekiel", DAN: "Daniel", HOS: "Hosea",
  JOE: "Joel", AMO: "Amos", OBA: "Obadiah", JON: "Jonah", MIC: "Micah", NAH: "Nahum",
  HAB: "Habakkuk", ZEP: "Zephaniah", HAG: "Haggai", ZEC: "Zechariah", MAL: "Malachi",
  MAT: "Matthew", MAR: "Mark", LUK: "Luke", JOH: "John", ACT: "Acts", ROM: "Romans",
  "1CO": "1 Corinthians", "2CO": "2 Corinthians", GAL: "Galatians", EPH: "Ephesians",
  PHI: "Philippians", COL: "Colossians", "1TH": "1 Thessalonians", "2TH": "2 Thessalonians",
  "1TI": "1 Timothy", "2TI": "2 Timothy", TIT: "Titus", PHM: "Philemon", HEB: "Hebrews",
  JAM: "James", "1PE": "1 Peter", "2PE": "2 Peter", "1JO": "1 John", "2JO": "2 John",
  "3JO": "3 John", JUD: "Jude", REV: "Revelation",
};

// Fails loudly (rather than silently building an incomplete corpus) if the
// mapping table above and reference-parser.ts's canonical book list ever
// drift apart — e.g. a typo, or BOOK_ORDER gaining/losing an entry.
export function validateSilMapping(): void {
  const mapped = new Set(Object.values(SIL_TO_CANONICAL_BOOK));
  const missing = BOOK_ORDER.filter((b) => !mapped.has(b));
  const extra = [...mapped].filter((b) => !BOOK_ORDER.includes(b));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `SIL_TO_CANONICAL_BOOK is out of sync with BOOK_ORDER. Missing: [${missing.join(", ")}]. Extra: [${extra.join(", ")}].`
    );
  }
}

// ─── VPL parsing ─────────────────────────────────────────────────────────
// Format (verified in Phase 3D-1): "<SILCODE> <chapter>:<verse> <text>",
// space-delimited, UTF-8, one verse per line. `text` may legitimately be
// empty (verses omitted by the translators but kept as numbered
// placeholders for cross-translation compatibility, e.g. Romans 16:25 in
// this edition — see docs/19).
const VPL_LINE = /^(\S+)\s+(\d+):(\d+)\s(.*)$/;

export interface ParsedVplLine {
  silCode: string;
  chapter: number;
  verse: number;
  text: string;
}

export function parseVplLine(line: string): ParsedVplLine | null {
  const m = line.match(VPL_LINE);
  if (!m) return null;
  return { silCode: m[1], chapter: Number(m[2]), verse: Number(m[3]), text: m[4].trimEnd() };
}

export interface RawVerse {
  book: string; // canonical name, matches reference-parser.ts's BOOK_ORDER
  chapter: number;
  verse: number;
  text: string;
}

// Parses a full VPL file's contents, silently filtering out non-canonical
// books (Apocrypha/Deuterocanon — eng-web_vpl.txt includes them, this
// project's versification.ts and BOOK_ORDER cover only the 66-book
// Protestant canon, see docs/19). Throws on a genuinely malformed
// non-blank line, since that indicates a format assumption has broken.
export function parseVplText(content: string): RawVerse[] {
  const verses: RawVerse[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const parsed = parseVplLine(line);
    if (!parsed) {
      throw new Error(`Unparseable VPL line: ${JSON.stringify(line)}`);
    }
    const book = SIL_TO_CANONICAL_BOOK[parsed.silCode];
    if (!book) continue; // not one of the 66 canonical books — skip
    verses.push({ book, chapter: parsed.chapter, verse: parsed.verse, text: parsed.text });
  }
  return verses;
}

// ─── Completeness check against versification.ts ───────────────────────────

export interface CompletenessIssue {
  book: string;
  chapter: number;
  expected: number;
  actual: number;
}

// Compares parsed verse counts per chapter against versification.ts.
// Returns issues rather than throwing — a mismatch (e.g. the known Romans
// 14/16 doxology-placement variant, see docs/19) is an expected,
// documented property of some translations, not necessarily a build
// failure; the caller decides how to act on the report.
export function checkCompleteness(verses: RawVerse[]): CompletenessIssue[] {
  const counts = new Map<string, number>();
  for (const v of verses) {
    const key = `${v.book}|${v.chapter}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const issues: CompletenessIssue[] = [];
  for (const book of BOOK_ORDER) {
    let chapter = 1;
    // versesInChapter() returns null past the book's last chapter.
    for (let expected = versesInChapter(book, chapter); expected !== null; chapter++, expected = versesInChapter(book, chapter)) {
      const actual = counts.get(`${book}|${chapter}`) ?? 0;
      if (actual !== expected) {
        issues.push({ book, chapter, expected, actual });
      }
    }
  }
  return issues;
}

// ─── SQLite + FTS5 schema ────────────────────────────────────────────────
// Same shape as the Phase 3C spike prototype (spike/corpus-prototype.ts),
// now the production build target.

export function createCorpusDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      translation TEXT NOT NULL,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      UNIQUE (translation, book, chapter, verse)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
      text,
      content='verses',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS verses_ai AFTER INSERT ON verses BEGIN
      INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
    END;
  `);
  return db;
}

export function insertCorpusVerses(db: Database.Database, translation: string, verses: RawVerse[]): void {
  const insert = db.prepare(
    `INSERT INTO verses (translation, book, chapter, verse, text) VALUES (?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((rows: RawVerse[]) => {
    for (const v of rows) insert.run(translation, v.book, v.chapter, v.verse, v.text);
  });
  insertMany(verses);
}

// ─── CLI entry point ─────────────────────────────────────────────────────

async function main() {
  const sourcePath = process.env.WEB_VPL_SOURCE_PATH ?? process.argv[2];
  if (!sourcePath) {
    console.error("Usage: tsx scripts/build-bible-corpus.ts <path-to-eng-web_vpl.txt> [outputPath]");
    console.error("   or: WEB_VPL_SOURCE_PATH=<path> tsx scripts/build-bible-corpus.ts");
    process.exit(1);
  }

  validateSilMapping();

  const content = readFileSync(sourcePath, "utf-8");
  const verses = parseVplText(content);
  console.log(`Parsed ${verses.length} canonical verses from ${sourcePath}`);

  const issues = checkCompleteness(verses);
  if (issues.length > 0) {
    console.warn(`${issues.length} chapter(s) differ from versification.ts (see docs/19 for the known Romans 14/16 case):`);
    for (const issue of issues) {
      console.warn(`  ${issue.book} ${issue.chapter}: expected ${issue.expected}, got ${issue.actual}`);
    }
  } else {
    console.log("No completeness discrepancies against versification.ts.");
  }

  const defaultOutputDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "bible-corpus");
  const outputPath = process.argv[3] ?? join(defaultOutputDir, "web.db");
  mkdirSync(dirname(outputPath), { recursive: true });

  const db = createCorpusDb(outputPath);
  insertCorpusVerses(db, "WEB", verses);
  const row = db.prepare("SELECT COUNT(*) AS n FROM verses").get() as { n: number };
  db.close();

  console.log(`Wrote ${row.n} verses (translation=WEB) to ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Corpus build failed:", err);
    process.exit(1);
  });
}
