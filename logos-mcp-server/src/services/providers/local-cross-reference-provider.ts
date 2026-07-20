import { existsSync } from "fs";
import Database from "better-sqlite3";
import { DEFAULT_BIBLE, LOCAL_CROSS_REFERENCE_CORPUS_PATH } from "../../config.js";
import { parseReference } from "../reference-parser.js";
import type { BibleSearchHit } from "../../types.js";
import type { BibleTextProvider } from "./bible-text-provider.js";
import type { CrossReferenceProvider, CrossReferenceResult } from "./cross-reference-provider.js";

// Same safe-error pattern as local-bible-text-provider.ts's
// openCorpusDbSafely() / catalog-reader.ts's openCatalogDbSafely(): no path
// leaks, a clear pointer to how to fix the problem.
function openCrossReferenceCorpusDbSafely(dbPath: string): Database.Database {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Local cross-reference corpus not found. Build it first with ` +
        `"tsx scripts/build-cross-reference-corpus.ts <path-to-cross_references.txt>" ` +
        `(see docs/30_Phase4C1_CrossReference_Verifikations_Spike.md).`
    );
  }
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error(
      "Local cross-reference corpus could not be opened. It may be corrupted or an incompatible file — rebuild it with \"tsx scripts/build-cross-reference-corpus.ts\"."
    );
  }
}

interface CrossReferenceRow {
  to_book: string;
  to_chapter: number;
  to_verse: number;
  to_end_book: string;
  to_end_chapter: number;
  to_end_verse: number;
  votes: number;
}

// Formats a (possibly range) target reference the same way this project's
// other tools already format ranges (e.g. "Proverbs 8:22-30"), extended for
// the two rarer shapes the real corpus contains (see docs/30 Abschnitt 2.4):
// a cross-chapter range within the same book, and a cross-book range.
function formatCrossReferenceTitle(row: CrossReferenceRow): string {
  const sameBook = row.to_end_book === row.to_book;
  const sameChapter = sameBook && row.to_end_chapter === row.to_chapter;
  const sameVerse = sameChapter && row.to_end_verse === row.to_verse;

  if (sameVerse) return `${row.to_book} ${row.to_chapter}:${row.to_verse}`;
  if (sameChapter) return `${row.to_book} ${row.to_chapter}:${row.to_verse}-${row.to_end_verse}`;
  if (sameBook) return `${row.to_book} ${row.to_chapter}:${row.to_verse}-${row.to_end_chapter}:${row.to_end_verse}`;
  return `${row.to_book} ${row.to_chapter}:${row.to_verse}-${row.to_end_book} ${row.to_end_chapter}:${row.to_end_verse}`;
}

// Phase 4C-3: first production LocalCrossReferenceProvider, reading the
// SQLite corpus built by scripts/build-cross-reference-corpus.ts (Phase
// 4C-2). Deliberately has NO fallback logic and is NOT wired into index.ts
// or any resolver in this phase — that composition is Phase 4C-4/4C-5, see
// docs/28_Phase4_Masterplan.md.
//
// Scope decision (documented, not incidental): the corpus stores full
// start/end target references to preserve range data faithfully (see
// docs/30), but the preview text fetched for each hit is always just the
// *starting* verse of the target reference, not the full range — a preview
// is expected to be a short snippet, and fetching/concatenating an entire
// (possibly cross-book) range for every hit would add complexity without a
// clear benefit for what "preview" means elsewhere in this codebase (e.g.
// HeuristicCrossReferenceProvider's previews are single-verse search
// snippets too).
export class LocalCrossReferenceProvider implements CrossReferenceProvider {
  private readonly db: Database.Database;

  constructor(
    private readonly bibleText: BibleTextProvider,
    dbPath: string = LOCAL_CROSS_REFERENCE_CORPUS_PATH
  ) {
    this.db = openCrossReferenceCorpusDbSafely(dbPath);
    try {
      this.db.prepare("SELECT 1 FROM cross_references LIMIT 1").get();
    } catch (e) {
      // Mirrors local-bible-text-provider.ts's LocalBibleTextProvider
      // constructor exactly: better-sqlite3 validates file format lazily
      // (on the first statement, not on open), so a non-database file is
      // actually caught here, distinguished by error code from a valid
      // SQLite file that simply lacks the expected `cross_references` table
      // (a stale or hand-built file, not a corpus produced by
      // scripts/build-cross-reference-corpus.ts).
      const code = (e as { code?: string } | undefined)?.code;
      if (code === "SQLITE_NOTADB" || code === "SQLITE_CORRUPT") {
        throw new Error(
          "Local cross-reference corpus could not be read. It may be corrupted, or not a valid database file — rebuild it with \"tsx scripts/build-cross-reference-corpus.ts\"."
        );
      }
      throw new Error(
        "Local cross-reference corpus has an unexpected structure (expected table not found). Rebuild it with \"tsx scripts/build-cross-reference-corpus.ts\"."
      );
    }
  }

  // `keyTerms` is part of the shared CrossReferenceProvider interface but
  // unused here: this provider looks up a curated dataset by exact
  // reference, it does not perform a free-text search over key terms
  // (unlike HeuristicCrossReferenceProvider, which does).
  async findCrossReferences(passage: string, _keyTerms?: string, bible?: string): Promise<CrossReferenceResult> {
    // Throws "Cannot parse reference" / "Unknown book" for a malformed
    // reference or unrecognized book name — same errors every other
    // reference-consuming tool/provider in this project already surfaces.
    const ref = parseReference(passage);
    if (ref.verse === undefined) {
      throw new Error(
        `Cross-references require a specific verse, not a whole-chapter reference: "${passage}".`
      );
    }

    const effectiveBible = bible ?? DEFAULT_BIBLE;
    if (!this.bibleText.supports(effectiveBible)) {
      throw new Error(
        `Translation "${effectiveBible}" is not available in the local corpus, so cross-reference previews cannot be resolved.`
      );
    }

    const rows = this.db
      .prepare(
        `SELECT to_book, to_chapter, to_verse, to_end_book, to_end_chapter, to_end_verse, votes
         FROM cross_references
         WHERE from_book = ? AND from_chapter = ? AND from_verse = ?
         ORDER BY votes DESC`
      )
      .all(ref.book, ref.chapter, ref.verse) as CrossReferenceRow[];

    const results: BibleSearchHit[] = [];
    for (const row of rows) {
      const title = formatCrossReferenceTitle(row);
      const startVerseRef = `${row.to_book} ${row.to_chapter}:${row.to_verse}`;
      const text = await this.bibleText.resolveText(startVerseRef, effectiveBible);
      results.push({ title, preview: text.text });
    }

    return { passage, results };
  }

  // Not part of the CrossReferenceProvider interface — mirrors
  // LocalBibleTextProvider's close(), same rationale (long-lived connection
  // to a static file; callers that need deterministic cleanup, i.e. tests,
  // can close it explicitly).
  close(): void {
    this.db.close();
  }
}
