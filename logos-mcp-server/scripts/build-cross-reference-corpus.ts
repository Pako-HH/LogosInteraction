// Phase 4C-2 — build pipeline for the local Bible cross-reference corpus.
//
// STATUS: Build-time tooling only, same status as scripts/build-bible-corpus.ts
// (docs/16_MCP2_Zielarchitektur.md §14, "kein Teil des Server-Laufzeitpfads").
// Not imported by src/index.ts, not a LocalCrossReferenceProvider, not wired
// into src/services/providers/ — those remain untouched in this phase
// (Phase 4C-3/4C-4/4C-5, see docs/28_Phase4_Masterplan.md).
//
// Converts the raw openbible.info Cross References TSV export (verified in
// Phase 4C-1, see docs/30_Phase4C1_CrossReference_Verifikations_Spike.md —
// CC BY 4.0, ~340,000 rows, "From Verse\tTo Verse\tVotes") into a SQLite
// corpus database of structured (from -> to) reference pairs.
//
// This script never downloads anything itself — the raw file must already
// exist on disk and its path is passed in explicitly, exactly like
// build-bible-corpus.ts's VPL_SOURCE_PATH pattern.
//
// Usage:
//   tsx scripts/build-cross-reference-corpus.ts <path-to-cross_references.txt> [outputPath]
//   CROSS_REFERENCE_SOURCE_PATH=<path> tsx scripts/build-cross-reference-corpus.ts

import { fileURLToPath } from "url";
import { readFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import Database from "better-sqlite3";
import { BOOK_ORDER } from "../src/services/reference-parser.js";

// ─── openbible.info book code → canonical book name ─────────────────────────
// The raw data uses its own abbreviated codes (e.g. "1Cor", "Song"), distinct
// from eBible.org's SIL/UBS codes used by build-bible-corpus.ts. Verified in
// Phase 4C-1: exactly these 66 codes appear on both the "From" and "To" side
// of the real dataset (including inside ranges), with no Apocrypha/Deuterocanon
// codes present — so no entries are expected to be filtered out in practice;
// the skip-unmapped-book logic below exists defensively, mirroring
// build-bible-corpus.ts's SIL_TO_CANONICAL_BOOK / parseVplText design.
export const OPENBIBLE_TO_CANONICAL_BOOK: Record<string, string> = {
  Gen: "Genesis", Exod: "Exodus", Lev: "Leviticus", Num: "Numbers", Deut: "Deuteronomy",
  Josh: "Joshua", Judg: "Judges", Ruth: "Ruth", "1Sam": "1 Samuel", "2Sam": "2 Samuel",
  "1Kgs": "1 Kings", "2Kgs": "2 Kings", "1Chr": "1 Chronicles", "2Chr": "2 Chronicles",
  Ezra: "Ezra", Neh: "Nehemiah", Esth: "Esther", Job: "Job", Ps: "Psalms",
  Prov: "Proverbs", Eccl: "Ecclesiastes", Song: "Song of Solomon", Isa: "Isaiah",
  Jer: "Jeremiah", Lam: "Lamentations", Ezek: "Ezekiel", Dan: "Daniel", Hos: "Hosea",
  Joel: "Joel", Amos: "Amos", Obad: "Obadiah", Jonah: "Jonah", Mic: "Micah", Nah: "Nahum",
  Hab: "Habakkuk", Zeph: "Zephaniah", Hag: "Haggai", Zech: "Zechariah", Mal: "Malachi",
  Matt: "Matthew", Mark: "Mark", Luke: "Luke", John: "John", Acts: "Acts", Rom: "Romans",
  "1Cor": "1 Corinthians", "2Cor": "2 Corinthians", Gal: "Galatians", Eph: "Ephesians",
  Phil: "Philippians", Col: "Colossians", "1Thess": "1 Thessalonians", "2Thess": "2 Thessalonians",
  "1Tim": "1 Timothy", "2Tim": "2 Timothy", Titus: "Titus", Phlm: "Philemon", Heb: "Hebrews",
  Jas: "James", "1Pet": "1 Peter", "2Pet": "2 Peter", "1John": "1 John", "2John": "2 John",
  "3John": "3 John", Jude: "Jude", Rev: "Revelation",
};

// Same drift-detection purpose as build-bible-corpus.ts's validateSilMapping().
export function validateOpenBibleMapping(): void {
  const mapped = new Set(Object.values(OPENBIBLE_TO_CANONICAL_BOOK));
  const missing = BOOK_ORDER.filter((b) => !mapped.has(b));
  const extra = [...mapped].filter((b) => !BOOK_ORDER.includes(b));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `OPENBIBLE_TO_CANONICAL_BOOK is out of sync with BOOK_ORDER. Missing: [${missing.join(", ")}]. Extra: [${extra.join(", ")}].`
    );
  }
}

