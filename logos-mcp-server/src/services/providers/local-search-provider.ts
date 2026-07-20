import { existsSync } from "fs";
import Database from "better-sqlite3";
import { LOCAL_BIBLE_CORPUS_PATH, DEFAULT_BIBLE } from "../../config.js";
import type { BibleSearchResult, BibleSearchHit } from "../../types.js";
import type { SearchProvider, SearchOptions } from "./search-provider.js";

interface SearchRow {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

// Same safe-error pattern as local-bible-text-provider.ts's
// openCorpusDbSafely() (itself mirroring catalog-reader.ts). Duplicated
// here rather than extracted into a shared module — this phase is scoped
// to not touch existing provider files unless strictly necessary (see
// docs/23_Phase3D6_LocalSearchProvider.md).
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

// Wraps the entire (trimmed) query as a single FTS5 phrase, escaping
// embedded double quotes by doubling them. Deliberately NOT split into
// per-word quoted tokens ANDed together: a single-word query behaves
// identically either way (a one-token "phrase" has no adjacency
// constraint), but a multi-word query as one phrase preserves exact
// adjacent-phrase matching — the behavior already validated in the Phase
// 3C spike (e.g. `"in the beginning"` matching only verses containing that
// exact phrase, not just all three words anywhere in the verse). Wrapping
// the whole input in one quoted phrase also makes the query syntax-safe:
// FTS5 operators (AND/OR/NOT, *, -, parentheses, column filters) inside a
// quoted phrase are treated as literal text, not interpreted — see
// docs/16_MCP2_Zielarchitektur.md §19 Risiko 9 ("FTS5-Query-Escaping").
function toFts5PhraseQuery(query: string): string {
  return `"${query.trim().replace(/"/g, '""')}"`;
}

// Phase 3D-6: first production LocalSearchProvider, reading the FTS5 index
// built by scripts/build-bible-corpus.ts (Phase 3D-2/3D-3) alongside the
// verses table LocalBibleTextProvider reads (Phase 3D-4). Fully implements
// the SearchProvider interface from Phase 3A. Not wired with a fallback of
// its own — see search-resolver.ts for the local-first/Biblia-fallback
// composition, same pattern as bible-text-resolver.ts (Phase 3D-5).
export class LocalSearchProvider implements SearchProvider {
  private readonly db: Database.Database;
  private readonly availableTranslations: Set<string>;

  constructor(dbPath: string = LOCAL_BIBLE_CORPUS_PATH) {
    this.db = openCorpusDbSafely(dbPath);
    let rows: Array<{ translation: string }>;
    try {
      rows = this.db.prepare("SELECT DISTINCT translation FROM verses").all() as typeof rows;
    } catch (e) {
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

  async search(query: string, options?: SearchOptions): Promise<BibleSearchResult> {
    // SearchOptions.bible is optional (unlike BibleTextProvider's required
    // `translation`, see bible-text-provider.ts) — index.ts's search_bible
    // handler passes it through unresolved, exactly as it already does for
    // BibliaSearchProvider (whose default resolution lives inside
    // biblia-api.ts's searchBible()). Resolved here the same way, so this
    // provider is self-sufficient when used directly, not only via
    // SearchResolver.
    const bible = (options?.bible ?? DEFAULT_BIBLE).toUpperCase();
    const limit = options?.limit ?? 20;

    if (!this.supports(bible)) {
      throw new Error(
        `Translation "${bible}" is not available in the local corpus. ` +
          `Available locally: ${[...this.availableTranslations].sort().join(", ") || "(none)"}.`
      );
    }

    if (!query.trim()) {
      return { query, resultCount: 0, results: [] };
    }

    const ftsQuery = toFts5PhraseQuery(query);

    const totalRow = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid
         WHERE verses_fts MATCH ? AND v.translation = ?`
      )
      .get(ftsQuery, bible) as { n: number };

    const rows = this.db
      .prepare(
        `SELECT v.book, v.chapter, v.verse, v.text FROM verses_fts
         JOIN verses v ON v.id = verses_fts.rowid
         WHERE verses_fts MATCH ? AND v.translation = ?
         ORDER BY bm25(verses_fts)
         LIMIT ?`
      )
      .all(ftsQuery, bible, limit) as SearchRow[];

    const results: BibleSearchHit[] = rows.map((r) => ({
      title: `${r.book} ${r.chapter}:${r.verse}`,
      preview: r.text,
    }));

    return { query, resultCount: totalRow.n, results };
  }

  // Not part of the SearchProvider interface — see
  // local-bible-text-provider.ts's close() for the same rationale (one
  // long-lived connection per provider instance, corpus file is static).
  close(): void {
    this.db.close();
  }
}
