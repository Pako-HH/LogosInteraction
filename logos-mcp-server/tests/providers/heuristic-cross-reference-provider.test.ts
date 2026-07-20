import { describe, it, expect, vi } from "vitest";
import { DEFAULT_BIBLE } from "../../src/config.js";
import { HeuristicCrossReferenceProvider } from "../../src/services/providers/heuristic-cross-reference-provider.js";
import type { BibleTextProvider } from "../../src/services/providers/bible-text-provider.js";
import type { SearchProvider } from "../../src/services/providers/search-provider.js";

function fakeBibleTextProvider(text: string): BibleTextProvider {
  return {
    supports: () => true,
    resolveText: vi.fn().mockResolvedValue({ passage: "irrelevant", text, bible: "LEB" }),
  };
}

function fakeSearchProvider(
  results: Array<{ title: string; preview: string }>
): SearchProvider {
  return {
    supports: () => true,
    search: vi.fn().mockResolvedValue({ query: "irrelevant", resultCount: results.length, results }),
  };
}

describe("HeuristicCrossReferenceProvider", () => {
  it("uses key_terms directly as the search query when provided, without resolving passage text", async () => {
    const bibleText = fakeBibleTextProvider("should not be read");
    const search = fakeSearchProvider([{ title: "Romans 8:28", preview: "..." }]);
    const provider = new HeuristicCrossReferenceProvider(bibleText, search);

    await provider.findCrossReferences("Romans 8:28", "justification faith");

    expect(bibleText.resolveText).not.toHaveBeenCalled();
    expect(search.search).toHaveBeenCalledExactlyOnceWith("justification faith", { limit: 15, bible: DEFAULT_BIBLE });
  });

  it("extracts stopword-filtered keywords (>3 chars, first 5) from the passage text when no key_terms given", async () => {
    // "For God so loved the world that he gave his only Son" — replicates the
    // exact filter (length > 3, not a stopword) previously inline in index.ts.
    const bibleText = fakeBibleTextProvider("For God so loved the world that he gave his only Son");
    const search = fakeSearchProvider([]);
    const provider = new HeuristicCrossReferenceProvider(bibleText, search);

    await provider.findCrossReferences("John 3:16");

    expect(bibleText.resolveText).toHaveBeenCalledExactlyOnceWith("John 3:16", DEFAULT_BIBLE);
    expect(search.search).toHaveBeenCalledExactlyOnceWith("loved world gave only", { limit: 15, bible: DEFAULT_BIBLE });
  });

  it("caps keyword extraction at the first 5 qualifying words", async () => {
    const bibleText = fakeBibleTextProvider(
      "elephant giraffe mountain building keyboard umbrella telephone"
    );
    const search = fakeSearchProvider([]);
    const provider = new HeuristicCrossReferenceProvider(bibleText, search);

    await provider.findCrossReferences("Genesis 1:1");

    expect(search.search).toHaveBeenCalledExactlyOnceWith(
      "elephant giraffe mountain building keyboard",
      { limit: 15, bible: DEFAULT_BIBLE }
    );
  });

  it("filters out a self-reference hit (case-insensitive) from the results", async () => {
    const bibleText = fakeBibleTextProvider("grace mercy kindness patience goodness");
    const search = fakeSearchProvider([
      { title: "romans 8:28", preview: "self-reference, different case" },
      { title: "Ephesians 2:8", preview: "genuine cross-reference" },
    ]);
    const provider = new HeuristicCrossReferenceProvider(bibleText, search);

    const result = await provider.findCrossReferences("Romans 8:28");

    expect(result.results).toEqual([{ title: "Ephesians 2:8", preview: "genuine cross-reference" }]);
  });

  it("returns an empty results array (not an error) when nothing remains after filtering", async () => {
    const bibleText = fakeBibleTextProvider("grace mercy kindness patience goodness");
    const search = fakeSearchProvider([{ title: "Romans 8:28", preview: "only hit is the passage itself" }]);
    const provider = new HeuristicCrossReferenceProvider(bibleText, search);

    const result = await provider.findCrossReferences("Romans 8:28");

    expect(result).toEqual({ passage: "Romans 8:28", results: [] });
  });

  it("echoes the requested passage back in the result envelope", async () => {
    const bibleText = fakeBibleTextProvider("grace mercy kindness patience goodness");
    const search = fakeSearchProvider([]);
    const provider = new HeuristicCrossReferenceProvider(bibleText, search);

    const result = await provider.findCrossReferences("Psalm 23:1");

    expect(result.passage).toBe("Psalm 23:1");
  });

  // Phase 3 close-out (docs/24): `bible` now threads through to BOTH the
  // text lookup and the search call, closing the gap where
  // get_cross_references could never reach the local corpus regardless of
  // what translation the caller wanted.
  describe("bible pass-through (Phase 3 close-out)", () => {
    it("passes an explicit bible to the text lookup, not just DEFAULT_BIBLE", async () => {
      const bibleText = fakeBibleTextProvider("love patient kind envy");
      const search = fakeSearchProvider([]);
      const provider = new HeuristicCrossReferenceProvider(bibleText, search);

      await provider.findCrossReferences("1 Corinthians 13:4", undefined, "WEB");

      expect(bibleText.resolveText).toHaveBeenCalledExactlyOnceWith("1 Corinthians 13:4", "WEB");
    });

    it("passes the same explicit bible to the search call as the text lookup", async () => {
      const bibleText = fakeBibleTextProvider("love patient kind envy proud");
      const search = fakeSearchProvider([]);
      const provider = new HeuristicCrossReferenceProvider(bibleText, search);

      await provider.findCrossReferences("1 Corinthians 13:4", undefined, "WEB");

      expect(search.search).toHaveBeenCalledExactlyOnceWith("love patient kind envy proud", {
        limit: 15,
        bible: "WEB",
      });
    });

    it("passes an explicit bible to the search call even when key_terms bypasses the text lookup", async () => {
      const bibleText = fakeBibleTextProvider("should not be read");
      const search = fakeSearchProvider([]);
      const provider = new HeuristicCrossReferenceProvider(bibleText, search);

      await provider.findCrossReferences("Romans 8:28", "grace faith", "KJV");

      expect(bibleText.resolveText).not.toHaveBeenCalled();
      expect(search.search).toHaveBeenCalledExactlyOnceWith("grace faith", { limit: 15, bible: "KJV" });
    });

    it("still defaults to DEFAULT_BIBLE for both calls when bible is omitted (unchanged prior behavior)", async () => {
      const bibleText = fakeBibleTextProvider("grace mercy kindness patience goodness");
      const search = fakeSearchProvider([]);
      const provider = new HeuristicCrossReferenceProvider(bibleText, search);

      await provider.findCrossReferences("Psalm 23:1");

      expect(bibleText.resolveText).toHaveBeenCalledExactlyOnceWith("Psalm 23:1", DEFAULT_BIBLE);
      expect(search.search).toHaveBeenCalledExactlyOnceWith("grace mercy kindness patience goodness", {
        limit: 15,
        bible: DEFAULT_BIBLE,
      });
    });
  });
});