// ─── Raw line parsing ────────────────────────────────────────────────────
// Format (verified in Phase 4C-1): "<BookCode>.<chapter>.<verse>" per
// reference, tab-separated "From Verse\tTo Verse\tVotes" per line. "To Verse"
// may be a range ("<ref>-<ref>"); "From Verse" never is (verified in 4C-1).
// Votes is a signed integer — the community can downvote a cross-reference,
// so negative values (e.g. "-38") are valid, not malformed input.

export interface RawBookRef {
  bookCode: string;
  chapter: number;
  verse: number;
}

function parseRawRef(ref: string): RawBookRef | null {
  const parts = ref.split(".");
  if (parts.length !== 3) return null;
  const [bookCode, chapterStr, verseStr] = parts;
  if (!bookCode) return null;
  const chapter = Number(chapterStr);
  const verse = Number(verseStr);
  if (!Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
  return { bookCode, chapter, verse };
}

export interface ParsedCrossReferenceLine {
  from: RawBookRef;
  to: RawBookRef;
  toEnd: RawBookRef;
  votes: number;
}

export function parseCrossReferenceLine(line: string): ParsedCrossReferenceLine | null {
  const fields = line.split("\t");
  if (fields.length !== 3) return null;
  const [fromField, toField, votesField] = fields;

  const from = parseRawRef(fromField);
  if (!from) return null;

  const votes = Number(votesField);
  if (!Number.isInteger(votes)) return null;

  const toParts = toField.split("-");
  if (toParts.length === 1) {
    const to = parseRawRef(toParts[0]);
    if (!to) return null;
    return { from, to, toEnd: to, votes };
  }
  if (toParts.length === 2) {
    const to = parseRawRef(toParts[0]);
    const toEnd = parseRawRef(toParts[1]);
    if (!to || !toEnd) return null;
    return { from, to, toEnd, votes };
  }
  return null;
}

export interface RawCrossReference {
  fromBook: string; // canonical, matches reference-parser.ts's BOOK_ORDER
  fromChapter: number;
  fromVerse: number;
  toBook: string; // canonical; start of range (equals toEndBook when not a range)
  toChapter: number;
  toVerse: number;
  toEndBook: string; // canonical; end of range (equals toBook when not a range)
  toEndChapter: number;
  toEndVerse: number;
  votes: number;
}

// Parses the full raw file. Line 0 is always the openbible.info header row
// ("From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY <date>") and is
// always skipped, not treated as data — verified as a fixed, single-line
// header format in Phase 4C-1. Throws on a genuinely malformed non-header,
// non-blank line, matching parseVplText()'s "fail loudly" philosophy.
export function parseCrossReferenceText(content: string): RawCrossReference[] {
  const refs: RawCrossReference[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) continue; // header row
    const line = lines[i];
    if (!line.trim()) continue;
    const parsed = parseCrossReferenceLine(line);
    if (!parsed) {
      throw new Error(`Unparseable cross-reference line: ${JSON.stringify(line)}`);
    }
    const fromBook = OPENBIBLE_TO_CANONICAL_BOOK[parsed.from.bookCode];
    const toBook = OPENBIBLE_TO_CANONICAL_BOOK[parsed.to.bookCode];
    const toEndBook = OPENBIBLE_TO_CANONICAL_BOOK[parsed.toEnd.bookCode];
    if (!fromBook || !toBook || !toEndBook) continue; // not one of the 66 canonical books — skip
    refs.push({
      fromBook,
      fromChapter: parsed.from.chapter,
      fromVerse: parsed.from.verse,
      toBook,
      toChapter: parsed.to.chapter,
      toVerse: parsed.to.verse,
      toEndBook,
      toEndChapter: parsed.toEnd.chapter,
      toEndVerse: parsed.toEnd.verse,
      votes: parsed.votes,
    });
  }
  return refs;
}

