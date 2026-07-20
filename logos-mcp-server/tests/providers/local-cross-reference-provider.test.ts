import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import {
  createCrossReferenceCorpusDb,
  insertCrossReferences,
  type RawCrossReference,
} from "../../scripts/build-cross-reference-corpus.js";
import {
  LocalCrossReferenceProvider,
  PREVIEW_UNAVAILABLE_TEXT,
} from "../../src/services/providers/local-cross-reference-provider.js";
import { DEFAULT_BIBLE } from "../../src/config.js";
import type { BibleTextProvider } from "../../src/services/providers/bible-text-provider.js";

// Builds fixture corpora with the *real* production build-pipeline
// functions (createCrossReferenceCorpusDb/insertCrossReferences from Phase
// 4C-2), so the schema tested here can never drift from the schema the real
// corpus actually has — same approach as
// tests/providers/local-bible-text-provider.test.ts.
const testDir = mkdtempSync(join(tmpdir(), "logos-mcp-local-cross-reference-provider-test-"));

function freshCorpusPath(): string {
  return join(testDir, `corpus-${randomUUID()}.db`);
}

function buildFixtureCorpus(): string {
  const dbPath = freshCorpusPath();
  const db = createCrossReferenceCorpusDb(dbPath);
  const refs: RawCrossReference[] = [
    // Real, verified values for John 3:16 (see docs/30 Abschnitt 2.3) —
    // deliberately inserted out of vote order, to prove ORDER BY votes DESC.
    {
      fromBook: "John", fromChapter: 3, fromVerse: 16,
      toBook: "Romans", toChapter: 5, toVerse: 8,
      toEndBook: "Romans", toEndChapter: 5, toEndVerse: 8,
      votes: 977,
    },
    {
      fromBook: "John", fromChapter: 3, fromVerse: 16,
      toBook: "1 John", toChapter: 4, toVerse: 9,
      toEndBook: "1 John", toEndChapter: 4, toEndVerse: 10,
      votes: 691,
    },
    {
      fromBook: "John", fromChapter: 3, fromVerse: 16,
      toBook: "John", toChapter: 10, toVerse: 28,
      toEndBook: "John", toEndChapter: 10, toEndVerse: 28,
      votes: 316,
    },
    // Cross-chapter, same-book range (real value, see docs/30 Abschnitt 2.3).
    {
      fromBook: "Psalms", fromChapter: 23, fromVerse: 1,
      toBook: "Psalms", toChapter: 79, toVerse: 13,
      toEndBook: "Psalms", toEndChapter: 80, toEndVerse: 1,
      votes: 59,
    },
    // Cross-book range (rare but real shape, see docs/30 Abschnitt 2.4).
    {
      fromBook: "Genesis", fromChapter: 1, fromVerse: 1,
      toBook: "1 Kings", toChapter: 22, toVerse: 53,
      toEndBook: "2 Kings", toEndChapter: 1, toEndVerse: 1,
      votes: 5,
    },
  ];
  insertCrossReferences(db, refs);
  db.close();
  return dbPath;
}

