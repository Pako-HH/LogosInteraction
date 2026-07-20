import { existsSync } from "fs";
import Database from "better-sqlite3";
import { LOCAL_BIBLE_CORPUS_PATH } from "../../config.js";
import { parseReference } from "../reference-parser.js";
import { versesInChapter } from "../../data/versification.js";
import type { ParsedReference, BibleTextResult } from "../../types.js";
import type { BibleTextProvider } from "./bible-text-provider.js";

interface VerseRow {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface VerseRange {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
}

// Same safe-error pattern as catalog-reader.ts's openCatalogDbSafely(): no
// path leaks, a clear pointer to how to fix the problem.
function openCorpusDbSafely(dbPath: string): Database.Database {
  if (!existsSync(dbPath)) {
    throw new Error(
      `Local Bible corpus not found. Build it first with "npm run build:corpus" ` +
        `(see docs/19_Phase3D2_WEB_Korpus_Build.md and docs/20_Phase3D3_KJV_ASV_Korpus.md).`
    );
  }
  try {
    return new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch {
    throw new Error(
      "Local Bible corpus could not be opened. It may be corrupted or an incompatible file — rebuild it with \"npm run build:corpus\"."
    );
  }
}

// Resolves a ParsedReference into inclusive (chapter, verse) start/end
// bounds, covering every shape parseReference() can produce:
//   - chapter only ("Genesis 1")            -> whole chapter
//   - chapter + verse ("Genesis 1:1")        -> single verse
//   - chapter range ("Genesis 1-3")          -> whole chapters, verse 1 through the end of endChapter
//   - same-chapter verse range ("Genesis 1:1-5")   -> endChapter already equals chapter (see reference-parser.ts)
//   - cross-chapter verse range ("Genesis 1:1-2:3") -> endChapter differs from chapter
// versesInChapter() is used exactly like reference-compare.ts's private
// lastVerseOf() helper (falls back to a very large number for an
// unrecognized book/chapter rather than crashing) — kept local to this
// provider rather than exported from reference-compare.ts, to keep this
// phase's change surface to a single new file plus one config constant.
function resolveVerseRange(ref: ParsedReference): VerseRange {
  const startChapter = ref.chapter;

  if (ref.verse === undefined) {
    // "Genesis 1" or "Genesis 1-3": starts at verse 1 of `chapter`, ends at
    // the last verse of `endChapter` (== chapter for a single whole chapter).
    const endChapter = ref.endChapter ?? ref.chapter;
    const endVerse = versesInChapter(ref.book, endChapter) ?? Number.MAX_SAFE_INTEGER;
    return { startChapter, startVerse: 1, endChapter, endVerse };
  }

  // "Genesis 1:1", "Genesis 1:1-5", or "Genesis 1:1-2:3"
  const endChapter = ref.endChapter ?? ref.chapter;
  const endVerse = ref.endVerse ?? ref.verse;
  return { startChapter, startVerse: ref.verse, endChapter, endVerse };
}

// Phase 3D-4: first production LocalBibleTextProvider, reading the SQLite
// corpus built by scripts/build-bible-corpus.ts (Phase 3D-2/3D-3). Fully
// implements the BibleTextProvider interface from Phase 3A. Deliberately
// has NO fallback logic and is NOT wired into index.ts or any resolver in
// this phase — see docs/16_MCP2_Zielarchitektur.md §18 Phase D/E.
export class LocalBibleTextProvider implements BibleTextProvider {
  private readonly db: Database.Database;
  private readonly availableTranslations: Set<string>;

  constructor(dbPath: string = LOCAL_BIBLE_CORPUS_PATH) {
    this.db = openCorpusDbSafely(dbPath);
    let rows: Array<{ translation: string }>;
    try {
      rows = this.db.prepare("SELECT DISTINCT translation FROM verses").all() as typeof rows;
    } catch (e) {
      // Mirrors catalog-reader.ts's schema-mismatch handling exactly:
      // better-sqlite3 validates file format lazily (on the first
      // statement, not on open), so this is where a non-database file is
      // actually caught, distinguished by error code from a valid SQLite
      // file that simply doesn't have the expected `verses` table/columns
      // (a stale or hand-built file, not a corpus produced by
      // scripts/build-bible-corpus.ts).
      const code = (e as { code?: string } | undefined)?.code;
      if (code === "SQLITE_NOTADB" || code === "SQLITE_CORRUPT") {
        throw new Error(
          "Local Bible corpus could not be read. It may be corrupted, or not a valid database file — rebuild it with \"npm run build:corpus\"."
        );
      }
      throw new Error(
        "Local Bible corpus has an unexpected structure (expected table/columns not found). Rebuild it with \"npm run build:corpus\"."
      );
    }
    this.availableTranslations = new Set(rows.map((r) => r.translation.toUpperCase()));
  }

  supports(translation: string): boolean {
    return this.availableTranslations.has(translation.toUpperCase());
  }

  async resolveText(passage: string, translation: string): Promise<BibleTextResult> {
    // Throws "Cannot parse reference" / "Unknown book" for a malformed
    // reference or unrecognized book name — same errors every other
    // reference-consuming tool in this project already surfaces, not
    // reimplemented here.
    const ref = parseReference(passage);

    if (!this.supports(translation)) {
      throw new Error(
        `Translation "${translation}" is not available in the local corpus. ` +
          `Available locally: ${[...this.availableTranslations].sort().join(", ") || "(none)"}.`
      );
    }

    const { startChapter, startVerse, endChapter, endVerse } = resolveVerseRange(ref);

    // Inclusive range over the (chapter, verse) tuple, expressed without
    // relying on SQLite row-value comparison support:
    //   (chapter, verse) >= (startChapter, startVerse)
    //     <=>  chapter > startChapter OR (chapter = startChapter AND verse >= startVerse)
    //   (chapter, verse) <= (endChapter, endVerse)
    //     <=>  chapter < endChapter   OR (chapter = endChapter   AND verse <= endVerse)
    // A three-way OR split on (start chapter / middle chapters / end
    // chapter) looks intuitive but is WRONG when startChapter === endChapter
    // and startVerse > 1: the "end chapter" clause alone (chapter = endChapter
    // AND verse <= endVerse) would then also match verses *before*
    // startVerse in that same chapter. This two-group AND form has no such
    // gap for any shape resolveVerseRange() produces.
    const rows = this.db
      .prepare(
        `SELECT book, chapter, verse, text FROM verses
         WHERE translation = ? AND book = ?
           AND (chapter > ? OR (chapter = ? AND verse >= ?))
           AND (chapter < ? OR (chapter = ? AND verse <= ?))
         ORDER BY chapter ASC, verse ASC`
      )
      .all(
        translation.toUpperCase(),
        ref.book,
        startChapter,
        startChapter,
        startVerse,
        endChapter,
        endChapter,
        endVerse
      ) as VerseRow[];

    if (rows.length === 0) {
      // Distinct from a verse that legitimately has empty text (e.g. WEB's
      // Romans 16:25, see docs/19) — that case returns exactly one row
      // with text: "", not zero rows, and is NOT an error (see below).
      throw new Error(`No verses found for "${passage}" in translation "${translation}" in the local corpus.`);
    }

    return {
      passage,
      text: rows.map((r) => r.text).join(" "),
      bible: translation,
    };
  }

  // Not part of the BibleTextProvider interface — this provider keeps a
  // single long-lived connection open (docs/16_MCP2_Zielarchitektur.md
  // §10: the corpus file is static, unlike Logos' own .db files), so
  // callers that need deterministic cleanup (tests, a future graceful
  // shutdown path) can close it explicitly.
  close(): void {
    this.db.close();
  }
}