// ─── SQLite schema ───────────────────────────────────────────────────────
// Structured lookup only (from -> [to...]), no full-text search — unlike
// the Bible text corpus, cross-references are reference pairs, not prose to
// search over. UNIQUE constraint is an idempotency safety net against an
// accidental duplicate build run, same purpose as verses' UNIQUE constraint
// in build-bible-corpus.ts (verified in Phase 4C-1: the real dataset has no
// natural duplicate (from, to) pairs, so this cannot reject legitimate rows).

export function createCrossReferenceCorpusDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cross_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_book TEXT NOT NULL,
      from_chapter INTEGER NOT NULL,
      from_verse INTEGER NOT NULL,
      to_book TEXT NOT NULL,
      to_chapter INTEGER NOT NULL,
      to_verse INTEGER NOT NULL,
      to_end_book TEXT NOT NULL,
      to_end_chapter INTEGER NOT NULL,
      to_end_verse INTEGER NOT NULL,
      votes INTEGER NOT NULL,
      UNIQUE (from_book, from_chapter, from_verse, to_book, to_chapter, to_verse)
    );

    CREATE INDEX IF NOT EXISTS idx_cross_references_from
      ON cross_references (from_book, from_chapter, from_verse);
  `);
  return db;
}

export function insertCrossReferences(db: Database.Database, refs: RawCrossReference[]): void {
  const insert = db.prepare(`
    INSERT INTO cross_references
      (from_book, from_chapter, from_verse, to_book, to_chapter, to_verse, to_end_book, to_end_chapter, to_end_verse, votes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((rows: RawCrossReference[]) => {
    for (const r of rows) {
      insert.run(
        r.fromBook, r.fromChapter, r.fromVerse,
        r.toBook, r.toChapter, r.toVerse,
        r.toEndBook, r.toEndChapter, r.toEndVerse,
        r.votes
      );
    }
  });
  insertMany(refs);
}

// ─── CLI entry point ─────────────────────────────────────────────────────

async function main() {
  const sourcePath = process.env.CROSS_REFERENCE_SOURCE_PATH ?? process.argv[2];
  if (!sourcePath) {
    console.error("Usage: tsx scripts/build-cross-reference-corpus.ts <path-to-cross_references.txt> [outputPath]");
    console.error("   or: CROSS_REFERENCE_SOURCE_PATH=<path> tsx scripts/build-cross-reference-corpus.ts");
    process.exit(1);
  }

  validateOpenBibleMapping();

  const content = readFileSync(sourcePath, "utf-8");
  const dataLineCount = content.split("\n").slice(1).filter((l) => l.trim()).length;
  const refs = parseCrossReferenceText(content);
  console.log(`Parsed ${refs.length} cross-references from ${dataLineCount} data lines in ${sourcePath}`);
  if (refs.length !== dataLineCount) {
    console.warn(`${dataLineCount - refs.length} line(s) were skipped as non-canonical (not in the 66-book set).`);
  }

  const defaultOutputDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "cross-reference-corpus");
  const outputPath = process.argv[3] ?? join(defaultOutputDir, "cross-reference-corpus.db");
  mkdirSync(dirname(outputPath), { recursive: true });

  const db = createCrossReferenceCorpusDb(outputPath);
  insertCrossReferences(db, refs);
  const total = db.prepare("SELECT COUNT(*) AS n FROM cross_references").get() as { n: number };
  db.close();

  console.log(`Wrote ${total.n} cross-references to ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Cross-reference corpus build failed:", err);
    process.exit(1);
  });
}
