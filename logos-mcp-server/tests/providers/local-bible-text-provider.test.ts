import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { createCorpusDb, insertCorpusVerses } from "../../scripts/build-bible-corpus.js";
import { LocalBibleTextProvider } from "../../src/services/providers/local-bible-text-provider.js";

// Builds fixture corpora with the *real* production build-pipeline
// functions (createCorpusDb/insertCorpusVerses from Phase 3D-2/3D-3), so
// the schema tested here can never drift from the schema the real corpus
// actually has.
const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-local-bible-text-provider-test-"));

function freshCorpusPath(): string {
  return join(testDir, `corpus-${randomUUID()}.db`);
}

function buildFixtureCorpus(): string {
  const dbPath = freshCorpusPath();
  const db = createCorpusDb(dbPath);
  insertCorpusVerses(db, "WEB", [
    { book: "Genesis", chapter: 1, verse: 1, text: "In the beginning, God created the heavens and the earth." },
    { book: "Genesis", chapter: 1, verse: 2, text: "The earth was formless and empty." },
    { book: "Genesis", chapter: 1, verse: 3, text: "God said, 'Let there be light,' and there was light." },
    { book: "Genesis", chapter: 2, verse: 1, text: "The heavens, the earth, and all their vast array were finished." },
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son..." },
    { book: "Romans", chapter: 8, verse: 28, text: "We know that all things work together for good..." },
    { book: "Romans", chapter: 8, verse: 29, text: "For whom he foreknew, he also predestined..." },
    { book: "Romans", chapter: 8, verse: 30, text: "Whom he predestined, those he also called..." },
    // Real, verified property of the WEB corpus (see docs/19): a verse
    // that legitimately has no text (omitted by the translators, kept as
    // a numbered placeholder) — NOT the same as "verse doesn't exist".
    { book: "Romans", chapter: 16, verse: 25, text: "" },
    // Psalm 117 is the Bible's shortest chapter (2 verses) — used whole
    // and complete here for the "entire chapter" test.
    { book: "Psalms", chapter: 117, verse: 1, text: "Praise Yahweh, all you nations!" },
    { book: "Psalms", chapter: 117, verse: 2, text: "For his loving kindness is great toward us." },
  ]);
  insertCorpusVerses(db, "KJV", [
    { book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only begotten Son..." },
  ]);
  db.close();
  return dbPath;
}

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("LocalBibleTextProvider", () => {
  describe("happy path (fixture corpus, matches the real Phase 3D-2/3D-3 schema)", () => {
    let provider: LocalBibleTextProvider;

    beforeAll(() => {
      provider = new LocalBibleTextProvider(buildFixtureCorpus());
    });

    afterAll(() => {
      provider.close();
    });

    it("supports() reports the translations actually present in the corpus (case-insensitive)", () => {
      expect(provider.supports("WEB")).toBe(true);
      expect(provider.supports("web")).toBe(true);
      expect(provider.supports("KJV")).toBe(true);
      expect(provider.supports("ASV")).toBe(false);
      expect(provider.supports("NOSUCHCODE")).toBe(false);
    });

    // ── Einzelvers ──────────────────────────────────────────────────────
    it("resolves a single verse", async () => {
      const result = await provider.resolveText("John 3:16", "WEB");
      expect(result).toEqual({
        passage: "John 3:16",
        text: "For God so loved the world, that he gave his only born Son...",
        bible: "WEB",
      });
    });

    it("keeps different translations of the same verse independent", async () => {
      const web = await provider.resolveText("John 3:16", "WEB");
      const kjv = await provider.resolveText("John 3:16", "KJV");
      expect(web.text).toContain("only born Son");
      expect(kjv.text).toContain("only begotten Son");
    });

    // ── Versbereich ──────────────────────────────────────────────────────
    it("resolves a verse range within one chapter and composes the verses in order", async () => {
      const result = await provider.resolveText("Romans 8:28-30", "WEB");
      expect(result.passage).toBe("Romans 8:28-30");
      expect(result.bible).toBe("WEB");
      expect(result.text).toBe(
        "We know that all things work together for good... For whom he foreknew, he also predestined... Whom he predestined, those he also called..."
      );
    });

    it("resolves a cross-chapter verse range (Genesis 1:2-2:1)", async () => {
      const result = await provider.resolveText("Genesis 1:2-2:1", "WEB");
      expect(result.text).toBe(
        "The earth was formless and empty. God said, 'Let there be light,' and there was light. The heavens, the earth, and all their vast array were finished."
      );
    });

    // ── ganzes Kapitel ───────────────────────────────────────────────────
    it("resolves an entire chapter (Psalm 117, the Bible's shortest, both verses)", async () => {
      const result = await provider.resolveText("Psalms 117", "WEB");
      expect(result.text).toBe(
        "Praise Yahweh, all you nations! For his loving kindness is great toward us."
      );
    });

    // ── ungültige Referenz ───────────────────────────────────────────────
    it("rejects an unparseable reference", async () => {
      await expect(provider.resolveText("this is not a reference", "WEB")).rejects.toThrow(
        /Cannot parse reference/
      );
    });

    // ── unbekanntes Buch ─────────────────────────────────────────────────
    it("rejects a reference to an unrecognized book", async () => {
      await expect(provider.resolveText("Foobar 1:1", "WEB")).rejects.toThrow(/Unknown book/);
    });

    // ── leeres Ergebnis ──────────────────────────────────────────────────
    it("resolves successfully with empty text for a verse that legitimately has none (not an error)", async () => {
      const result = await provider.resolveText("Romans 16:25", "WEB");
      expect(result).toEqual({ passage: "Romans 16:25", text: "", bible: "WEB" });
    });

    // ── Zusaetzlich: klare Fehlerbehandlung ─────────────────────────────
    it("rejects a well-formed reference to a translation not present in the corpus", async () => {
      await expect(provider.resolveText("John 3:16", "ASV")).rejects.toThrow(/not available in the local corpus/);
    });

    it("rejects a well-formed reference for which no rows exist at all (distinct from an empty-text verse)", async () => {
      // Genesis 1:99 — valid book/chapter, but no such verse was inserted
      // (unlike Romans 16:25, there is no row here at all, not just an
      // empty one).
      await expect(provider.resolveText("Genesis 1:99", "WEB")).rejects.toThrow(/No verses found/);
    });
  });

  describe("error handling (corpus file itself)", () => {
    it("throws a clean error when the corpus file does not exist", () => {
      const missingPath = join(testDir, "does-not-exist", "corpus.db");
      expect(() => new LocalBibleTextProvider(missingPath)).toThrowError(/Local Bible corpus not found/);
    });

    it("throws a clean error when the file is not a valid SQLite database", () => {
      // better-sqlite3 validates file format lazily, on the first
      // statement (opening a garbage file does not throw by itself) — see
      // catalog-reader.ts for the same documented behavior.
      const corruptPath = freshCorpusPath();
      writeFileSync(corruptPath, "this is not a sqlite database file");
      expect(() => new LocalBibleTextProvider(corruptPath)).toThrowError(/could not be read/);
    });

    it("throws a clean error when the file has no verses table", () => {
      const wrongSchemaPath = freshCorpusPath();
      const db = createCorpusDb(wrongSchemaPath);
      db.exec("DROP TABLE verses_fts; DROP TABLE verses;");
      db.close();
      expect(() => new LocalBibleTextProvider(wrongSchemaPath)).toThrowError(/unexpected structure/);
    });
  });
});
