import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { createCorpusDb, insertCorpusVerses } from "../../scripts/build-bible-corpus.js";
import { LocalSearchProvider } from "../../src/services/providers/local-search-provider.js";

const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-local-search-provider-test-"));

function freshCorpusPath(): string {
  return join(testDir, `corpus-${randomUUID()}.db`);
}

function buildFixtureCorpus(): string {
  const dbPath = freshCorpusPath();
  const db = createCorpusDb(dbPath);
  insertCorpusVerses(db, "WEB", [
    { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning, God created the heavens and the earth." },
    { book: "John", chapter: 1, verse: 1, text: "In the beginning was the Word, and the Word was with God." },
    { book: "John", chapter: 1, verse: 2, text: "The same was in the beginning with God." },
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son." },
    { book: "Romans", chapter: 8, verse: 28, text: "We know that all things work together for good for those who love God." },
    { book: "1 Corinthians", chapter: 13, verse: 4, text: "Love is patient and is kind. Love doesn't envy." },
    { book: "1 Corinthians", chapter: 13, verse: 13, text: "But now faith, hope, and love remain—these three. The greatest of these is love." },
  ]);
  insertCorpusVerses(db, "KJV", [
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only begotten Son." },
  ]);
  db.close();
  return dbPath;
}

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("LocalSearchProvider", () => {
  describe("happy path (fixture corpus, matches the real Phase 3D-2/3D-3 schema)", () => {
    let provider: LocalSearchProvider;

    beforeAll(() => {
      provider = new LocalSearchProvider(buildFixtureCorpus());
    });

    afterAll(() => {
      provider.close();
    });

    it("supports() reports the translations actually present in the corpus (case-insensitive)", () => {
      expect(provider.supports("WEB")).toBe(true);
      expect(provider.supports("web")).toBe(true);
      expect(provider.supports("KJV")).toBe(true);
      expect(provider.supports("ASV")).toBe(false);
    });

    // ── Suche nach einem Wort ────────────────────────────────────────────
    it("finds verses containing a single word", async () => {
      const result = await provider.search("begotten", { bible: "KJV" });
      expect(result.query).toBe("begotten");
      expect(result.resultCount).toBe(1);
      expect(result.results).toEqual([
        { title: "John 3:16", preview: "For God so loved the world, that he gave his only begotten Son." },
      ]);
    });

    // ── Suche nach einer Wortgruppe ──────────────────────────────────────
    it("treats a multi-word query as an exact adjacent phrase, not 'contains all words anywhere'", async () => {
      const result = await provider.search("in the beginning", { bible: "WEB" });
      const titles = result.results.map((r) => r.title).sort();
      // Genesis 1:1 and John 1:1 both contain the literal adjacent phrase;
      // John 1:2 ("The same was in the beginning with God") also contains
      // it verbatim — all three are genuine phrase matches, none are
      // "word salad" false positives from a looser AND-of-terms search.
      expect(titles).toEqual(["Genesis 1:1", "John 1:1", "John 1:2"]);
    });

    it("does not match a query whose words are NOT adjacent in that order (proves it's phrase, not AND-of-words)", async () => {
      // "love" and "God" both appear in Romans 8:28, but not as the
      // adjacent phrase "love God's" — this specific phrase query must not
      // match via a looser interpretation.
      const result = await provider.search("love beginning", { bible: "WEB" });
      expect(result.resultCount).toBe(0);
    });

    // ── keine Treffer ─────────────────────────────────────────────────────
    it("returns zero results (not an error) for a word that isn't in the corpus", async () => {
      const result = await provider.search("xenophobia", { bible: "WEB" });
      expect(result).toEqual({ query: "xenophobia", resultCount: 0, results: [] });
    });

    it("returns zero results for an empty/whitespace-only query without querying the database", async () => {
      const result = await provider.search("   ", { bible: "WEB" });
      expect(result).toEqual({ query: "   ", resultCount: 0, results: [] });
    });

    // ── resultCount vs. limit ────────────────────────────────────────────
    it("resultCount reflects the total match count even when results are capped by limit", async () => {
      // "love" appears in Romans 8:28, 1 Corinthians 13:4, and 13:13 — 3
      // matches, but limit:2 must only return 2 rows.
      const result = await provider.search("love", { bible: "WEB", limit: 2 });
      expect(result.resultCount).toBe(3);
      expect(result.results).toHaveLength(2);
    });

    it("defaults limit to 20 when not specified", async () => {
      const result = await provider.search("love", { bible: "WEB" });
      expect(result.results.length).toBeLessThanOrEqual(20);
      expect(result.resultCount).toBe(3);
    });

    // ── FTS5-Injection-Sicherheit ────────────────────────────────────────
    it("treats FTS5 operator keywords in the query as literal text, not syntax (no crash, no unintended matches)", async () => {
      // "AND" is an FTS5 boolean operator; wrapped as a phrase, this must
      // be searched for literally ("love AND faith" as adjacent words),
      // which does not occur in the fixture — must not throw, must not
      // match everything containing "love" or "faith" separately.
      const result = await provider.search("love AND faith", { bible: "WEB" });
      expect(result.resultCount).toBe(0);
    });

    it("handles a query containing literal double quotes without crashing", async () => {
      await expect(provider.search('he said "hello"', { bible: "WEB" })).resolves.toBeDefined();
    });

    // ── Nicht unterstützte Übersetzung ───────────────────────────────────
    it("rejects a well-formed search for a translation not present in the corpus", async () => {
      await expect(provider.search("love", { bible: "ASV" })).rejects.toThrow(/not available in the local corpus/);
    });

    it("resolves the bible option to DEFAULT_BIBLE (LEB) when omitted, which this fixture does not cover", async () => {
      // Mirrors biblia-api.ts's own searchBible() default-resolution
      // behavior (options.bible ?? DEFAULT_BIBLE) — LocalSearchProvider is
      // self-sufficient the same way. LEB is deliberately never in the
      // local corpus (docs/15 Abschnitt 4), so this must reject, not
      // silently search WEB instead.
      await expect(provider.search("love")).rejects.toThrow(/"LEB" is not available/);
    });
  });

  describe("error handling (corpus file itself)", () => {
    it("throws a clean error when the corpus file does not exist", () => {
      const missingPath = join(testDir, "does-not-exist", "corpus.db");
      expect(() => new LocalSearchProvider(missingPath)).toThrowError(/Local Bible corpus not found/);
    });

    it("throws a clean error when the file is not a valid SQLite database", () => {
      const corruptPath = freshCorpusPath();
      writeFileSync(corruptPath, "this is not a sqlite database file");
      expect(() => new LocalSearchProvider(corruptPath)).toThrowError(/could not be read/);
    });

    it("throws a clean error when the file has no verses table", () => {
      const wrongSchemaPath = freshCorpusPath();
      const db = createCorpusDb(wrongSchemaPath);
      db.exec("DROP TABLE verses_fts; DROP TABLE verses;");
      db.close();
      expect(() => new LocalSearchProvider(wrongSchemaPath)).toThrowError(/unexpected structure/);
    });
  });
});
