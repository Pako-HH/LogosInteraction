// Phase 3C verification spike — isolated SQLite + FTS5 corpus prototype.
//
// STATUS: Spike only. NOT a LocalBibleProvider, NOT wired into
// src/services/providers/, NOT imported by index.ts, NOT part of the tsc
// build (outside tsconfig.json's "include": ["src/**/*"]). Deliberately
// uses its own naming (SpikeCorpus, not BibleTextProvider) to avoid
// implying it satisfies the Provider interfaces from
// docs/16_MCP2_Zielarchitektur.md — that implementation is explicitly out
// of scope for this phase.
//
// Reuses the project's real reference-normalization logic
// (reference-parser.ts, versification.ts) rather than reimplementing it,
// per docs/17_Phase3B_Korpus_Produktentscheidungen.md Mindestanforderung
// "Referenznormalisierung".

import Database from "better-sqlite3";
import { parseReference } from "../src/services/reference-parser.js";
import { versesInChapter } from "../src/data/versification.js";
import type { SpikeVerse } from "./fixtures/web-sample-verses.js";

export interface SpikeSearchHit {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  rank: number;
}

// In-memory only — this is a throwaway verification database, never
// persisted to disk, never read by the running MCP server.
export function createSpikeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE verses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      translation TEXT NOT NULL,
      book TEXT NOT NULL,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      UNIQUE (translation, book, chapter, verse)
    );

    CREATE VIRTUAL TABLE verses_fts USING fts5(
      text,
      content='verses',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TRIGGER verses_ai AFTER INSERT ON verses BEGIN
      INSERT INTO verses_fts(rowid, text) VALUES (new.id, new.text);
    END;
  `);
  return db;
}

export function insertVerses(db: Database.Database, rows: SpikeVerse[]): void {
  const insert = db.prepare(`
    INSERT INTO verses (translation, book, chapter, verse, text)
    VALUES (@translation, @book, @chapter, @verse, @text)
  `);
  const insertMany = db.transaction((rows: SpikeVerse[]) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(rows);
}

// Single-verse lookup, e.g. "John 3:16".
export function lookupVerse(db: Database.Database, translation: string, passage: string): SpikeVerse | undefined {
  const ref = parseReference(passage);
  if (ref.verse === undefined) {
    throw new Error(`Reference has no verse: "${passage}"`);
  }
  return db
    .prepare(`SELECT * FROM verses WHERE translation = ? AND book = ? AND chapter = ? AND verse = ?`)
    .get(translation, ref.book, ref.chapter, ref.verse) as SpikeVerse | undefined;
}

// Range lookup within a single chapter, e.g. "Romans 8:28-30".
export function lookupRange(db: Database.Database, translation: string, passage: string): SpikeVerse[] {
  const ref = parseReference(passage);
  if (ref.verse === undefined) {
    throw new Error(`Reference has no verse: "${passage}"`);
  }
  const endChapter = ref.endChapter ?? ref.chapter;
  const endVerse = ref.endVerse ?? ref.verse;
  if (endChapter !== ref.chapter) {
    throw new Error(`Cross-chapter ranges not supported by this spike prototype: "${passage}"`);
  }
  return db
    .prepare(
      `SELECT * FROM verses WHERE translation = ? AND book = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse ASC`
    )
    .all(translation, ref.book, ref.chapter, ref.verse, endVerse) as SpikeVerse[];
}

// FTS5 word/phrase search (phrase queries: pass the phrase wrapped in
// double quotes, e.g. `"in the beginning"`, per FTS5 query syntax).
export function searchText(
  db: Database.Database,
  translation: string,
  query: string,
  limit: number = 15
): SpikeSearchHit[] {
  return db
    .prepare(
      `
      SELECT v.book, v.chapter, v.verse, v.text, bm25(verses_fts) AS rank
      FROM verses_fts
      JOIN verses v ON v.id = verses_fts.rowid
      WHERE verses_fts MATCH ? AND v.translation = ?
      ORDER BY rank
      LIMIT ?
      `
    )
    .all(query, translation, limit) as SpikeSearchHit[];
}

// Cross-checks a stored chapter's verse set against the project's existing
// versification.ts table — flags gaps, duplicates, out-of-order verses, and
// mismatches against the known chapter length (only meaningful for a
// *complete* chapter; a sampled sub-range is checked for internal
// consistency only, not completeness).
export interface VersificationCheckResult {
  book: string;
  chapter: number;
  storedVerses: number[];
  expectedChapterLength: number | null;
  isCompleteChapter: boolean;
  hasGaps: boolean;
  hasDuplicates: boolean;
  isAscending: boolean;
  matchesExpectedLength: boolean | null;
}

export function checkVersification(db: Database.Database, translation: string, book: string, chapter: number): VersificationCheckResult {
  const rows = db
    .prepare(`SELECT verse FROM verses WHERE translation = ? AND book = ? AND chapter = ? ORDER BY verse ASC`)
    .all(translation, book, chapter) as Array<{ verse: number }>;
  const storedVerses = rows.map((r) => r.verse);

  const isAscending = storedVerses.every((v, i) => i === 0 || v > storedVerses[i - 1]);
  const uniqueCount = new Set(storedVerses).size;
  const hasDuplicates = uniqueCount !== storedVerses.length;

  const expectedChapterLength = versesInChapter(book, chapter);
  const min = storedVerses[0];
  const max = storedVerses[storedVerses.length - 1];
  const isCompleteChapter = expectedChapterLength !== null && min === 1 && max === expectedChapterLength;
  const hasGaps = isCompleteChapter
    ? storedVerses.length !== expectedChapterLength
    : storedVerses.some((v, i) => i > 0 && v !== storedVerses[i - 1] + 1); // sampled range: only flag internal gaps

  const matchesExpectedLength = isCompleteChapter && expectedChapterLength !== null
    ? storedVerses.length === expectedChapterLength
    : null; // not applicable to a partial sample

  return {
    book,
    chapter,
    storedVerses,
    expectedChapterLength,
    isCompleteChapter,
    hasGaps,
    hasDuplicates,
    isAscending,
    matchesExpectedLength,
  };
}