// `supportedTranslations` is optional — omitted, `supports()` always
// returns true, so tests unrelated to translation-availability logic (most
// of them) don't need to know or care what DEFAULT_BIBLE currently
// resolves to. Only the specific "rejects an unsupported translation" test
// passes a restricted list.
function fakeBibleTextProvider(
  textByRef: Record<string, string>,
  supportedTranslations?: string[]
): BibleTextProvider {
  return {
    supports: (translation: string) =>
      supportedTranslations ? supportedTranslations.includes(translation.toUpperCase()) : true,
    resolveText: vi.fn(async (passage: string, translation: string) => {
      const text = textByRef[passage];
      if (text === undefined) throw new Error(`No fixture text for "${passage}"`);
      return { passage, text, bible: translation };
    }),
  };
}

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("LocalCrossReferenceProvider", () => {
  describe("happy path (fixture corpus, matches the real Phase 4C-2 schema)", () => {
    let provider: LocalCrossReferenceProvider;
    let bibleText: BibleTextProvider;

    beforeAll(() => {
      bibleText = fakeBibleTextProvider({
        "Romans 5:8": "For while we were yet sinners, Christ died for us.",
        "1 John 4:9": "By this was God's love revealed in us.",
        "John 10:28": "I give eternal life to them.",
        "Psalms 79:13": "So we, your people and sheep of your pasture...",
        "1 Kings 22:53": "He served Baal, and worshiped him.",
      });
      provider = new LocalCrossReferenceProvider(bibleText, buildFixtureCorpus());
    });

    afterAll(() => {
      provider.close();
    });

    it("looks up cross-references for a known passage, ordered by votes descending", async () => {
      const result = await provider.findCrossReferences("John 3:16");
      expect(result.passage).toBe("John 3:16");
      expect(result.results).toEqual([
        { title: "Romans 5:8", preview: "For while we were yet sinners, Christ died for us." },
        { title: "1 John 4:9-10", preview: "By this was God's love revealed in us." },
        { title: "John 10:28", preview: "I give eternal life to them." },
      ]);
    });

    it("returns an empty results array (not an error) for a valid passage with no cross-references", async () => {
      const result = await provider.findCrossReferences("3 John 1:1");
      expect(result).toEqual({ passage: "3 John 1:1", results: [] });
    });

    it("formats a same-book, cross-chapter range title correctly", async () => {
      const result = await provider.findCrossReferences("Psalms 23:1");
      expect(result.results).toEqual([
        { title: "Psalms 79:13-80:1", preview: "So we, your people and sheep of your pasture..." },
      ]);
    });

    it("formats a cross-book range title correctly", async () => {
      const result = await provider.findCrossReferences("Genesis 1:1");
      expect(result.results).toEqual([
        { title: "1 Kings 22:53-2 Kings 1:1", preview: "He served Baal, and worshiped him." },
      ]);
    });

    it("fetches the preview from only the starting verse of a range, not the full range (documented scope decision)", async () => {
      await provider.findCrossReferences("Psalms 23:1");
      expect(bibleText.resolveText).toHaveBeenCalledWith("Psalms 79:13", DEFAULT_BIBLE);
      expect(bibleText.resolveText).not.toHaveBeenCalledWith("Psalms 80:1", DEFAULT_BIBLE);
    });

    it("rejects a whole-chapter reference (cross-references require a specific verse)", async () => {
      await expect(provider.findCrossReferences("John 3")).rejects.toThrow(
        /require a specific verse/
      );
    });

    it("propagates parseReference's error for an unparseable reference", async () => {
      await expect(provider.findCrossReferences("this is not a reference")).rejects.toThrow(
        /Cannot parse reference/
      );
    });

    it("propagates parseReference's error for an unrecognized book", async () => {
      await expect(provider.findCrossReferences("Foobar 1:1")).rejects.toThrow(/Unknown book/);
    });

    it("rejects a translation not supported by the injected BibleTextProvider", async () => {
      const restrictedBibleText = fakeBibleTextProvider({}, ["WEB"]);
      const restrictedProvider = new LocalCrossReferenceProvider(restrictedBibleText, buildFixtureCorpus());
      try {
        await expect(restrictedProvider.findCrossReferences("John 3:16", undefined, "ASV")).rejects.toThrow(
          /not available in the local corpus/
        );
        expect(restrictedBibleText.resolveText).not.toHaveBeenCalled();
      } finally {
        restrictedProvider.close();
      }
    });
  });

  describe("bible pass-through", () => {
    // buildFixtureCorpus() has 3 cross-references for John 3:16, so every
    // fake provider here must supply preview text for all 3 targets, not
    // just the one under assertion.
    const johnTargets = { "Romans 5:8": "KJV-worded preview.", "1 John 4:9": "...", "John 10:28": "..." };

    it("uses an explicit bible for both the availability check and the preview lookup", async () => {
      const bibleText = fakeBibleTextProvider(johnTargets, ["KJV"]);
      const provider = new LocalCrossReferenceProvider(bibleText, buildFixtureCorpus());
      try {
        const result = await provider.findCrossReferences("John 3:16", undefined, "KJV");
        expect(result.results[0]).toEqual({ title: "Romans 5:8", preview: "KJV-worded preview." });
        expect(bibleText.resolveText).toHaveBeenCalledWith("Romans 5:8", "KJV");
      } finally {
        provider.close();
      }
    });

    it("falls back to DEFAULT_BIBLE when bible is omitted", async () => {
      const bibleText = fakeBibleTextProvider(
        { "Romans 5:8": "Default-bible preview.", "1 John 4:9": "...", "John 10:28": "..." },
        [DEFAULT_BIBLE]
      );
      const provider = new LocalCrossReferenceProvider(bibleText, buildFixtureCorpus());
      try {
        await provider.findCrossReferences("John 3:16");
        expect(bibleText.resolveText).toHaveBeenCalledWith("Romans 5:8", DEFAULT_BIBLE);
      } finally {
        provider.close();
      }
    });
  });

  // Regression coverage for the live incident: a curated cross-reference
  // row must survive even when fetching its preview text fails (e.g.
  // DEFAULT_BIBLE="LEB" isn't in the local Bible-text corpus and Biblia,
  // the fallback, rejects the request with a 403 — see docs/28).
  describe("preview-text failure resilience (bugfix: a failed preview must not drop the hit)", () => {
    it("keeps a single local hit with the sentinel preview when its text lookup fails", async () => {
      // Psalms 23:1 has exactly one curated target (Psalms 79:13) in the
      // fixture corpus; omitting it from the fixture map makes
      // fakeBibleTextProvider's resolveText throw for that one reference,
      // simulating a Biblia failure.
      const bibleText = fakeBibleTextProvider({});
      const provider = new LocalCrossReferenceProvider(bibleText, buildFixtureCorpus());
      try {
        const result = await provider.findCrossReferences("Psalms 23:1");
        expect(result.results).toEqual([
          { title: "Psalms 79:13-80:1", preview: PREVIEW_UNAVAILABLE_TEXT },
        ]);
      } finally {
        provider.close();
      }
    });

    it("keeps all hits when only one of several preview texts fails, using the sentinel for that one only", async () => {
      // John 3:16 has 3 curated targets: Romans 5:8, 1 John 4:9, John 10:28.
      // Only "1 John 4:9" is omitted from the fixture map, so only its
      // lookup throws — the other two must resolve normally.
      const bibleText = fakeBibleTextProvider({
        "Romans 5:8": "For while we were yet sinners, Christ died for us.",
        "John 10:28": "I give eternal life to them.",
      });
      const provider = new LocalCrossReferenceProvider(bibleText, buildFixtureCorpus());
      try {
        const result = await provider.findCrossReferences("John 3:16");
        expect(result.results).toEqual([
          { title: "Romans 5:8", preview: "For while we were yet sinners, Christ died for us." },
          { title: "1 John 4:9-10", preview: PREVIEW_UNAVAILABLE_TEXT },
          { title: "John 10:28", preview: "I give eternal life to them." },
        ]);
      } finally {
        provider.close();
      }
    });
  });

  describe("error handling (corpus file itself)", () => {
    const bibleText = fakeBibleTextProvider({});

    it("throws a clean error when the corpus file does not exist", () => {
      const missingPath = join(testDir, "does-not-exist", "corpus.db");
      expect(() => new LocalCrossReferenceProvider(bibleText, missingPath)).toThrowError(
        /Local cross-reference corpus not found/
      );
    });

    it("throws a clean error when the file is not a valid SQLite database", () => {
      // better-sqlite3 validates file format lazily, on the first statement
      // (opening a garbage file does not throw by itself) — see
      // local-bible-text-provider.ts / catalog-reader.ts for the same
      // documented behavior.
      const corruptPath = freshCorpusPath();
      writeFileSync(corruptPath, "this is not a sqlite database file");
      expect(() => new LocalCrossReferenceProvider(bibleText, corruptPath)).toThrowError(
        /could not be read/
      );
    });

    it("throws a clean error when the file has no cross_references table", () => {
      const wrongSchemaPath = freshCorpusPath();
      const db = createCrossReferenceCorpusDb(wrongSchemaPath);
      db.exec("DROP TABLE cross_references;");
      db.close();
      expect(() => new LocalCrossReferenceProvider(bibleText, wrongSchemaPath)).toThrowError(
        /unexpected structure/
      );
    });
  });
});
